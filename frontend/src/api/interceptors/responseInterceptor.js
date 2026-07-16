import { API_CONFIG } from "../../constants/api";
import APIClient from "../APIClient";
import { getRefreshToken, setStoredAuth, clearStoredAuth } from "../../utils/storage";

let refreshPromise = null;

function shouldSkipRefresh(error) {
  const url = String(error?.config?.url || "");
  return url.includes(API_CONFIG.endpoints.auth.login) || url.includes(API_CONFIG.endpoints.auth.refresh);
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
      clearStoredAuth();
      return Promise.reject(refreshError);
    }
  }

  return Promise.reject(error);
}
