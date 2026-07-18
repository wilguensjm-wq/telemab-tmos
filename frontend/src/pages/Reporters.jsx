import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import { reporterControlService } from "../services/reporterControlService";

export default function Reporters() {
  const [reporters, setReporters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await reporterControlService.listReporters();
        if (!mounted) return;
        setReporters(data);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load reporters.");
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
    return [
      { label: "Reporters", value: reporters.length ? String(reporters.length) : "—", tone: "blue", detail: "Roster records" },
      {
        label: "Active",
        value: reporters.length ? String(reporters.filter((item) => String(item.status || "").toLowerCase() === "active").length) : "—",
        tone: "green",
        detail: "Available for assignment",
      },
      {
        label: "Inactive",
        value: reporters.length ? String(reporters.filter((item) => String(item.status || "").toLowerCase() !== "active").length) : "—",
        tone: "amber",
        detail: "Unavailable or on hold",
      },
    ];
  }, [reporters]);

  return (
    <ModulePage
      title="Reporters"
      subtitle="Reporter roster and control room staffing records backed by TMOS backend APIs."
      summary="Phase 3.1 placeholder view for reporter roster management."
      stats={stats}
      apiSpec={{
        endpoint: "GET /reporters",
        requestModel: "ReporterListRequest",
        responseModel: "ReporterListResponse",
        loadingState: "Load reporter roster records from backend services.",
        emptyState: "Show that no reporters are currently registered.",
        errorState: "Display backend integration errors for reporter roster.",
      }}
      searchPlaceholder="Search reporters"
      filters={["All", "Active", "Inactive"]}
      tableTitle="Reporter roster"
      tableSubtitle="Identity and assignment readiness for on-air staff"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No reporter records returned yet."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = reporters.filter((item) => {
          const haystack = `${item.fullName || ""} ${item.email || ""}`.toLowerCase();
          const matchesSearch = haystack.includes(searchValue.toLowerCase());
          const status = String(item.status || "inactive").toLowerCase();
          const matchesFilter = activeFilter === "All"
            || (activeFilter === "Active" && status === "active")
            || (activeFilter === "Inactive" && status !== "active");
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
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
                    <td>{item.fullName || "N/A"}</td>
                    <td>{item.email || "N/A"}</td>
                    <td>{item.phone || "N/A"}</td>
                    <td>{item.status || "inactive"}</td>
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
