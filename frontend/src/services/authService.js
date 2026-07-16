import { API_CONFIG } from "../constants/api";
import APIClient from "../api/APIClient";
import { clearStoredAuth, setStoredAuth, getStoredUser, getStoredSession } from "../utils/storage";
import { formatApiError, createApiError } from "../utils/errorHandling";
import { auditService } from "./auditService";

export const authService = {
  async login(credentials) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.auth.login, {
        username: credentials.username,
        password: credentials.password,
        rememberMe: credentials.rememberMe,
      });
      const payload = response?.data?.data || response?.data;

      if (!payload?.accessToken) {
        throw createApiError("Authentication failed", 401);
      }

      setStoredAuth(payload.accessToken, payload.refreshToken, payload.user);
      await auditService.recordAction({
        actor: payload.user?.name || payload.user?.email || payload.user?.id || "unknown",
        action: "auth.login",
        target: payload.user?.id || "session",
        result: "success",
      });
      return payload;
    } catch (error) {
      await auditService.recordAction({
        actor: credentials.username || "unknown",
        action: "auth.login",
        target: "session",
        result: "failure",
        metadata: { reason: error?.message || "Authentication failed" },
      });
      throw new Error(formatApiError(error));
    }
  },

  async logout() {
    try {
      const { refreshToken } = getStoredSession();
      await APIClient.post(API_CONFIG.endpoints.auth.logout, { refreshToken });
      await auditService.recordAction({
        actor: getStoredUser()?.name || "unknown",
        action: "auth.logout",
        target: "session",
        result: "success",
      });
    } catch (error) {
      await auditService.recordAction({
        actor: getStoredUser()?.name || "unknown",
        action: "auth.logout",
        target: "session",
        result: "failure",
        metadata: { reason: error?.message || "Logout failed" },
      });
      throw new Error(formatApiError(error));
    } finally {
      clearStoredAuth();
    }
  },

  async refreshToken(refreshToken) {
    try {
      const response = await APIClient.post(API_CONFIG.endpoints.auth.refresh, { refreshToken });
      const payload = response?.data?.data || response?.data;

      if (!payload?.accessToken) {
        throw createApiError("Refresh token failed", 401);
      }

      setStoredAuth(payload.accessToken, payload.refreshToken, payload.user);
      await auditService.recordAction({
        actor: payload.user?.name || "unknown",
        action: "auth.refresh",
        target: "session",
        result: "success",
      });
      return payload;
    } catch (error) {
      clearStoredAuth();
      await auditService.recordAction({
        actor: "unknown",
        action: "auth.refresh",
        target: "session",
        result: "failure",
        metadata: { reason: error?.message || "Refresh failed" },
      });
      throw new Error(formatApiError(error));
    }
  },

  async getProfile() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.auth.profile);
      return response?.data?.data || response?.data;
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getPolicies() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.auth.policies);
      return response?.data?.data || response?.data || [];
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getSessions() {
    try {
      const response = await APIClient.get(API_CONFIG.endpoints.auth.sessions);
      return response?.data?.data || response?.data || [];
    } catch (error) {
      throw new Error(formatApiError(error));
    }
  },

  async getAuditHistory() {
    return auditService.listAuditLogs();
  },

  async verifyToken() {
    const storedSession = getStoredSession();
    const storedUser = storedSession.user;

    if (!storedUser || !storedSession.accessToken) {
      return { valid: false, user: null };
    }

    return {
      valid: true,
      user: storedUser,
      accessToken: storedSession.accessToken,
      refreshToken: storedSession.refreshToken,
    };
  },
};
