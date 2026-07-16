import ModulePage from "../components/common/ModulePage";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { streamingService } from "../services/streamingService";
import EmptyTableRow from "../components/common/EmptyTableRow";

function normalizeHealth(value) {
  const token = String(value || "unknown").toLowerCase();
  if (token.includes("healthy") || token.includes("live") || token.includes("running")) return "Healthy";
  if (token.includes("warn") || token.includes("degraded")) return "Warning";
  return "Unknown";
}

function inferProtocol(pathname, item) {
  if (pathname.includes("/broadcast/rtmp")) return "RTMP";
  if (pathname.includes("/broadcast/hls")) return "HLS";
  const token = String(item.protocol || item.type || "").toUpperCase();
  return token || "Unknown";
}

export default function StreamingControl() {
  const { pathname } = useLocation();
  const [streams, setStreams] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadStreaming() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await streamingService.list();
        if (!mounted) return;
        setStreams(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load streaming endpoints.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadStreaming();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  const rows = useMemo(() => {
    return streams.map((item, index) => ({
      endpoint: item.endpoint || item.name || `Endpoint ${index + 1}`,
      protocol: inferProtocol(pathname, item),
      service: item.service || item.node || "Waiting for Provider",
      health: normalizeHealth(item.health || item.status),
      bitrate: item.bitrate || (item.bitrateMbps != null ? `${item.bitrateMbps} Mbps` : "N/A"),
      viewers: item.viewers != null ? String(item.viewers) : "N/A",
      node: item.node || item.host || "Unknown",
    }));
  }, [pathname, streams]);
  const hasData = rows.length > 0;

  const isRtmp = pathname.includes("/broadcast/rtmp");
  const isHls = pathname.includes("/broadcast/hls");

  const pageConfig = isRtmp
    ? {
        title: "RTMP",
        subtitle: "Operate RTMP ingest and egress relays between OBS, FFmpeg, and TELEMAP streaming gateways.",
        summary: `RTMP endpoint state is sourced from backend gateway data.${actionMessage ? ` Last action: ${actionMessage}` : ""}`,
        actionPrimary: "Run RTMP failover",
        actionSecondary: "Restart RTMP relay",
        endpoint: "GET /streaming/rtmp/endpoints",
        requestModel: "RtmpEndpointsRequest",
        responseModel: "RtmpEndpointsResponse",
        tableTitle: "RTMP endpoint matrix",
      }
    : isHls
      ? {
          title: "HLS",
          subtitle: "Monitor HLS origins, segment generation, and edge distribution health for public delivery.",
          summary: `HLS endpoint state is sourced from backend gateway data.${actionMessage ? ` Last action: ${actionMessage}` : ""}`,
          actionPrimary: "Refresh HLS playlists",
          actionSecondary: "Restart HLS origin",
          endpoint: "GET /streaming/hls/endpoints",
          requestModel: "HlsEndpointsRequest",
          responseModel: "HlsEndpointsResponse",
          tableTitle: "HLS delivery matrix",
        }
      : {
          title: "Streaming",
          subtitle: "Operate RTMP, HLS, SRT, and LiveKit delivery services with protocol-level health and throughput visibility.",
          summary: `Streaming endpoint state is sourced from backend gateway data.${actionMessage ? ` Last action: ${actionMessage}` : ""}`,
          actionPrimary: "Run protocol failover",
          actionSecondary: "Restart selected relay",
          endpoint: "GET /streaming/endpoints/health",
          requestModel: "StreamingEndpointHealthRequest",
          responseModel: "StreamingEndpointHealthResponse",
          tableTitle: "Streaming endpoint matrix",
        };

  return (
    <ModulePage
      title={pageConfig.title}
      subtitle={pageConfig.subtitle}
      summary={pageConfig.summary}
      stats={[
        { label: "Endpoints", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Returned by backend" : "Not Connected" },
        { label: "Healthy", value: hasData ? String(rows.filter((item) => item.health === "Healthy").length) : "—", tone: "green", detail: hasData ? "Operational endpoints" : "Waiting for Provider" },
        { label: "Warnings", value: hasData ? String(rows.filter((item) => item.health === "Warning").length) : "—", tone: "teal", detail: hasData ? "Needs operator review" : "Waiting for Provider" },
        { label: "Unknown", value: hasData ? String(rows.filter((item) => item.health === "Unknown").length) : "—", tone: "amber", detail: "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">{pageConfig.actionPrimary}</button>
          <button type="button" className="ghost-button">{pageConfig.actionSecondary}</button>
        </>
      )}
      apiSpec={{
        endpoint: pageConfig.endpoint,
        requestModel: pageConfig.requestModel,
        responseModel: pageConfig.responseModel,
        loadingState: "Load protocol endpoint telemetry from streaming services.",
        emptyState: "Show that no streaming endpoints are currently provisioned.",
        errorState: "Display streaming telemetry outage and fallback controls.",
      }}
      searchPlaceholder="Search endpoint"
      filters={["All", "Healthy", "Warning", "Unknown"]}
      tableTitle={pageConfig.tableTitle}
      tableSubtitle="Protocol, service node, health, and viewer load across delivery infrastructure"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No streaming endpoints were returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((stream) => {
          const matchesSearch = stream.endpoint.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || stream.health === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Protocol</th>
                <th>Service</th>
                <th>Health</th>
                <th>Bitrate</th>
                <th>Viewers</th>
                <th>Node</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={7} message="Provider Not Configured" />
              ) : (
                filtered.map((stream) => (
                  <tr key={stream.endpoint}>
                    <td>{stream.endpoint}</td>
                    <td>{stream.protocol}</td>
                    <td>{stream.service}</td>
                    <td>{stream.health}</td>
                    <td>{stream.bitrate}</td>
                    <td>{stream.viewers}</td>
                    <td>{stream.node}</td>
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
