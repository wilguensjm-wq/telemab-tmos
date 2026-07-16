import { API_CONFIG } from "../constants/api";
import { clearStoredAuth } from "./storage";

export function getSessionTimeoutRemaining(startedAt) {
  if (!startedAt) return API_CONFIG.sessionTimeoutMs;
  return Math.max(0, startedAt + API_CONFIG.sessionTimeoutMs - Date.now());
}

export function handleSessionTimeout() {
  clearStoredAuth();

  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}
