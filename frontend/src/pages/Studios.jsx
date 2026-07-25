import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import EmptyTableRow from "../components/common/EmptyTableRow";
import { reporterControlService } from "../services/reporterControlService";
import { useNotification } from "../hooks/useNotification";

const defaultForm = {
  name: "",
  location: "",
  capacity: "1",
  status: "available",
  notes: "",
};

export default function Studios() {
  const [studios, setStudios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const notification = useNotification();

  const refreshStudios = async () => {
    const data = await reporterControlService.listStudios();
    setStudios(data);
  };

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const payload = {
      name: form.name.trim(),
      location: form.location.trim(),
      capacity: Number(form.capacity || 1),
      status: form.status,
      notes: form.notes.trim() || null,
    };

    try {
      if (editingId) {
        setBusyId(editingId);
        await reporterControlService.updateStudio(editingId, payload);
        notification.success("Studio updated.");
      } else {
        setBusyId("create");
        await reporterControlService.createStudio(payload);
        notification.success("Studio created.");
      }

      await refreshStudios();
      resetForm();
    } catch (error) {
      setErrorMessage(error.message || "Failed to save studio.");
      notification.error(error.message || "Failed to save studio.");
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (studio) => {
    setEditingId(studio.id);
    setForm({
      name: studio.name || "",
      location: studio.location || "",
      capacity: String(studio.capacity || 1),
      status: studio.status || "available",
      notes: studio.notes || "",
    });
  };

  const handleDelete = async (studioId) => {
    setBusyId(studioId);
    try {
      await reporterControlService.deleteStudio(studioId);
      notification.success("Studio deleted.");
      await refreshStudios();
      if (editingId === studioId) {
        resetForm();
      }
    } catch (error) {
      notification.error(error.message || "Failed to delete studio.");
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusToggle = async (studio) => {
    const nextStatus = String(studio.status || "").toLowerCase() === "available" ? "maintenance" : "available";
    setBusyId(studio.id);
    try {
      await reporterControlService.updateStudio(studio.id, { status: nextStatus });
      notification.success(`Studio marked ${nextStatus}.`);
      await refreshStudios();
    } catch (error) {
      notification.error(error.message || "Failed to update studio status.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModulePage
      title="Studios"
      subtitle="Studio inventory and room readiness records from TMOS backend services."
      summary="Studio CRUD and readiness management through the existing reporter-control backend APIs."
      stats={stats}
      apiSpec={{
        endpoint: "GET/POST/PATCH/DELETE /studios",
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
      actions={(
        <button type="button" className="ghost-button" onClick={refreshStudios} disabled={busyId !== null}>
          Refresh
        </button>
      )}
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
          <>
            <section className="panel" style={{ marginBottom: "1rem" }}>
              <div className="panel-title-row module-panel-title-row">
                <div>
                  <h3 className="panel-title">{editingId ? "Edit studio" : "Create studio"}</h3>
                  <p className="panel-caption">Maintain control room studio inventory using current backend endpoints.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="api-contract-grid" style={{ marginTop: "1rem" }}>
                <label>
                  Name
                  <input value={form.name} onChange={(event) => handleChange("name", event.target.value)} required />
                </label>
                <label>
                  Location
                  <input value={form.location} onChange={(event) => handleChange("location", event.target.value)} required />
                </label>
                <label>
                  Capacity
                  <input type="number" min="1" value={form.capacity} onChange={(event) => handleChange("capacity", event.target.value)} required />
                </label>
                <label>
                  Status
                  <select value={form.status} onChange={(event) => handleChange("status", event.target.value)}>
                    <option value="available">available</option>
                    <option value="maintenance">maintenance</option>
                    <option value="unavailable">unavailable</option>
                  </select>
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Notes
                  <input value={form.notes} onChange={(event) => handleChange("notes", event.target.value)} />
                </label>

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="action-button" disabled={busyId !== null}>
                    {editingId ? "Save changes" : "Create studio"}
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
                  <th>Name</th>
                  <th>Location</th>
                  <th>Capacity</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No Data Available" />
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name || "N/A"}</td>
                      <td>{item.location || "N/A"}</td>
                      <td>{item.capacity ?? "N/A"}</td>
                      <td>{item.status || "unavailable"}</td>
                      <td>{item.notes || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          <button type="button" className="ghost-button" onClick={() => startEdit(item)} disabled={busyId !== null}>
                            Edit
                          </button>
                          <button type="button" className="ghost-button" onClick={() => handleStatusToggle(item)} disabled={busyId !== null}>
                            {String(item.status || "").toLowerCase() === "available" ? "Set maintenance" : "Set available"}
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
