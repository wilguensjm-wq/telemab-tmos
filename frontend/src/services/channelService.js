import { API_CONFIG } from "../constants/api";
import APIClient from "../api/APIClient";
import { formatApiError } from "../utils/errorHandling";

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

export const channelService = {
  endpoint: API_CONFIG.endpoints.masterControl.status,

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

  async triggerTakeover(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.masterControl.takeover, payload);
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
