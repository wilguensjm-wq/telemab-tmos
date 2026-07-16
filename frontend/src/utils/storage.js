const TOKEN_KEY = "tmos.accessToken";
const REFRESH_TOKEN_KEY = "tmos.refreshToken";
const USER_KEY = "tmos.user";
const AUDIT_LOG_KEY = "tmos.auditLog";
const OPERATOR_ACTIVITY_KEY = "tmos.operatorActivity";

function getStorage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

export function getAccessToken() {
  return getStorage()?.getItem(TOKEN_KEY) || null;
}

export function getRefreshToken() {
  return getStorage()?.getItem(REFRESH_TOKEN_KEY) || null;
}

export function getStoredUser() {
  const raw = getStorage()?.getItem(USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    clearStoredAuth();
    return null;
  }
}

export function getStoredSession() {
  const user = getStoredUser();
  return {
    user,
    accessToken: getAccessToken(),
    refreshToken: getRefreshToken(),
  };
}

export function setStoredAuth(accessToken, refreshToken, user, storage = getStorage()) {
  if (!storage) return;

  storage.setItem(TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  storage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredAuth() {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(USER_KEY);
}

function appendToArrayKey(key, item, limit = 500) {
  const storage = getStorage();
  if (!storage) return;

  const existing = JSON.parse(storage.getItem(key) || "[]");
  const next = [item, ...existing].slice(0, limit);
  storage.setItem(key, JSON.stringify(next));
}

function readArrayKey(key) {
  const storage = getStorage();
  if (!storage) return [];

  try {
    return JSON.parse(storage.getItem(key) || "[]");
  } catch {
    storage.removeItem(key);
    return [];
  }
}

export function appendAuditLog(entry) {
  appendToArrayKey(AUDIT_LOG_KEY, entry, 1000);
}

export function getAuditLog() {
  return readArrayKey(AUDIT_LOG_KEY);
}

export function appendOperatorActivity(entry) {
  appendToArrayKey(OPERATOR_ACTIVITY_KEY, entry, 1000);
}

export function getOperatorActivity() {
  return readArrayKey(OPERATOR_ACTIVITY_KEY);
}
