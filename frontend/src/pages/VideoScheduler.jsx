import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { schedulerService } from "../services/schedulerService";
import EmptyTableRow from "../components/common/EmptyTableRow";

function normalizeStatus(value) {
  const token = String(value || "Unknown").toLowerCase();
  if (token.includes("live")) return "Live";
  if (token.includes("queue")) return "Queued";
  if (token.includes("schedule")) return "Scheduled";
  if (token.includes("ready")) return "Ready";
  return "Unknown";
}

export default function VideoScheduler() {
  const [schedule, setSchedule] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSchedule() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await schedulerService.list();
        if (!mounted) return;
        setSchedule(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load playout schedule.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSchedule();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return schedule.map((item, index) => ({
      title: item.title || item.program || `Program ${index + 1}`,
      time: item.time || item.airTime || "Unknown",
      channel: item.channel || item.service || "Waiting for Provider",
      status: normalizeStatus(item.status || item.state),
      notes: item.notes || item.detail || "No notes provided",
    }));
  }, [schedule]);
  const hasData = rows.length > 0;

  return (
    <ModulePage
      title="Playout Scheduler"
      subtitle="Plan programming, automate playout windows, and manage time-based content delivery for live broadcasts."
      summary="Schedule data is sourced from backend playout endpoints."
      stats={[
        { label: "Scheduled Programs", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Current backend payload" : "Not Connected" },
        { label: "Live", value: hasData ? String(rows.filter((item) => item.status === "Live").length) : "—", tone: "green", detail: hasData ? "On-air programs" : "Waiting for Provider" },
        { label: "Queued", value: hasData ? String(rows.filter((item) => item.status === "Queued").length) : "—", tone: "amber", detail: hasData ? "Pending launch" : "Waiting for Provider" },
        { label: "Ready", value: hasData ? String(rows.filter((item) => item.status === "Ready").length) : "—", tone: "teal", detail: hasData ? "Prepared programs" : "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Create lineup</button>
          <button type="button" className="ghost-button">Sync calendar</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /broadcast/playout/schedule",
        requestModel: "PlayoutScheduleRequest",
        responseModel: "PlayoutScheduleResponse",
        loadingState: "Load playout blocks and upcoming scheduling windows.",
        emptyState: "Show that no playout events are scheduled.",
        errorState: "Display schedule retrieval error and fallback lineup view.",
      }}
      searchPlaceholder="Search program"
      filters={["All", "Live", "Queued", "Scheduled", "Ready", "Unknown"]}
      tableTitle="Scheduled programming"
      tableSubtitle="Upcoming events, playout windows, and operational notes"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No schedule records were returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((item) => {
          const matchesSearch = item.title.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.status === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Air Time</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={5} message="Waiting for Provider" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.title}>
                    <td>{item.title}</td>
                    <td>{item.time}</td>
                    <td>{item.channel}</td>
                    <td>{item.status}</td>
                    <td>{item.notes}</td>
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
