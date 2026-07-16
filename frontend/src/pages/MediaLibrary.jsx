import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { mediaService } from "../services/mediaService";
import EmptyTableRow from "../components/common/EmptyTableRow";

function normalizeType(value) {
  const token = String(value || "unknown").toLowerCase();
  if (token.includes("video")) return "Video";
  if (token.includes("audio")) return "Audio";
  if (token.includes("image")) return "Image";
  return "Unknown";
}

export default function MediaLibrary() {
  const [assets, setAssets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadLibrary() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await mediaService.listLibrary();
        if (!mounted) return;
        setAssets(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load media library.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadLibrary();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return assets.map((item, index) => ({
      title: item.title || item.name || `Asset ${index + 1}`,
      type: normalizeType(item.type || item.mediaType),
      category: item.category || "Uncategorized",
      duration: item.duration || "N/A",
      date: item.date || item.indexedAt || "Unknown",
      status: item.status || "Unknown",
      location: item.location || item.path || "Waiting for Provider",
    }));
  }, [assets]);
  const hasData = rows.length > 0;

  return (
    <ModulePage
      title="Media Library"
      subtitle="Search approved assets, metadata records, and retention status in the TELEMAP production repository."
      summary="Media library entries are loaded from backend gateway API responses."
      stats={[
        { label: "Indexed Assets", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Current backend response" : "Not Connected" },
        { label: "Approved", value: hasData ? String(rows.filter((item) => String(item.status).toLowerCase() === "approved").length) : "—", tone: "green", detail: hasData ? "Ready assets" : "Waiting for Provider" },
        { label: "Review", value: hasData ? String(rows.filter((item) => String(item.status).toLowerCase().includes("review")).length) : "—", tone: "purple", detail: hasData ? "Needs operator review" : "Waiting for Provider" },
        { label: "Unknown", value: hasData ? String(rows.filter((item) => String(item.status).toLowerCase() === "unknown").length) : "—", tone: "amber", detail: "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Open asset locator</button>
          <button type="button" className="ghost-button">Refresh metadata index</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /media/library/assets",
        requestModel: "MediaLibraryRequest",
        responseModel: "MediaLibraryResponse",
        loadingState: "Load indexed media records and storage references.",
        emptyState: "Show that no approved assets are available in the library.",
        errorState: "Display metadata index retrieval error and retry options.",
      }}
      searchPlaceholder="Search asset"
      filters={["All", "Video", "Image", "Audio", "Unknown"]}
      tableTitle="Asset repository"
      tableSubtitle="Approved, archived, and review-state assets mapped to production storage"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No media records were returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((asset) => {
          const matchesSearch = asset.title.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || asset.type === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Type</th>
                <th>Category</th>
                <th>Duration</th>
                <th>Indexed</th>
                <th>Status</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={7} message="No Data Available" />
              ) : (
                filtered.map((asset) => (
                  <tr key={asset.title}>
                    <td>{asset.title}</td>
                    <td>{asset.type}</td>
                    <td>{asset.category}</td>
                    <td>{asset.duration}</td>
                    <td>{asset.date}</td>
                    <td>{asset.status}</td>
                    <td>{asset.location}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        );
      }}
    </ModulePage>
  );
}
