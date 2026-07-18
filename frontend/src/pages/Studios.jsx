import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import { reporterControlService } from "../services/reporterControlService";

export default function Studios() {
  const [studios, setStudios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await reporterControlService.listStudios();
        if (!mounted) return;
        setStudios(data);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load studios.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const available = studios.filter((item) => String(item.status || "").toLowerCase() === "available").length;
    const totalCapacity = studios.reduce((sum, item) => sum + Number(item.capacity || 0), 0);
    return [
      { label: "Studios", value: studios.length ? String(studios.length) : "—", tone: "blue", detail: "Control room locations" },
      { label: "Available", value: studios.length ? String(available) : "—", tone: "green", detail: "Ready to book" },
      { label: "Capacity", value: studios.length ? String(totalCapacity) : "—", tone: "teal", detail: "Total seat count" },
    ];
  }, [studios]);

  return (
    <ModulePage
      title="Studios"
      subtitle="Studio inventory and room readiness records from TMOS backend services."
      summary="Phase 3.1 placeholder view for studio management."
      stats={stats}
      apiSpec={{
        endpoint: "GET /studios",
        requestModel: "StudioListRequest",
        responseModel: "StudioListResponse",
        loadingState: "Load studio catalog records from backend services.",
        emptyState: "Show that no studios are currently registered.",
        errorState: "Display backend integration errors for studios.",
      }}
      searchPlaceholder="Search studios"
      filters={["All", "Available", "Unavailable"]}
      tableTitle="Studio inventory"
      tableSubtitle="Room location, capacity, and operational status"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No studio records returned yet."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = studios.filter((item) => {
          const haystack = `${item.name || ""} ${item.location || ""}`.toLowerCase();
          const matchesSearch = haystack.includes(searchValue.toLowerCase());
          const status = String(item.status || "unavailable").toLowerCase();
          const matchesFilter = activeFilter === "All"
            || (activeFilter === "Available" && status === "available")
            || (activeFilter === "Unavailable" && status !== "available");
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Capacity</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={5} message="No Data Available" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name || "N/A"}</td>
                    <td>{item.location || "N/A"}</td>
                    <td>{item.capacity ?? "N/A"}</td>
                    <td>{item.status || "unavailable"}</td>
                    <td>{item.notes || "—"}</td>
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
