import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";

function fromEnvelope(response) {
  return response?.data?.data || response?.data || {};
}

export const broadcastEngineService = {
  async getStatus() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.broadcast.status);
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async startBroadcast(payload = {}) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.start, payload);
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async stopBroadcast() {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.stop, {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async restartBroadcast() {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.restart, {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async refreshEngine() {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.refresh, {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async setActiveProgram(payload = {}) {
    try {
      const response = await APIClient.patch(API_CONFIG.endpoints.broadcast.program, payload);
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async startRecording() {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.recordStart, {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async stopRecording() {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.recordStop, {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async configureRtmp(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.outputRtmp, payload || {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async configureSrt(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.broadcast.outputSrt, payload || {});
      return fromEnvelope(response);
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
