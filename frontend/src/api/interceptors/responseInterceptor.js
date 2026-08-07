import { API_CONFIG } from "../../constants/api";
import APIClient from "../APIClient";
import {
  getAccessToken,
  getRefreshToken,
  setStoredAuth,
  clearStoredAuth,
} from "../../utils/storage";

let refreshPromise = null;

function shouldSkipRefresh(error) {
  const url = String(error?.config?.url || "");
  return url.includes(API_CONFIG.endpoints.auth.login) || url.includes(API_CONFIG.endpoints.auth.refresh);
}

function extractBearerToken(headers = {}) {
  const authHeader = String(headers?.Authorization || headers?.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

function shouldClearAuthForRequest(originalRequest = {}) {
  const requestToken = extractBearerToken(originalRequest.headers || {});
  const currentToken = String(getAccessToken() || "");

  // If no request token was attached, avoid clearing global auth state.
  if (!requestToken) {
    return false;
  }

  // Only clear storage when the failing request uses the currently active token.
  return Boolean(currentToken) && requestToken === currentToken;
}

async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await APIClient.post(API_CONFIG.endpoints.auth.refresh, { refreshToken });
  const refreshed = response?.data?.data || response?.data;

  if (!refreshed?.accessToken) {
    throw new Error("Refresh token failed");
  }

  setStoredAuth(refreshed.accessToken, refreshed.refreshToken, refreshed.user);
  return refreshed;
}

export async function responseInterceptor(error) {
  const status = error?.response?.status;
  const originalRequest = error?.config || {};

  if (status === 401 && !shouldSkipRefresh(error) && !originalRequest._retry) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      if (shouldClearAuthForRequest(originalRequest)) {
        clearStoredAuth();
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (!refreshPromise) {
        refreshPromise = refreshSession().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
      return APIClient.request(originalRequest);
    } catch (refreshError) {
      if (shouldClearAuthForRequest(originalRequest)) {
        clearStoredAuth();
      }
      return Promise.reject(refreshError);
    }
  }

  return Promise.reject(error);
}
