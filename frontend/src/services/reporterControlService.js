import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";

function normalizeListResponse(response) {
  const payload = response?.data?.data || response?.data;
  return Array.isArray(payload) ? payload : [];
}

function isUnimplemented(error) {
  const status = error?.response?.status;
  return status === 404 || status === 501 || status === 503;
}

export const reporterControlService = {
  async listReporters() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.reporterControl.reporters);
      return normalizeListResponse(response);
    } catch (error) {
      if (isUnimplemented(error)) {
        return [];
      }
      throw new Error(formatApiError(error));
    }
  },

  async updateReporterStatus(reporterId, status) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.reporters}/${reporterId}`;
      const response = await APIClient.patch(endpoint, { status });
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async listStudios() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.reporterControl.studios);
      return normalizeListResponse(response);
    } catch (error) {
      if (isUnimplemented(error)) {
        return [];
      }
      throw new Error(formatApiError(error));
    }
  },

  async createStudio(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.reporterControl.studios, payload || {});
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async updateStudio(studioId, payload) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.studios}/${studioId}`;
      const response = await APIClient.patch(endpoint, payload || {});
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async deleteStudio(studioId) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.studios}/${studioId}`;
      const response = await APIClient.delete(endpoint);
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async listAssignments() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.reporterControl.assignments);
      return normalizeListResponse(response);
    } catch (error) {
      if (isUnimplemented(error)) {
        return [];
      }
      throw new Error(formatApiError(error));
    }
  },

  async createAssignment(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.reporterControl.assignments, payload || {});
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async updateAssignment(assignmentId, payload) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.assignments}/${assignmentId}`;
      const response = await APIClient.patch(endpoint, payload || {});
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async deleteAssignment(assignmentId) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.assignments}/${assignmentId}`;
      const response = await APIClient.delete(endpoint);
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },
};
