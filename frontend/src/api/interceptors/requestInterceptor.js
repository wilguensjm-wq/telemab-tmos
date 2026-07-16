import { getAccessToken } from "../../utils/storage";

export function requestInterceptor(config) {
  const token = getAccessToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
}
