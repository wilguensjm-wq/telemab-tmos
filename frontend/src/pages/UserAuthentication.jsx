import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { authService } from "../services/authService";
import EmptyTableRow from "../components/common/EmptyTableRow";

export default function UserAuthentication() {
  const [policies, setPolicies] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSecurity() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const [policyData, sessionData, auditData] = await Promise.all([
          authService.getPolicies(),
          authService.getSessions(),
          authService.getAuditHistory(),
        ]);

        if (!mounted) return;
        setPolicies(policyData || []);
        setSessions(sessionData || []);
        setAuditLogs(auditData || []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load security controls.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadSecurity();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    const policyRows = policies.map((item) => ({
      policy: item.policy,
      provider: item.provider,
      state: item.state,
      scope: item.scope,
    }));

    const sessionRows = sessions.map((item) => ({
      policy: `Session ${item.sessionId}`,
      provider: item.user,
      state: item.state,
      scope: item.role,
    }));

    const auditRows = auditLogs.slice(0, 6).map((item) => ({
      policy: item.action || "audit.event",
      provider: item.actor || "system",
      state: item.result || "recorded",
      scope: item.target || "platform",
    }));

    return [...policyRows, ...sessionRows, ...auditRows];
  }, [policies, sessions, auditLogs]);
  const hasData = policies.length > 0 || sessions.length > 0 || auditLogs.length > 0;

  return (
    <ModulePage
      title="Security"
      subtitle="Manage identity federation, session controls, and access policies for TMOS operators and services."
      summary="Authentication, sessions, and audit controls are enforced across TMOS operator and API activity."
      stats={[
        { label: "Active Sessions", value: hasData ? String(sessions.length) : "—", tone: "blue", detail: hasData ? "Across all shifts" : "Not Connected" },
        { label: "MFA Coverage", value: policies.length > 0 ? "Connected" : "Not Connected", tone: "green", detail: "From provider policy feed" },
        { label: "Policy Controls", value: hasData ? String(policies.length) : "—", tone: "teal", detail: hasData ? "Authentication and RBAC safeguards" : "Waiting for Provider" },
        { label: "Audit Entries", value: hasData && auditLogs.length > 0 ? String(auditLogs.length) : "—", tone: "amber", detail: hasData ? "Operator activity history" : "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Review security events</button>
          <button type="button" className="ghost-button">Force token refresh</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /auth/policies",
        requestModel: "SecurityPolicyRequest",
        responseModel: "SecurityPolicyResponse",
        loadingState: "Load policy state and session security telemetry.",
        emptyState: "Show that no authentication policies are configured.",
        errorState: "Display security policy retrieval error with protected fallback.",
      }}
      searchPlaceholder="Search policy"
      filters={["All", "Enforced", "Scheduled", "Active", "success", "failure"]}
      tableTitle="Authentication policy matrix"
      tableSubtitle="Identity and session protection policies currently applied"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No security policy or audit entries returned."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((item) => {
          const matchesSearch = item.policy.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || item.state === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Provider</th>
                <th>State</th>
                <th>Scope</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={4} message="Provider Not Configured" />
              ) : (
                filtered.map((item) => (
                  <tr key={item.policy}>
                    <td>{item.policy}</td>
                    <td>{item.provider}</td>
                    <td>{item.state}</td>
                    <td>{item.scope}</td>
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
