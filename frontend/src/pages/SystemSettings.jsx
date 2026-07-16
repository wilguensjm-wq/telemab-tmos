import ModulePage from "../components/common/ModulePage";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { infrastructureIntegrationService } from "../services/infrastructureIntegrationService";
import { sourceToBadge } from "../services/sourceState";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function SystemSettings() {
  const { pathname } = useLocation();
  const [proxyHosts, setProxyHosts] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [source, setSource] = useState("backend-cache");
  const [fallbackReason, setFallbackReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadProxyData() {
      if (!pathname.includes("/infrastructure/dns") && !pathname.includes("/settings")) {
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await infrastructureIntegrationService.getProxyOverview();
        if (!mounted) return;
        setProxyHosts(data.hosts || []);
        setCertificates(data.certificates || []);
        setSource(data.source || "backend-cache");
        setFallbackReason(data.fallbackActive ? data.fallbackReason || "Direct provider unavailable" : "");
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load proxy manager data.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadProxyData();

    return () => {
      mounted = false;
    };
  }, [pathname]);

  async function reloadProxyData() {
    const data = await infrastructureIntegrationService.getProxyOverview();
    setProxyHosts(data.hosts || []);
    setCertificates(data.certificates || []);
    setSource(data.source || "backend-cache");
    setFallbackReason(data.fallbackActive ? data.fallbackReason || "Direct provider unavailable" : "");
  }

  async function handleRenew(certId) {
    if (!window.confirm("Confirm certificate renew action?")) return;

    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await infrastructureIntegrationService.renewProxyCertificate(certId);
      setActionMessage(result.message || "Certificate renew completed.");
      await reloadProxyData();
    } catch (error) {
      setErrorMessage(error.message || "Failed to renew certificate.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReloadProxy() {
    if (!window.confirm("Confirm proxy reload?")) return;

    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await infrastructureIntegrationService.reloadProxy();
      setActionMessage(result.message || "Proxy reload completed.");
      await reloadProxyData();
    } catch (error) {
      setErrorMessage(error.message || "Failed to reload proxy.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleHost(host) {
    const nextEnabled = host.status !== "Online";
    if (!window.confirm(`Confirm ${nextEnabled ? "enable" : "disable"} host ${host.domain}?`)) return;

    setIsLoading(true);
    setErrorMessage("");
    try {
      const result = await infrastructureIntegrationService.setProxyHostEnabled(host.id, nextEnabled);
      setActionMessage(result.message || "Host toggle completed.");
      await reloadProxyData();
    } catch (error) {
      setErrorMessage(error.message || "Failed to toggle host.");
    } finally {
      setIsLoading(false);
    }
  }

  const certificateById = useMemo(() => {
    return certificates.reduce((acc, cert) => {
      acc[cert.id] = cert;
      return acc;
    }, {});
  }, [certificates]);
  const hasData = proxyHosts.length > 0 || certificates.length > 0;

  return (
    <ModulePage
      title={pathname.includes("/infrastructure/dns") ? "DNS" : "Settings"}
      subtitle="Control Nginx Proxy Manager, domain routing, certificate lifecycle, and platform governance settings."
      summary={`Proxy and DNS source: ${sourceToBadge(source).label}.${fallbackReason ? ` Fallback active: ${fallbackReason}` : ""}${actionMessage ? ` Last action: ${actionMessage}` : ""}`}
      dataSource={sourceToBadge(source)}
      stats={[
        { label: "Proxy Hosts", value: hasData ? String(proxyHosts.length) : "—", tone: "blue", detail: hasData ? "Managed by Nginx Proxy Manager" : "Not Connected" },
        { label: "SSL Certificates", value: hasData ? String(certificates.length) : "—", tone: "green", detail: hasData ? "Certificate inventory" : "Waiting for Provider" },
        { label: "Online Hosts", value: hasData ? String(proxyHosts.filter((host) => host.status === "Online").length) : "—", tone: "teal", detail: hasData ? "Ingress routes online" : "No Data Available" },
        { label: "Expiring Certs", value: hasData ? String(certificates.filter((cert) => Number(cert.daysRemaining || 0) <= 30).length) : "—", tone: "cyan", detail: hasData ? "<= 30 days remaining" : "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button" onClick={handleReloadProxy}>Reload proxy</button>
          <button type="button" className="ghost-button">Open route manager</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /infrastructure/proxy/hosts",
        requestModel: "ProxyHostsRequest",
        responseModel: "ProxyHostsResponse",
        loadingState: "Load platform administration and route governance settings.",
        emptyState: "Show that no administration settings are configured.",
        errorState: "Display administration API error and retain local controls.",
      }}
      searchPlaceholder="Search setting"
      filters={["All", "Healthy", "Warning"]}
      tableTitle="Administration controls"
      tableSubtitle="Nginx Proxy Manager and platform governance configuration"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No proxy hosts are currently configured."
    >
      {({ searchValue, activeFilter }) => {
        const filteredHosts = proxyHosts.filter((host) => {
          const matchesSearch = host.domain.toLowerCase().includes(searchValue.toLowerCase());
          const cert = certificateById[host.sslCertificateId] || {};
          const statusToken = cert.status || host.status || "Healthy";
          const normalizedStatus = statusToken === "Online" ? "Healthy" : "Warning";
          const matchesFilter = activeFilter === "All" || normalizedStatus === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Upstream</th>
                <th>Status</th>
                <th>Certificate</th>
                <th>Expiration</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHosts.length === 0 ? (
                <EmptyTableRow colSpan={6} message="No Data Available" />
              ) : (
                filteredHosts.map((host) => {
                  const cert = certificateById[host.sslCertificateId] || {};

                  return (
                    <tr key={host.id || host.domain}>
                      <td>{host.domain}</td>
                      <td>{host.upstream}</td>
                      <td>{host.status}</td>
                      <td>{cert.status || "Unknown"}</td>
                      <td>{cert.daysRemaining != null ? `${cert.daysRemaining} days` : "N/A"}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" className="ghost-button" onClick={() => handleToggleHost(host)}>
                            {host.status === "Online" ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => handleRenew(host.sslCertificateId)}
                          >
                            Renew Cert
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        );
      }}
    </ModulePage>
  );
}
