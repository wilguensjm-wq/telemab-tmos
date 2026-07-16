import { API_CONFIG } from "../constants/api";
import APIClient from "../api/APIClient";
import { formatApiError } from "../utils/errorHandling";

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

export const mediaService = {
  endpoint: API_CONFIG.endpoints.media.ingestQueue,

  async listIngestQueue() {
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

  async listLibrary() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.media.library);
      return response?.data?.data || response?.data;
    } catch (error) {
      if (isUnimplemented(error)) {
        return [];
      }
      throw new Error(formatApiError(error));
    }
  },
};
