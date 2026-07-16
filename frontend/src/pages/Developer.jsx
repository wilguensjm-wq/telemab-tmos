import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { infrastructureIntegrationService } from "../services/infrastructureIntegrationService";
import { tmosEventBus } from "../services/tmosEventBus";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function Developer() {
  const [providers, setProviders] = useState([]);
  const [eventsCount, setEventsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadDeveloperHealth() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [snapshot, events] = await Promise.all([
          infrastructureIntegrationService.getProviderOperationsSnapshot(),
          tmosEventBus.getEvents(),
        ]);
        if (!mounted) return;
        setProviders(snapshot.providers || []);
        setEventsCount(Array.isArray(events) ? events.length : 0);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load developer integration status.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadDeveloperHealth();

    return () => {
      mounted = false;
    };
  }, []);

  const developerSystems = useMemo(() => {
    return providers.map((provider) => ({
      area: String(provider.provider || "unknown").toUpperCase(),
      purpose: "Provider integration through TMOS backend gateway",
      status: provider.fallbackActive ? "Fallback" : "Connected",
      endpoint: provider.source || "Not Connected",
    }));
  }, [providers]);

  const connectedCount = developerSystems.filter((item) => item.status === "Connected").length;
  const hasData = developerSystems.length > 0;

  return (
    <ModulePage
      title="Developer"
      subtitle="Developer operations for API contracts, service integrations, and deployment workflows across TELEMAP."
      summary="Developer workspace reflects real provider connectivity and TMOS event activity from backend APIs."
      stats={[
        { label: "Provider Integrations", value: hasData ? String(developerSystems.length) : "—", tone: "blue", detail: hasData ? "Detected provider adapters" : "Not Connected" },
        { label: "Connected Providers", value: hasData ? String(connectedCount) : "—", tone: "green", detail: hasData ? "No fallback active" : "Waiting for Provider" },
        { label: "Fallback Providers", value: hasData ? String(developerSystems.filter((item) => item.status === "Fallback").length) : "—", tone: "amber", detail: hasData ? "Degraded integration mode" : "No Data Available" },
        { label: "Event Records", value: hasData ? String(eventsCount) : "—", tone: "teal", detail: hasData ? "Current TMOS event stream" : "Connecting..." },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Open API contracts</button>
          <button type="button" className="ghost-button">Run integration checks</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /developer/contracts/status",
        requestModel: "DeveloperContractsStatusRequest",
        responseModel: "DeveloperContractsStatusResponse",
        loadingState: "Load API contract coverage and integration status.",
        emptyState: "Show that no developer integrations are currently registered.",
        errorState: "Display developer platform error and provide contract fallback details.",
      }}
      searchPlaceholder="Search developer area"
      filters={["All", "Connected", "Fallback"]}
      tableTitle="Developer integration workspace"
      tableSubtitle="Contract and deployment readiness for TMOS engineering"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No provider integration records returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = developerSystems.filter((item) => {
          const matchesSearch = item.area.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.status === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Purpose</th>
                <th>Status</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={4} message="Waiting for Provider" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.area}>
                    <td>{item.area}</td>
                    <td>{item.purpose}</td>
                    <td>{item.status}</td>
                    <td>{item.endpoint}</td>
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
