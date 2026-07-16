import APIClient from "../api/APIClient";
import { API_CONFIG } from "../constants/api";
import { formatApiError } from "../utils/errorHandling";

export const auditService = {
  async recordAction({ actor, action, target, result, metadata = {} }) {
    return null;
  },

  async listAuditLogs() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.audit);
      const payload = response?.data?.data || response?.data || [];
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  listOperatorActivity() {
    return [];
  },
};
