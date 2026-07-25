import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import { reporterControlService } from "../services/reporterControlService";
import { useNotification } from "../hooks/useNotification";

const defaultForm = {
  title: "",
  reporterId: "",
  studioId: "",
  assignmentStatus: "scheduled",
  priority: "normal",
  scheduledStart: "",
  scheduledEnd: "",
  notes: "",
};

function toLocalDateTimeInput(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (token) => String(token).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  const mm = pad(parsed.getMonth() + 1);
  const dd = pad(parsed.getDate());
  const hh = pad(parsed.getHours());
  const min = pad(parsed.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [reporters, setReporters] = useState([]);
  const [studios, setStudios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const notification = useNotification();

  const refreshData = async () => {
    const [assignmentData, reporterData, studioData] = await Promise.all([
      reporterControlService.listAssignments(),
      reporterControlService.listReporters(),
      reporterControlService.listStudios(),
    ]);
    setAssignments(assignmentData);
    setReporters(reporterData);
    setStudios(studioData);
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const [assignmentData, reporterData, studioData] = await Promise.all([
          reporterControlService.listAssignments(),
          reporterControlService.listReporters(),
          reporterControlService.listStudios(),
        ]);
        if (!mounted) return;
        setAssignments(assignmentData);
        setReporters(reporterData);
        setStudios(studioData);
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

  const handleChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const startEdit = (assignment) => {
    setEditingId(assignment.id);
    setForm({
      title: assignment.title || "",
      reporterId: assignment.reporterId || "",
      studioId: assignment.studioId || "",
      assignmentStatus: assignment.assignmentStatus || "scheduled",
      priority: assignment.priority || "normal",
      scheduledStart: toLocalDateTimeInput(assignment.scheduledStart),
      scheduledEnd: toLocalDateTimeInput(assignment.scheduledEnd),
      notes: assignment.notes || "",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const payload = {
      title: form.title.trim(),
      reporterId: form.reporterId,
      studioId: form.studioId,
      assignmentStatus: form.assignmentStatus,
      priority: form.priority,
      scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : null,
      scheduledEnd: form.scheduledEnd ? new Date(form.scheduledEnd).toISOString() : null,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        setBusyId(editingId);
        await reporterControlService.updateAssignment(editingId, payload);
        notification.success("Assignment updated.");
      } else {
        setBusyId("create");
        await reporterControlService.createAssignment(payload);
        notification.success("Assignment created.");
      }

      await refreshData();
      resetForm();
    } catch (error) {
      setErrorMessage(error.message || "Failed to save assignment.");
      notification.error(error.message || "Failed to save assignment.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (assignmentId) => {
    setBusyId(assignmentId);
    try {
      await reporterControlService.deleteAssignment(assignmentId);
      notification.success("Assignment deleted.");
      await refreshData();
      if (editingId === assignmentId) {
        resetForm();
      }
    } catch (error) {
      notification.error(error.message || "Failed to delete assignment.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModulePage
      title="Assignments"
      subtitle="Scheduling links between reporters and studios managed through TMOS backend APIs."
      summary="Assignment orchestration is now fully backed by the existing reporter-control CRUD APIs."
      stats={stats}
      apiSpec={{
        endpoint: "GET/POST/PATCH/DELETE /assignments",
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
      actions={(
        <button type="button" className="ghost-button" onClick={refreshData} disabled={busyId !== null}>
          Refresh
        </button>
      )}
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
          <>
            <section className="panel" style={{ marginBottom: "1rem" }}>
              <div className="panel-title-row module-panel-title-row">
                <div>
                  <h3 className="panel-title">{editingId ? "Edit assignment" : "Create assignment"}</h3>
                  <p className="panel-caption">Manage reporter-to-studio scheduling with existing backend APIs.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="api-contract-grid" style={{ marginTop: "1rem" }}>
                <label>
                  Title
                  <input value={form.title} onChange={(event) => handleChange("title", event.target.value)} required />
                </label>
                <label>
                  Reporter
                  <select value={form.reporterId} onChange={(event) => handleChange("reporterId", event.target.value)} required>
                    <option value="">Select reporter</option>
                    {reporters.map((reporter) => (
                      <option key={reporter.id} value={reporter.id}>{reporter.fullName || reporter.email || reporter.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Studio
                  <select value={form.studioId} onChange={(event) => handleChange("studioId", event.target.value)} required>
                    <option value="">Select studio</option>
                    {studios.map((studio) => (
                      <option key={studio.id} value={studio.id}>{studio.name || studio.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={form.assignmentStatus} onChange={(event) => handleChange("assignmentStatus", event.target.value)}>
                    <option value="scheduled">scheduled</option>
                    <option value="in-progress">in-progress</option>
                    <option value="completed">completed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select value={form.priority} onChange={(event) => handleChange("priority", event.target.value)}>
                    <option value="low">low</option>
                    <option value="normal">normal</option>
                    <option value="high">high</option>
                    <option value="critical">critical</option>
                  </select>
                </label>
                <label>
                  Start
                  <input type="datetime-local" value={form.scheduledStart} onChange={(event) => handleChange("scheduledStart", event.target.value)} />
                </label>
                <label>
                  End
                  <input type="datetime-local" value={form.scheduledEnd} onChange={(event) => handleChange("scheduledEnd", event.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Notes
                  <input value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} />
                </label>

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="action-button" disabled={busyId !== null}>
                    {editingId ? "Save changes" : "Create assignment"}
                  </button>
                  {editingId ? (
                    <button type="button" className="ghost-button" onClick={resetForm} disabled={busyId !== null}>
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            </section>

            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Reporter</th>
                  <th>Studio</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Start</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <EmptyTableRow colSpan={7} message="No Data Available" />
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title || "N/A"}</td>
                      <td>{item.reporterName || item.reporterId || "N/A"}</td>
                      <td>{item.studioName || item.studioId || "N/A"}</td>
                      <td>{item.assignmentStatus || "scheduled"}</td>
                      <td>{item.priority || "normal"}</td>
                      <td>{item.scheduledStart ? new Date(item.scheduledStart).toLocaleString() : "TBD"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button type="button" className="ghost-button" onClick={() => startEdit(item)} disabled={busyId !== null}>
                            Edit
                          </button>
                          <button type="button" className="danger-button" onClick={() => handleDelete(item.id)} disabled={busyId !== null}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        );
      }}
    </ModulePage>
  );
}
