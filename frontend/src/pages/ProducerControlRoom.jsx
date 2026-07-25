import { useEffect, useMemo, useState } from "react";
import ModulePage from "../components/common/ModulePage";
import ProducerQueueSection from "../components/producer/ProducerQueueSection";
import ProducerQueueCard from "../components/producer/ProducerQueueCard";
import ProducerMonitoring from "../components/producer/ProducerMonitoring";
import { producerControlService } from "../services/producerControlService";
import { useNotification } from "../hooks/useNotification";
import { dispatchReporterControlRefresh, useReporterControlRefresh } from "../utils/reporterControlSync";
import "../styles/producer-control.css";

function normalizeStatus(status) {
  return String(status || "").toLowerCase();
}

function matchesSearch(reporter, searchValue) {
  const haystack = `${reporter.fullName || ""} ${reporter.email || ""} ${reporter.location || ""} ${reporter.notes || ""}`.toLowerCase();
  return haystack.includes(searchValue.toLowerCase());
}

function buildHistoryEntry(reporter, actionLabel, actionTone) {
  return {
    ...reporter,
    actionLabel,
    actionTone,
    actionAt: new Date().toISOString(),
  };
}

export default function ProducerControlRoom() {
  const [reporters, setReporters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionInProgress, setActionInProgress] = useState(null);
  const [approvedEntries, setApprovedEntries] = useState([]);
  const [finishedEntries, setFinishedEntries] = useState([]);
  const [selectedReporter, setSelectedReporter] = useState(null);
  const [talkbackState, setTalkbackState] = useState({});
  const notification = useNotification();

  const refreshReporters = async () => {
    try {
      const data = await producerControlService.listRequests();
      setReporters(data);
    } catch (error) {
      setErrorMessage(error.message || "Failed to load producer queue.");
    }
  };

  useReporterControlRefresh(refreshReporters);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await producerControlService.listRequests();
        if (!mounted) return;
        setReporters(data);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load producer queue.");
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
    const requestCount = reporters.filter((item) => ["waiting", "ready", "online"].includes(normalizeStatus(item.status))).length;
    const approvedCount = approvedEntries.length;
    const liveCount = reporters.filter((item) => normalizeStatus(item.status) === "live").length;
    const finishedCount = finishedEntries.length;

    return [
      { label: "Live Requests", value: String(requestCount), tone: "amber", detail: "Awaiting producer review" },
      { label: "Approved", value: String(approvedCount), tone: "green", detail: "Cleared for live handoff" },
      { label: "Live Now", value: String(liveCount), tone: "red", detail: "Currently on air" },
      { label: "Recently Finished", value: String(finishedCount), tone: "slate", detail: "Completed or rejected queue items" },
    ];
  }, [approvedEntries.length, finishedEntries.length, reporters]);

  const handleAction = async (action, reporterId) => {
    const reporter = reporters.find((item) => item.id === reporterId) || approvedEntries.find((item) => item.id === reporterId) || finishedEntries.find((item) => item.id === reporterId);

    if (!reporter) {
      notification.error("Reporter not found");
      return;
    }

    if (action === "approve") {
      if (actionInProgress) return;

      setActionInProgress(reporterId);
      try {
        await producerControlService.approveRequest(reporterId);
        const entry = buildHistoryEntry(reporter, "Approved for live handoff", "approved");
        setApprovedEntries((current) => [entry, ...current.filter((item) => item.id !== reporterId)].slice(0, 8));
        notification.success(`${reporter.fullName} approved for live handoff`);
        dispatchReporterControlRefresh({ source: "producer-control-room", action: "approve", reporterId });
        await refreshReporters();
      } catch (error) {
        notification.error(`Failed to approve request: ${error.message}`);
      } finally {
        setActionInProgress(null);
      }
      return;
    }

    if (action === "reject") {
      if (actionInProgress) return;

      setActionInProgress(reporterId);
      try {
        await producerControlService.rejectRequest(reporterId);
        const entry = buildHistoryEntry(reporter, "Rejected from producer queue", "rejected");
        setFinishedEntries((current) => [entry, ...current.filter((item) => item.id !== reporterId)].slice(0, 8));
        notification.warning(`${reporter.fullName} rejected from producer queue`);
        dispatchReporterControlRefresh({ source: "producer-control-room", action: "reject", reporterId });
        await refreshReporters();
      } catch (error) {
        notification.error(`Failed to reject request: ${error.message}`);
      } finally {
        setActionInProgress(null);
      }
      return;
    }

    if (action === "talkback") {
      if (actionInProgress) return;

      setActionInProgress(reporterId);
      const currentlyEnabled = Boolean(talkbackState[reporterId]);
      const nextEnabled = !currentlyEnabled;

      try {
        await producerControlService.setTalkback(reporter, nextEnabled);
        setTalkbackState((current) => ({
          ...current,
          [reporterId]: nextEnabled,
        }));
        notification.success(nextEnabled
          ? `Talk Back enabled for ${reporter.fullName}`
          : `Talk Back disabled for ${reporter.fullName}`);
      } catch (error) {
        notification.error(`Talk Back failed: ${error.message}`);
      } finally {
        setActionInProgress(null);
      }
      return;
    }

    if (action === "details") {
      setSelectedReporter(reporter);
    }
  };

  return (
    <ModulePage
      title="Producer Control Room"
      subtitle="TMOS producer queue for reviewing reporter live requests and broadcast readiness."
      summary="Producer workflow shares the same backend reporter-control service layer and keeps the Reporter page in sync through refresh events."
      stats={stats}
      apiSpec={{
        endpoint: "GET /reporters + PATCH /reporters/:reporterId",
        requestModel: "ProducerQueueRequest",
        responseModel: "ProducerQueueResponse",
        loadingState: "Load reporter queue records from the backend service layer.",
        emptyState: "Show that no producer queue items are currently available.",
        errorState: "Display backend integration errors for the producer queue.",
      }}
      actions={(
        <button type="button" className="ghost-button" onClick={refreshReporters}>
          Refresh queue
        </button>
      )}
      searchPlaceholder="Search reporters, notes, or locations"
      filters={[]}
      tableTitle="Producer queue"
      tableSubtitle="Approve or reject live requests, then monitor approved and live reporters"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No producer queue items returned yet."
    >
      {({ searchValue }) => {
        const searchableReporters = reporters.filter((item) => matchesSearch(item, searchValue));

        const liveRequests = searchableReporters.filter((item) => ["waiting", "ready", "online"].includes(normalizeStatus(item.status)));
        const liveNow = searchableReporters.filter((item) => normalizeStatus(item.status) === "live");

        const approvedNow = [
          ...approvedEntries.filter((item) => matchesSearch(item, searchValue)),
          ...searchableReporters
            .filter((item) => normalizeStatus(item.status) === "live")
            .map((item) => ({
              ...item,
              actionLabel: "Approved and moved to live",
              actionTone: "approved",
              actionAt: item.updatedAt,
            })),
        ].filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id && candidate.actionAt === item.actionAt) === index);

        const recentlyFinished = [
          ...finishedEntries.filter((item) => matchesSearch(item, searchValue)),
          ...searchableReporters
            .filter((item) => normalizeStatus(item.status) === "offline")
            .map((item) => ({
              ...item,
              actionLabel: "Recently finished or rejected",
              actionTone: "finished",
              actionAt: item.updatedAt,
            })),
        ].filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id && candidate.actionAt === item.actionAt) === index);

        return (
          <section className="producer-control-room-body">
            <div className="producer-monitoring-section">
              <div className="monitoring-header">
                <h3>📹 Live Reporter Feeds</h3>
                <p>Real-time video and audio from reporters actively broadcasting</p>
              </div>
              <ProducerMonitoring roomName="tmos-live-sources" />
            </div>

            <div className="producer-control-grid">
              <ProducerQueueSection
                title="Live Requests"
                description="Incoming reporter requests waiting for producer review."
                count={String(liveRequests.length)}
                tone="amber"
              >
                {liveRequests.length === 0 ? (
                  <div className="producer-empty-state">No live requests are waiting right now.</div>
                ) : (
                  liveRequests.map((reporter) => (
                    <ProducerQueueCard
                      key={reporter.id}
                      reporter={reporter}
                      variant="request"
                      sectionLabel="Request"
                      sectionTone="amber"
                      sectionDetail="Awaiting approval or rejection"
                      isBusy={actionInProgress === reporter.id}
                      onApprove={handleAction}
                      onReject={handleAction}
                      onTalkBack={handleAction}
                      onViewDetails={handleAction}
                    />
                  ))
                )}
              </ProducerQueueSection>

              <ProducerQueueSection
                title="Approved"
                description="Requests approved by the producer during this session."
                count={String(approvedNow.length)}
                tone="green"
              >
                {approvedNow.length === 0 ? (
                  <div className="producer-empty-state">No requests have been approved yet.</div>
                ) : (
                  approvedNow.map((reporter) => (
                    <ProducerQueueCard
                      key={`${reporter.id}-${reporter.actionAt || reporter.updatedAt}`}
                      reporter={reporter}
                      variant="approved"
                      sectionLabel="Approved"
                      sectionTone="green"
                      sectionDetail="Cleared for live handoff"
                      isBusy={actionInProgress === reporter.id}
                      onTalkBack={handleAction}
                      onViewDetails={handleAction}
                    />
                  ))
                )}
              </ProducerQueueSection>

              <ProducerQueueSection
                title="Live Now"
                description="Reporters currently broadcast live through TMOS backend state."
                count={String(liveNow.length)}
                tone="red"
              >
                {liveNow.length === 0 ? (
                  <div className="producer-empty-state">No reporters are live at the moment.</div>
                ) : (
                  liveNow.map((reporter) => (
                    <ProducerQueueCard
                      key={reporter.id}
                      reporter={reporter}
                      variant="live"
                      sectionLabel="Live"
                      sectionTone="red"
                      sectionDetail="On air now"
                      isBusy={actionInProgress === reporter.id}
                      onTalkBack={handleAction}
                      onViewDetails={handleAction}
                    />
                  ))
                )}
              </ProducerQueueSection>

              <ProducerQueueSection
                title="Recently Finished"
                description="Rejected requests and recently closed queue items."
                count={String(recentlyFinished.length)}
                tone="slate"
              >
                {recentlyFinished.length === 0 ? (
                  <div className="producer-empty-state">No finished queue items yet.</div>
                ) : (
                  recentlyFinished.map((reporter) => (
                    <ProducerQueueCard
                      key={`${reporter.id}-${reporter.actionAt || reporter.updatedAt}`}
                      reporter={reporter}
                      variant="finished"
                      sectionLabel="Finished"
                      sectionTone="slate"
                      sectionDetail="Recently completed or rejected"
                      isBusy={actionInProgress === reporter.id}
                      onTalkBack={handleAction}
                      onViewDetails={handleAction}
                    />
                  ))
                )}
              </ProducerQueueSection>
            </div>

            {selectedReporter ? (
              <section className="panel producer-details-panel">
                <div className="panel-title-row module-panel-title-row">
                  <div>
                    <h3 className="panel-title">Reporter details</h3>
                    <p className="panel-caption">Selected queue entry for producer review.</p>
                  </div>

                  <button type="button" className="ghost-button" onClick={() => setSelectedReporter(null)}>
                    Close
                  </button>
                </div>

                <div className="producer-details-grid">
                  <div className="producer-detail-item">
                    <span>Name</span>
                    <strong>{selectedReporter.fullName || "Unknown Reporter"}</strong>
                  </div>
                  <div className="producer-detail-item">
                    <span>Email</span>
                    <strong>{selectedReporter.email || "N/A"}</strong>
                  </div>
                  <div className="producer-detail-item">
                    <span>Status</span>
                    <strong>{selectedReporter.status || "unknown"}</strong>
                  </div>
                  <div className="producer-detail-item">
                    <span>Location</span>
                    <strong>{selectedReporter.location || "Unknown"}</strong>
                  </div>
                  <div className="producer-detail-item">
                    <span>Notes</span>
                    <p>{selectedReporter.notes || "No notes supplied."}</p>
                  </div>
                  <div className="producer-detail-item">
                    <span>Updated</span>
                    <strong>{selectedReporter.updatedAt || selectedReporter.actionAt || "N/A"}</strong>
                  </div>
                </div>
              </section>
            ) : null}
          </section>
        );
      }}
    </ModulePage>
  );
}