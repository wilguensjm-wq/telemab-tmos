import ModulePage from "../components/common/ModulePage";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { aiService } from "../services/aiService";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function AIAssistant() {
  const { pathname } = useLocation();
  const [overview, setOverview] = useState({ incidents: [], suggestions: [], recommendations: [], timeline: [], reportPreview: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadAssistantData() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await aiService.getOperationalAssistantOverview();
        if (!mounted) return;
        setOverview(data);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load AI operations workspace.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadAssistantData();

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const openCount = overview.incidents.filter((item) => item.status === "Open").length;
    const highPriority = overview.incidents.filter((item) => item.priority === "High").length;
    const hasData = overview.incidents.length > 0 || overview.timeline.length > 0;
    return [
      { label: "Open Incidents", value: hasData ? String(openCount) : "—", tone: "blue", detail: hasData ? "AI-correlated incidents" : "Not Connected" },
      { label: "Recommended Actions", value: hasData ? String(overview.suggestions.length) : "—", tone: "teal", detail: hasData ? "Provider-backed incident guidance" : "Waiting for Provider" },
      { label: "Critical Signals", value: hasData ? String(highPriority) : "—", tone: "green", detail: hasData ? "High-priority incident set" : "No Data Available" },
      { label: "Timeline Events", value: hasData ? String(overview.timeline.length) : "—", tone: "amber", detail: hasData ? "Recent provider timeline" : "Connecting..." },
    ];
  }, [overview]);

  const pageConfig = pathname.includes("/ai-operations/engineer")
    ? {
        title: "AI Engineer",
        subtitle: "Operator workspace for deploying AI workflows and validating service integrations.",
        endpoint: "GET /ai/operations/engineer/tasks",
        requestModel: "AiEngineerTasksRequest",
        responseModel: "AiEngineerTasksResponse",
      }
    : pathname.includes("/ai-operations/diagnostics")
      ? {
          title: "AI Diagnostics",
          subtitle: "Analyze AI service health, inference latency, and model runtime anomalies.",
          endpoint: "GET /ai/operations/diagnostics",
          requestModel: "AiDiagnosticsRequest",
          responseModel: "AiDiagnosticsResponse",
        }
      : pathname.includes("/ai-operations/automation")
        ? {
            title: "AI Automation",
            subtitle: "Run AI-driven automation workflows for incident response and infrastructure recovery.",
            endpoint: "GET /ai/operations/automation/runs",
            requestModel: "AiAutomationRunsRequest",
            responseModel: "AiAutomationRunsResponse",
          }
        : pathname.includes("/ai-operations/knowledge-base")
          ? {
              title: "Knowledge Base",
              subtitle: "Query operational knowledge, runbooks, and documented fixes from AI knowledge services.",
              endpoint: "GET /ai/operations/knowledge-base/entries",
              requestModel: "AiKnowledgeBaseRequest",
              responseModel: "AiKnowledgeBaseResponse",
            }
          : pathname.includes("/ai-operations/recommendations")
            ? {
                title: "Recommendations",
                subtitle: "Review AI-prioritized recommendations ranked by operational impact.",
                endpoint: "GET /ai/operations/recommendations",
                requestModel: "AiRecommendationsRequest",
                responseModel: "AiRecommendationsResponse",
              }
            : {
                title: "AI Operations",
                subtitle: "Use AI to correlate NOC, BOC, and service telemetry, then prioritize operator actions.",
                endpoint: "GET /ai/operations/incidents",
                requestModel: "AIOperationsIncidentRequest",
                responseModel: "AIOperationsIncidentResponse",
              };

  return (
    <ModulePage
      title={pageConfig.title}
      subtitle={pageConfig.subtitle}
      summary={`AI operations consumes TMOS events for cross-provider diagnosis. ${overview.reportPreview}`}
      stats={stats}
      actions={(
        <>
          <button type="button" className="action-button">Open incident view</button>
          <button type="button" className="ghost-button">Review insights</button>
        </>
      )}
      apiSpec={{
        endpoint: pageConfig.endpoint,
        requestModel: pageConfig.requestModel,
        responseModel: pageConfig.responseModel,
        loadingState: "Load AI-correlated incidents and recommendations.",
        emptyState: "Show that no AI incidents are currently active.",
        errorState: "Display AI operations API error with manual workflow fallback.",
      }}
      searchPlaceholder="Search incident"
      filters={["All", "Open", "In Review", "Resolved"]}
      tableTitle="Broadcast incident workspace"
      tableSubtitle="Operational tasks, incident context, and recommended fixes"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="Waiting for Provider"
    >
      {({ searchValue, activeFilter }) => {
        const filtered = overview.incidents.filter((item) => {
          const matchesSearch = item.task.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.status === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <div className="assistant-layout">
            <table className="table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Context</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <EmptyTableRow colSpan={4} message="Waiting for Provider" />
                ) : (
                  filtered.map((item) => (
                    <tr key={item.task}>
                      <td>{item.task}</td>
                      <td>{item.context}</td>
                      <td>{item.priority}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="assistant-stack">
              <div className="assistant-card">
                <h4>Suggested actions</h4>
                <ul>
                  {overview.suggestions.length === 0 ? <li>No Data Available</li> : overview.suggestions.map((item) => (<li key={item}>{item}</li>))}
                </ul>
              </div>
              <div className="assistant-card">
                <h4>System recommendations</h4>
                <ul>
                  {overview.recommendations.length === 0 ? <li>Waiting for live provider data</li> : overview.recommendations.map((item) => (<li key={item}>{item}</li>))}
                </ul>
              </div>
            </div>
          </div>
        );
      }}
    </ModulePage>
  );
}
