import { API_CONFIG } from "../constants/api";

export function modeToSource() {
  return API_CONFIG.mode === "live" ? "live" : "backend-cache";
}

export function sourceToBadge(source) {
  if (source === "live") return { label: "Live", tone: "live" };
  if (source === "backend-cache") return { label: "Backend Cache", tone: "cache" };
  return { label: "Live connection not configured", tone: "demo" };
}