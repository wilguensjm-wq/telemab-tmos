import { API_CONFIG } from "../constants/api";
import APIClient from "../api/APIClient";
import { formatApiError } from "../utils/errorHandling";

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

export const streamingService = {
  endpoint: API_CONFIG.endpoints.streaming.health,

  async list() {
    try {
      const response = await APIClient.get(this.endpoint);
      return response?.data?.data || response?.data;
    } catch (error) {
      if (isUnimplemented(error)) {
        return [];
      }
      throw new Error(formatApiError(error));
    }
  },

  async runFailover(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.streaming.failover, payload);
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
