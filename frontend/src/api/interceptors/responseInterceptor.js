import { API_CONFIG } from "../../constants/api";
import APIClient from "../APIClient";
import { getRefreshToken, setStoredAuth, clearStoredAuth } from "../../utils/storage";

let isRefreshing = false;

export async function responseInterceptor(error) {
  const status = error?.response?.status;

  if (status === 401) {
    const refreshToken = getRefreshToken();

    if (!refreshToken || isRefreshing) {
      clearStoredAuth();
      return Promise.reject(error);
    }

    isRefreshing = true;

    try {
      const response = await APIClient.post(API_CONFIG.endpoints.auth.refresh, { refreshToken });
      const refreshed = response?.data?.data || response?.data;
      setStoredAuth(refreshed.accessToken, refreshed.refreshToken, refreshed.user);
      isRefreshing = false;
      return Promise.reject(refreshed);
    } catch (refreshError) {
      clearStoredAuth();
      isRefreshing = false;
      return Promise.reject(refreshError);
    }
  }

  return Promise.reject(error);
}
