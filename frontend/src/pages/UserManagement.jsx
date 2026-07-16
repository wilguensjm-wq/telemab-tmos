import ModulePage from "../components/common/ModulePage";
import { useEffect, useMemo, useState } from "react";
import { userService } from "../services/userService";
import EmptyTableRow from "../components/common/EmptyTableRow";

function normalizeStatus(value) {
  const token = String(value || "").toLowerCase();
  if (token.includes("active")) return "Active";
  if (token.includes("pending")) return "Pending Review";
  if (token.includes("disabled")) return "Disabled";
  return "Unknown";
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadUsers() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const data = await userService.list();
        if (!mounted) return;
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error.message || "Failed to load users.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadUsers();

    return () => {
      mounted = false;
    };
  }, []);

  const rows = useMemo(() => {
    return users.map((item, index) => ({
      name: item.name || item.username || `User ${index + 1}`,
      role: item.role || "Unknown",
      team: item.team || item.department || "Unassigned",
      status: normalizeStatus(item.status || item.state),
    }));
  }, [users]);
  const hasData = rows.length > 0;

  return (
    <ModulePage
      title="Users"
      subtitle="Provision TELEMAP operators, engineers, and admins with role-based access controls."
      summary="User records are loaded from backend IAM endpoints through TMOS gateway APIs."
      stats={[
        { label: "Licensed Users", value: hasData ? String(rows.length) : "—", tone: "blue", detail: hasData ? "Current backend payload" : "Not Connected" },
        { label: "Active", value: hasData ? String(rows.filter((item) => item.status === "Active").length) : "—", tone: "green", detail: hasData ? "Enabled accounts" : "Waiting for Provider" },
        { label: "Pending Review", value: hasData ? String(rows.filter((item) => item.status === "Pending Review").length) : "—", tone: "amber", detail: hasData ? "Awaiting approval" : "Waiting for Provider" },
        { label: "Unknown", value: hasData ? String(rows.filter((item) => item.status === "Unknown").length) : "—", tone: "teal", detail: "No Data Available" },
      ]}
      actions={(
        <>
          <button type="button" className="action-button">Add user</button>
          <button type="button" className="ghost-button">Review access</button>
        </>
      )}
      apiSpec={{
        endpoint: "GET /iam/users",
        requestModel: "IamUsersRequest",
        responseModel: "IamUsersResponse",
        loadingState: "Load user identities and role assignments.",
        emptyState: "Show that no users are currently provisioned.",
        errorState: "Display IAM retrieval failure and security-safe fallback.",
      }}
      searchPlaceholder="Search user"
      filters={["All", "Active", "Pending Review", "Disabled", "Unknown"]}
      tableTitle="Team access"
      tableSubtitle="Licensed accounts and their current status"
      isLoading={isLoading}
      errorMessage={errorMessage}
      emptyMessage="No IAM users were returned. Waiting for provider connection."
    >
      {({ searchValue, activeFilter }) => {
        const filtered = rows.filter((user) => {
          const matchesSearch = user.name.toLowerCase().includes(searchValue.toLowerCase());
          const matchesFilter = activeFilter === "All" || user.status === activeFilter;
          return matchesSearch && matchesFilter;
        });

        return (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <EmptyTableRow colSpan={4} message="No Data Available" />
              ) : (
                filtered.map((user) => (
                  <tr key={user.name}>
                    <td>{user.name}</td>
                    <td>{user.role}</td>
                    <td>{user.team}</td>
                    <td>{user.status}</td>
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
