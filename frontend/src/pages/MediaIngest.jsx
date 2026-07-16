import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { mediaService } from "../services/mediaService";
import EmptyTableRow from "../components/common/EmptyTableRow";

function normalizeState(value) {
  const token = String(value || "Unknown").toLowerCase();
  if (token.includes("trans")) return "Transcoding";
  if (token.includes("queue")) return "Queued";
  if (token.includes("meta")) return "Metadata";
  if (token.includes("approval") || token.includes("review")) return "Approval";
  return "Unknown";
}

export default function MediaIngest() {
  const [ingestJobs, setIngestJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadIngestQueue() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await mediaService.listIngestQueue();
        if (!mounted) return;
        setIngestJobs(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load ingest queue.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadIngestQueue();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return ingestJobs.map((item, index) => ({
      id: item.id || `ING-${index + 1}`,
      source: item.source || item.input || "Waiting for Provider",
      ffmpegJob: item.ffmpegJob || item.job || "Not Connected",
      state: normalizeState(item.state || item.status),
      eta: item.eta || "Unknown",
      destination: item.destination || item.output || "Waiting for Provider",
    }));
  }, [ingestJobs]);
  const hasData = rows.length > 0;

  return (
    <ModulePage
      title="Media Ingest Pipeline"
      subtitle="Manage incoming uploads, FFmpeg transcodes, metadata extraction, and approvals across TELEMAP media infrastructure."
      summary="Ingest queue is sourced from backend gateway integrations for FFmpeg and media services."
      stats={[
        { label: "Queue Items", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Returned by backend" : "Not Connected" },
        { label: "Transcoding", value: hasData ? String(rows.filter((item) => item.state === "Transcoding").length) : "—", tone: "teal", detail: hasData ? "Active FFmpeg jobs" : "Waiting for Provider" },
        { label: "Queued", value: hasData ? String(rows.filter((item) => item.state === "Queued").length) : "—", tone: "amber", detail: hasData ? "Waiting jobs" : "Waiting for Provider" },
        { label: "Unknown", value: hasData ? String(rows.filter((item) => item.state === "Unknown").length) : "—", tone: "green", detail: "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Create ingest profile</button>
          <button type="button" className="ghost-button">Run queue rebalance</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /infrastructure/ffmpeg/jobs",
        requestModel: "IngestQueueRequest",
        responseModel: "IngestQueueResponse",
        loadingState: "Load active ingest and FFmpeg queue status.",
        emptyState: "Show that no ingest jobs are currently queued.",
        errorState: "Display pipeline error and retry ingest polling.",
      }}
      searchPlaceholder="Search ingest job"
      filters={["All", "Queued", "Transcoding", "Metadata", "Approval", "Unknown"]}
      tableTitle="Ingest operations queue"
      tableSubtitle="Live ingest jobs from OBS, LiveKit, RTMP, and upload sources"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No ingest queue records were returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((job) => {
          const matchesSearch = `${job.id} ${job.source}`.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || job.state === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Source</th>
                <th>FFmpeg Task</th>
                <th>State</th>
                <th>ETA</th>
                <th>Destination</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={6} message="Waiting for Provider" />
              ) : (
                filtered.map((job) => (
                  <tr key={job.id}>
                    <td>{job.id}</td>
                    <td>{job.source}</td>
                    <td>{job.ffmpegJob}</td>
                    <td>{job.state}</td>
                    <td>{job.eta}</td>
                    <td>{job.destination}</td>
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
