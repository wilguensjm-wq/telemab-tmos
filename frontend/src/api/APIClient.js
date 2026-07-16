import axios from "axios";
import { API_CONFIG } from "../constants/api";
import { requestInterceptor } from "./interceptors/requestInterceptor";
import { responseInterceptor } from "./interceptors/responseInterceptor";

const client = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    "Content-Type": "application/json",
  },
});

client.interceptors.request.use(requestInterceptor, (error) => Promise.reject(error));
client.interceptors.response.use((response) => response, responseInterceptor);

async function request(config) {
  if (API_CONFIG.mode === "mock") {
    throw new Error("Mock mode is disabled. Connect backend gateway services to load data.");
  }

  return client.request(config);
}

async function get(url, config = {}) {
  return request({ ...config, method: "GET", url });
}

async function post(url, data, config = {}) {
  return request({ ...config, method: "POST", url, data });
}

async function put(url, data, config = {}) {
  return request({ ...config, method: "PUT", url, data });
}

async function patch(url, data, config = {}) {
  return request({ ...config, method: "PATCH", url, data });
}

async function remove(url, config = {}) {
  return request({ ...config, method: "DELETE", url });
}

export const APIClient = {
  request,
  get,
  post,
  put,
  patch,
  delete: remove,
};

export default APIClient;
