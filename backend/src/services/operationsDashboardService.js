import { logger } from "../logging/logger.js";

export class OperationsDashboardService {
  /**
   * Creates a new OperationsDashboardService instance.
   * @param {Object} config - Configuration object.
   * @param {Object} config.providerRegistry - ProviderRegistry instance for discovering providers.
   * @param {Object} config.orchestration - ProviderOrchestrationService instance for health checks.
   * @param {Object} config.databaseService - DatabaseService instance for database health.
   */
  constructor({ providerRegistry, orchestration, databaseService }) {
    this.providerRegistry = providerRegistry;
    this.orchestration = orchestration;
    this.databaseService = databaseService;
  }

  /**
   * Gets human-readable display name for a provider key.
   * Uses a simple mapping as a fallback when registry metadata is unavailable.
   * @param {string} key - Provider registry key (e.g., "proxmox", "docker").
   * @returns {string} Display name (e.g., "Proxmox VE", "Docker Engine").
   * @private
   */
  #getDisplayName(key) {
    const displayNames = {
      "proxmox": "Proxmox VE",
      "docker": "Docker Engine",
      "portainer": "Portainer",
      "uptime-kuma": "Uptime Kuma",
      "nginx-proxy-manager": "Nginx Proxy Manager",
      "postgresql": "PostgreSQL Database",
      "tmos-backend": "TMOS Backend API",
    };
    return displayNames[key] || key.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  /**
   * Maps provider status values to standard normalized status enum.
   * Handles variations from different provider implementations.
   * @param {string} providerStatus - Raw status from provider health response.
   * @returns {string} One of: "healthy", "degraded", "unavailable", "not_implemented", "disabled".
   * @private
   */
  #normalizeStatus(providerStatus) {
    const statusMap = {
      "healthy": "healthy",
      "ok": "healthy",
      "connected": "healthy",
      "degraded": "degraded",
      "warning": "degraded",
      "unavailable": "unavailable",
      "unhealthy": "unavailable",
      "not_implemented": "not_implemented",
      "disabled": "disabled",
    };
    return statusMap[String(providerStatus || "").toLowerCase()] || "unavailable";
  }

  /**
   * Normalizes a provider health response to the standard TMOS health schema.
   * Handles both successful health checks and errors.
   * @param {string} providerKey - Provider registry key.
   * @param {Object} healthData - Raw health data from provider (may be null if error occurred).
   * @param {Error} error - Error object if health check failed (may be null if successful).
   * @returns {Object} Normalized health object with standard schema.
   * @private
   */
  #normalizeProviderHealth(providerKey, healthData, error = null) {
    const timestamp = new Date().toISOString();

    // If provider health check threw an error
    if (error) {
      logger.warn("provider.health.check_failed", {
        provider: providerKey,
        error: error.message,
        code: error.code || "UNKNOWN",
      });

      return {
        provider: providerKey,
        displayName: this.#getDisplayName(providerKey),
        status: "unavailable",
        connected: false,
        lastCheck: timestamp,
        message: error.message || "Health check failed",
      };
    }

    // Handle null/undefined healthData
    if (!healthData) {
      return {
        provider: providerKey,
        displayName: this.#getDisplayName(providerKey),
        status: "unavailable",
        connected: false,
        lastCheck: timestamp,
        message: "No health data returned",
      };
    }

    // Normalize status value from provider
    const normalizedStatus = this.#normalizeStatus(healthData.status);

    // Build normalized response
    const normalized = {
      provider: providerKey,
      displayName: this.#getDisplayName(providerKey),
      status: normalizedStatus,
      connected: Boolean(healthData.connected),
      lastCheck: timestamp,
      message: healthData.message || `Status: ${healthData.status || "unknown"}`,
    };

    // Include metrics if provider provided them
    if (healthData.metrics && typeof healthData.metrics === "object") {
      normalized.metrics = healthData.metrics;
    }

    // Preserve other provider-specific fields that might be useful
    if (healthData.reason) {
      normalized.reason = healthData.reason;
    }

    return normalized;
  }

  /**
   * Aggregates health status from all registered providers, backend, and database.
   * Returns a summary even if individual providers fail.
   * Never throws an exception - handles errors gracefully.
   *
   * @returns {Promise<Object>} Object containing:
   *   - timestamp: ISO 8601 timestamp of aggregation
   *   - services: Array of normalized provider health objects
   *   - summary: Object with aggregate statistics
   *
   * @example
   * const health = await dashboardService.getHealthSummary();
   * // Returns:
   * // {
   * //   timestamp: "2026-07-24T12:34:56.000Z",
   * //   services: [
   * //     { provider: "tmos-backend", status: "healthy", ... },
   * //     { provider: "postgresql", status: "healthy", ... },
   * //     { provider: "docker", status: "healthy", ... },
   * //     ...
   * //   ],
   * //   summary: {
   * //     total: 7,
   * //     healthy: 6,
   * //     degraded: 0,
   * //     unavailable: 1,
   * //     overallStatus: "healthy"
   * //   }
   * // }
   */
  async getHealthSummary() {
    const timestamp = new Date().toISOString();
    const services = [];

    // 1. Backend API health (always healthy if this endpoint was reached)
    services.push({
      provider: "tmos-backend",
      displayName: "TMOS Backend API",
      status: "healthy",
      connected: true,
      lastCheck: timestamp,
      message: "Backend API is operational",
    });

    // 2. Database health
    try {
      const dbHealth = await this.databaseService.health();
      // DatabaseService.health() returns { status: "ok", latencyMs, pool }
      const dbStatus = dbHealth.status === "ok" ? "healthy" : "unavailable";
      services.push({
        provider: "postgresql",
        displayName: this.#getDisplayName("postgresql"),
        status: dbStatus,
        connected: dbStatus === "healthy",
        lastCheck: timestamp,
        message: dbStatus === "healthy"
          ? `Latency: ${dbHealth.latencyMs || 0}ms`
          : "Database connection failed",
        metrics: dbStatus === "healthy" ? { latencyMs: dbHealth.latencyMs } : {},
      });
    } catch (error) {
      logger.error("database.health.check_failed", {
        error: error.message,
        code: error.code || "UNKNOWN",
      });

      services.push({
        provider: "postgresql",
        displayName: this.#getDisplayName("postgresql"),
        status: "unavailable",
        connected: false,
        lastCheck: timestamp,
        message: error.message || "Database health check failed",
      });
    }

    // 3. All registered providers (discover dynamically - no hardcoding)
    const providerEntries = this.providerRegistry.list();
    const providerHealthPromises = providerEntries.map(({ key }) =>
      (async () => {
        try {
          const healthData = await this.orchestration.providerHealth(key);
          return { key, healthData, error: null };
        } catch (error) {
          return { key, healthData: null, error };
        }
      })().catch(err => ({
        // Defensive: if async function itself fails, still return structured object
        key,
        healthData: null,
        error: new Error(`Promise failed: ${err.message}`),
      }))
    );

    // Execute all provider health checks in parallel (never sequential)
    const providerResults = await Promise.allSettled(providerHealthPromises);

    // Process results - even failed promises give us data
    for (const result of providerResults) {
      if (result.status === "fulfilled") {
        const { key, healthData, error } = result.value;
        const normalized = this.#normalizeProviderHealth(key, healthData, error);
        services.push(normalized);
      } else if (result.status === "rejected") {
        // Defensive: shouldn't happen with our .catch() wrapper, but handle gracefully
        logger.error("provider.health.promise_rejected", {
          error: result.reason?.message || String(result.reason),
        });
        // Still add a service entry so provider is visible in health dashboard
        services.push({
          provider: "unknown",
          displayName: this.#getDisplayName("unknown"),
          status: "unavailable",
          connected: false,
          lastCheck: timestamp,
          message: "Health check failed",
        });
      }
    }

    // 4. Calculate summary statistics (frontend will decide UI representation)
    const healthy = services.filter(s => s.status === "healthy").length;
    const degraded = services.filter(s => s.status === "degraded").length;
    const unavailable = services.filter(s => s.status === "unavailable").length;
    const notImplemented = services.filter(s => s.status === "not_implemented").length;

    // Overall status logic: critical if any critical service down, degraded if any degraded
    let overallStatus = "healthy";
    if (
      unavailable > 0 && (
        services.some(s => s.provider === "tmos-backend" && s.status !== "healthy") ||
        services.some(s => s.provider === "postgresql" && s.status !== "healthy")
      )
    ) {
      overallStatus = "critical";
    } else if (unavailable > 0 || degraded > 0) {
      overallStatus = "degraded";
    }

    return {
      timestamp,
      services,
      summary: {
        total: services.length,
        healthy,
        degraded,
        unavailable,
        notImplemented,
        overallStatus,
      },
    };
  }
}
