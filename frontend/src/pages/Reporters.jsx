import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import ReporterCard from "../components/dashboard/ReporterCard";
import { reporterControlService } from "../services/reporterControlService";
import { useNotification } from "../hooks/useNotification";
import { dispatchReporterControlRefresh, useReporterControlRefresh } from "../utils/reporterControlSync";

export default function Reporters() {
  const [reporters, setReporters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionInProgress, setActionInProgress] = useState(null);
  const notification = useNotification();

  const refreshReporters = async () => {
    try {
      const data = await reporterControlService.listReporters();
      setReporters(data);
    } catch (error) {
      setErrorMessage(error.message || "Failed to load reporters.");
    }
  };

  useReporterControlRefresh(refreshReporters);

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
    const liveCount = reporters.filter((item) => String(item.status || "").toLowerCase() === "live").length;
    const waitingCount = reporters.filter((item) => String(item.status || "").toLowerCase() === "waiting").length;
    const offlineCount = reporters.filter((item) => String(item.status || "").toLowerCase() === "offline").length;
    const totalCount = reporters.length;

    return [
      {
        label: "Live",
        value: String(liveCount),
        tone: "red",
        detail: "Currently broadcasting",
      },
      {
        label: "Waiting",
        value: String(waitingCount),
        tone: "amber",
        detail: "Ready to go live",
      },
      {
        label: "Offline",
        value: String(offlineCount),
        tone: "slate",
        detail: "Not connected",
      },
      {
        label: "Total",
        value: String(totalCount),
        tone: "blue",
        detail: "Roster records",
      },
    ];
  }, [reporters]);

  const handleAction = async (action, reporterId) => {
    const reporter = reporters.find((r) => r.id === reporterId);

    if (!reporter) {
      notification.error("Reporter not found");
      return;
    }

    if (action === "take-live") {
      if (actionInProgress) return;

      setActionInProgress(reporterId);
      try {
        await reporterControlService.updateReporterStatus(reporterId, "live");
        notification.success(`${reporter.fullName} is now live`);
        await refreshReporters();
        dispatchReporterControlRefresh({ source: "reporters", action: "take-live", reporterId });
      } catch (error) {
        notification.error(`Failed to take live: ${error.message}`);
      } finally {
        setActionInProgress(null);
      }
      return;
    }

    if (action === "end-live") {
      if (actionInProgress) return;

      setActionInProgress(reporterId);
      try {
        await reporterControlService.updateReporterStatus(reporterId, "waiting");
        notification.success(`${reporter.fullName} returned to waiting`);
        await refreshReporters();
        dispatchReporterControlRefresh({ source: "reporters", action: "end-live", reporterId });
      } catch (error) {
        notification.error(`Failed to end live: ${error.message}`);
      } finally {
        setActionInProgress(null);
      }
      return;
    }
  };

  return (
    <ModulePage
      title="Reporters"
      subtitle="Professional broadcast Reporter Control Room for real-time on-air operations."
      summary="Live monitoring, status management, and remote control of field reporters."
      stats={stats}
      apiSpec={{
        endpoint: "GET /reporters",
        requestModel: "ReporterListRequest",
        responseModel: "ReporterListResponse",
        loadingState: "Load reporter roster records from backend services.",
        emptyState: "Show that no reporters are currently registered.",
        errorState: "Display backend integration errors for reporter roster.",
      }}
      searchPlaceholder="Search reporters by name or email"
      filters={["All", "Live", "Waiting", "Offline", "Active"]}
      tableTitle="Broadcast Control Room"
      tableSubtitle="Real-time reporter status and remote control interface"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No reporter records returned yet."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = reporters.filter((item) => {
          const haystack = `${item.fullName || ""} ${item.email || ""} ${item.location || ""}`.toLowerCase();
          const matchesSearch = haystack.includes(searchValue.toLowerCase());

          if (activeFilter === "All") return matchesSearch;

          const status = String(item.status || "offline").toLowerCase();

          if (activeFilter === "Active") {
            return matchesSearch && status !== "offline";
          }

          return matchesSearch && status === activeFilter.toLowerCase();
        });

        return (
          <section className="reporter-control-room">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-message">No reporters match your search criteria.</p>
              </div>
            ) : (
              <div className="reporter-cards-grid">
                {filtered.map((reporter) => (
                  <ReporterCard
                    key={reporter.id}
                    reporter={reporter}
                    onAction={handleAction}
                    isLoading={actionInProgress === reporter.id}
                  />
                ))}
              </div>
            )}
          </section>
        );
      }}
    </ModulePage>
  );
}
