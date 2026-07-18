import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import { reporterControlService } from "../services/reporterControlService";

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await reporterControlService.listAssignments();
        if (!mounted) return;
        setAssignments(data);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load assignments.");
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
    const scheduled = assignments.filter((item) => String(item.assignmentStatus || "").toLowerCase() === "scheduled").length;
    const highPriority = assignments.filter((item) => String(item.priority || "").toLowerCase() === "high").length;
    return [
      { label: "Assignments", value: assignments.length ? String(assignments.length) : "—", tone: "blue", detail: "Reporter-to-studio links" },
      { label: "Scheduled", value: assignments.length ? String(scheduled) : "—", tone: "green", detail: "Upcoming slots" },
      { label: "High Priority", value: assignments.length ? String(highPriority) : "—", tone: "amber", detail: "Critical coverage" },
    ];
  }, [assignments]);

  return (
    <ModulePage
      title="Assignments"
      subtitle="Scheduling links between reporters and studios managed through TMOS backend APIs."
      summary="Phase 3.1 placeholder view for assignment orchestration."
      stats={stats}
      apiSpec={{
        endpoint: "GET /assignments",
        requestModel: "AssignmentListRequest",
        responseModel: "AssignmentListResponse",
        loadingState: "Load assignment records from backend services.",
        emptyState: "Show that no assignments are currently planned.",
        errorState: "Display backend integration errors for assignments.",
      }}
      searchPlaceholder="Search assignments"
      filters={["All", "Scheduled", "Other"]}
      tableTitle="Assignment board"
      tableSubtitle="Reporter, studio, and schedule status overview"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No assignment records returned yet."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = assignments.filter((item) => {
          const haystack = `${item.title || ""} ${item.reporterName || ""} ${item.studioName || ""}`.toLowerCase();
          const matchesSearch = haystack.includes(searchValue.toLowerCase());
          const status = String(item.assignmentStatus || "").toLowerCase();
          const matchesFilter = activeFilter === "All"
            || (activeFilter === "Scheduled" && status === "scheduled")
            || (activeFilter === "Other" && status !== "scheduled");
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Reporter</th>
                <th>Studio</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Start</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No Data Available" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title || "N/A"}</td>
                    <td>{item.reporterName || item.reporterId || "N/A"}</td>
                    <td>{item.studioName || item.studioId || "N/A"}</td>
                    <td>{item.assignmentStatus || "scheduled"}</td>
                    <td>{item.priority || "normal"}</td>
                    <td>{item.scheduledStart ? new Date(item.scheduledStart).toLocaleString() : "TBD"}</td>
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
