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

function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}

function buildFallbackEmail(username) {
  const token = normalizeToken(username).replace(/[^a-z0-9._-]/g, "-") || `reporter-${Date.now()}`;
  return `${token}@tmos.local`;
}

export const reporterControlService = {
  async createReporter(payload) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.reporterControl.reporters, payload || {});
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

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

  async listPendingReporters() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.reporterControl.pending);
      return normalizeListResponse(response);
    } catch (error) {
      if (isUnimplemented(error)) {
        const reporters = await this.listReporters();
        return reporters.filter((reporter) => {
          const status = normalizeToken(reporter?.status);
          return status === "pending" || status === "waiting";
        });
      }
      throw new Error(formatApiError(error));
    }
  },

  async ensureReporterForUser(user = {}) {
    const username = normalizeToken(user?.username);
    const fullName = String(user?.name || user?.username || "TMOS Reporter").trim();
    const preferredEmail = normalizeToken(user?.email) || (username.includes("@") ? username : "");

    try {
      const reporters = await this.listReporters();
      const matched = reporters.find((reporter) => {
        const email = normalizeToken(reporter?.email);
        const notes = normalizeToken(reporter?.notes);
        const reporterName = normalizeToken(reporter?.fullName);
        return (
          (preferredEmail && email === preferredEmail)
          || (username && email === username)
          || (username && notes.includes(`auth:${username}`))
          || (fullName && reporterName === normalizeToken(fullName))
        );
      });

      if (matched) {
        return matched;
      }

      return this.createReporter({
        fullName,
        email: preferredEmail || buildFallbackEmail(username || fullName),
        status: "offline",
        notes: username ? `auth:${username}` : "auto-created-from-reporter-portal",
      });
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getReporterById(reporterId) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.reporters}/${reporterId}`;
      const response = await APIClient.get(endpoint);
      return response?.data?.data || response?.data || null;
    } catch (error) {
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

  async updateReporter(reporterId, payload) {
    try {
      const endpoint = `${API_CONFIG.endpoints.reporterControl.reporters}/${reporterId}`;
      const response = await APIClient.patch(endpoint, payload || {});
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
