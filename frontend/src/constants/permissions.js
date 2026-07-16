export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard:view",
  COMMAND_CENTER_VIEW: "command-center:view",
  CHANNELS_MANAGE: "channels:manage",
  MEDIA_MANAGE: "media:manage",
  SCHEDULER_MANAGE: "scheduler:manage",
  STREAMING_VIEW: "streaming:view",
  STREAMING_FAILOVER: "streaming:failover",
  ANALYTICS_VIEW: "analytics:view",
  INCIDENTS_ACKNOWLEDGE: "incidents:acknowledge",
  AI_VIEW: "ai:view",
  AI_REPORTS_GENERATE: "ai:reports:generate",
  USERS_MANAGE: "users:manage",
  AUDIT_VIEW: "audit:view",
  SETTINGS_MANAGE: "settings:manage",
};

export function hasPermission(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}
