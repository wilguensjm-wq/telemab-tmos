import { config, envDiagnostics } from "./config/index.js";
import { logger } from "./logging/logger.js";
import { createApp } from "./app.js";
import { ProviderRegistry } from "./providers/sdk/ProviderRegistry.js";
import { buildProviderRegistry } from "./providers/sdk/ProviderFactory.js";
import { ProviderOrchestrationService } from "./services/providerOrchestrationService.js";
import { enforceVpnStartupPolicy } from "./services/startupPolicyService.js";
import { DatabaseClient } from "./db/client.js";
import { runMigrations } from "./db/migrationRunner.js";
import { UserRepository } from "./repositories/UserRepository.js";
import { SessionRepository } from "./repositories/SessionRepository.js";
import { EventRepository } from "./repositories/EventRepository.js";
import { AuditRepository } from "./repositories/AuditRepository.js";
import { ConfigRepository } from "./repositories/ConfigRepository.js";
import { ProviderStateRepository } from "./repositories/ProviderStateRepository.js";
import { RbacRepository } from "./repositories/RbacRepository.js";
import { ReporterRepository } from "./repositories/ReporterRepository.js";
import { StudioRepository } from "./repositories/StudioRepository.js";
import { AssignmentRepository } from "./repositories/AssignmentRepository.js";
import { PresenceRepository } from "./repositories/PresenceRepository.js";
import { AuthService } from "./services/authService.js";
import { EventService } from "./services/eventService.js";
import { AuditService } from "./services/auditService.js";
import { AuthorizationService } from "./services/authorizationService.js";
import { PlatformConfigService } from "./services/platformConfigService.js";
import { ProviderStateService } from "./services/providerStateService.js";
import { ReporterService } from "./services/reporterService.js";
import { StudioService } from "./services/studioService.js";
import { AssignmentService } from "./services/assignmentService.js";
import { PresenceService } from "./services/presenceService.js";
import { OperationsDashboardService } from "./services/operationsDashboardService.js";
import { setAuthorizationDependencies } from "./middleware/auth.js";
import { TmosError } from "./errors/TmosError.js";
import { DatabaseService } from "./db/databaseService.js";
import { PERMISSION_CATALOG, ROLE_CATALOG, ROLE_PERMISSION_CATALOG } from "./auth/permissionCatalog.js";
import { PERMISSIONS } from "./auth/permissionCatalog.js";
import { assertNoUnmappedProtectedV1Routes } from "./auth/routeAuthorization.js";
import { createPresenceGateway } from "./realtime/presenceGateway.js";
import { createServer } from "node:http";
import { MediaRepository } from "./repositories/MediaRepository.js";
import { MediaProviderRegistry } from "./media/MediaProviderRegistry.js";
import { buildMediaProviderRegistry } from "./media/buildMediaProviderRegistry.js";
import { MediaService } from "./services/mediaService.js";
import { MediaSessionManager } from "./services/mediaSessionManager.js";
import { MediaPolicyEngine } from "./services/MediaPolicyEngine.js";
import { IdempotencyService } from "./services/IdempotencyService.js";
import { TransactionalOrchestrationFacade } from "./services/TransactionalOrchestrationFacade.js";
import { BroadcastEngine } from "./services/broadcast/broadcastEngine.js";
import { FfmpegManager } from "./services/broadcast/ffmpegManager.js";
import { RecordingManager } from "./services/broadcast/recordingManager.js";
import { RtmpOutputManager } from "./services/broadcast/rtmpOutputManager.js";
import { SrtOutputManager } from "./services/broadcast/srtOutputManager.js";
import { BroadcastHealthService } from "./services/broadcast/broadcastHealthService.js";
import { validateRemoteReporterDeployment } from "./services/deploymentGuardService.js";

const STARTUP_STEP_TIMEOUT_MS = Number(process.env.TMOS_STARTUP_STEP_TIMEOUT_MS || 30000);

function formatErrorStack(error) {
  if (!error) return "";
  if (typeof error.stack === "string" && error.stack.trim()) return error.stack;
  return String(error);
}

async function runStartupStep(name, fn) {
  logger.info("startup.step.begin", { step: name });
  const startedAt = Date.now();

  let timeoutHandle = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TmosError({
        code: "STARTUP_STEP_TIMEOUT",
        message: `Startup step '${name}' exceeded timeout`,
        status: 500,
        details: { step: name, timeoutMs: STARTUP_STEP_TIMEOUT_MS },
      }));
    }, STARTUP_STEP_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    logger.info("startup.step.done", {
      step: name,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logger.error("startup.step.failed", {
      step: name,
      durationMs: Date.now() - startedAt,
      code: error?.code || "INTERNAL_ERROR",
      message: error?.message || "Unknown startup step error",
      details: error?.details || {},
      stack: formatErrorStack(error),
    });
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function bootstrap() {
  const deploymentGuard = await runStartupStep("deployment_guard", () => validateRemoteReporterDeployment(config));
  if (!deploymentGuard.valid) {
    throw new TmosError({
      code: "DEPLOYMENT_CONFIG_INVALID",
      message: deploymentGuard.message || "Startup blocked by remote reporter deployment policy",
      status: 500,
      details: {
        reason: deploymentGuard.reason,
        ...deploymentGuard.details,
      },
    });
  }

  try {
    await runStartupStep("rbac_route_mapping", () => assertNoUnmappedProtectedV1Routes());
  } catch (error) {
    throw new TmosError({
      code: "RBAC_CONFIG_INVALID",
      message: "Startup blocked: protected routes without explicit permission mapping",
      status: 500,
      details: { reason: error?.message || "Unknown RBAC route mapping error" },
    });
  }

  if (!config.database.url) {
    throw new TmosError({
      code: "DATABASE_CONFIG_MISSING",
      message: "TMOS_DATABASE_URL is required when database persistence is enabled",
      status: 500,
    });
  }

  const db = new DatabaseClient({
    connectionString: config.database.url,
    ssl: config.database.ssl,
    max: config.database.maxPoolSize,
    idleTimeoutMs: config.database.idleTimeoutMs,
    connectionTimeoutMs: config.database.connectionTimeoutMs,
    queryTimeoutMs: config.database.queryTimeoutMs,
    onError: (error) => {
      logger.error("database.pool.error", {
        code: error?.code || "UNKNOWN",
        message: error?.message || "Database pool error",
      });
    },
  });

  await runStartupStep("db_migrations", () => runMigrations({ db, logger }));

  const userRepository = new UserRepository({ db });
  const sessionRepository = new SessionRepository({ db });
  const eventRepository = new EventRepository({ db });
  const auditRepository = new AuditRepository({ db });
  const configRepository = new ConfigRepository({ db });
  const providerStateRepository = new ProviderStateRepository({ db });
  const rbacRepository = new RbacRepository({ db });
  const reporterRepository = new ReporterRepository({ db });
  const studioRepository = new StudioRepository({ db });
  const assignmentRepository = new AssignmentRepository({ db });
  const presenceRepository = new PresenceRepository({ db });
  const mediaRepository = new MediaRepository({ db });
  const databaseService = new DatabaseService({ db });

  await runStartupStep("rbac_catalog_sync", () => rbacRepository.syncCatalog({
    roles: ROLE_CATALOG,
    permissions: PERMISSION_CATALOG,
    rolePermissions: ROLE_PERMISSION_CATALOG,
  }));

  const authService = new AuthService({ userRepository, sessionRepository, rbacRepository });
  const eventService = new EventService({ eventRepository });
  const auditService = new AuditService({ auditRepository });
  const authorizationService = new AuthorizationService({ rbacRepository });
  const platformConfigService = new PlatformConfigService({ configRepository });
  const providerStateService = new ProviderStateService({ providerStateRepository });
  const reporterService = new ReporterService({ reporterRepository });
  const studioService = new StudioService({ studioRepository });
  const assignmentService = new AssignmentService({ assignmentRepository, reporterRepository, studioRepository });
  const presenceService = new PresenceService({
    presenceRepository,
    reporterRepository,
    assignmentRepository,
    studioRepository,
    auditService,
    heartbeatTimeoutMs: 30000,
    heartbeatSweepMs: 5000,
  });
  const mediaProviderRegistry = buildMediaProviderRegistry({
    registry: new MediaProviderRegistry(),
    config,
  });
  const mediaPolicyEngine = new MediaPolicyEngine();
  const idempotencyService = new IdempotencyService({ mediaRepository });
  const transactionalFacade = new TransactionalOrchestrationFacade({
    db,
    mediaRepository,
    auditService,
  });
  const mediaSessionManager = new MediaSessionManager({
    mediaProviderRegistry,
    mediaRepository,
    auditService,
    mediaPolicyEngine,
    idempotencyService,
    transactionalFacade,
  });
  const mediaService = new MediaService({
    mediaProviderRegistry,
    mediaRepository,
    auditService,
    mediaSessionManager,
  });

  const ffmpegManager = new FfmpegManager({
    ffmpegPath: config.broadcast.ffmpegPath,
    logger,
    shutdownTimeoutMs: config.broadcast.shutdownTimeoutMs,
    logBufferSize: config.broadcast.logBufferSize,
  });
  const recordingManager = new RecordingManager({
    recordingsRoot: config.broadcast.recordingsRoot,
  });
  const rtmpOutputManager = new RtmpOutputManager();
  const srtOutputManager = new SrtOutputManager();
  const broadcastEngine = new BroadcastEngine({
    ffmpegManager,
    recordingManager,
    rtmpOutputManager,
    srtOutputManager,
    autoRestartDelayMs: config.broadcast.autoRestartDelayMs,
  });
  const broadcastHealthService = new BroadcastHealthService({
    broadcastEngine,
    ffmpegManager,
    recordingManager,
    rtmpOutputManager,
    srtOutputManager,
  });
  broadcastEngine.setHealthService(broadcastHealthService);

  await runStartupStep("auth_bootstrap_user", () => authService.ensureBootstrapUser());
  await runStartupStep("session_prune_expired", () => sessionRepository.pruneExpired());
  await runStartupStep("persist_runtime_config", () => platformConfigService.persistRuntimeConfig(config));

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const registry = buildProviderRegistry({ registry: new ProviderRegistry(), config });
  const orchestration = new ProviderOrchestrationService({ registry, auditService, eventService, providerStateService });
  const operationsDashboardService = new OperationsDashboardService({ providerRegistry: registry, orchestration, databaseService });
  const app = createApp({
    orchestration,
    authService,
    auditService,
    eventService,
    platformConfigService,
    databaseService,
    operationsDashboardService,
    reporterService,
    studioService,
    assignmentService,
    presenceService,
    mediaService,
    broadcastEngine,
  });

  const server = createServer(app);

  createPresenceGateway({
    server,
    authService,
    authorizationService,
    presenceService,
    logger,
    permissionCatalog: PERMISSIONS,
    heartbeatIntervalMs: 10000,
  });

  await runStartupStep("presence_heartbeat_monitor_start", () => presenceService.startHeartbeatMonitor());

  await runStartupStep("vpn_startup_policy", () => enforceVpnStartupPolicy({
    orchestration,
    connectivityConfig: config.connectivity,
    logger,
  }));

  logger.info("startup.about_to_listen", {
    port: config.port,
    env: config.nodeEnv,
  });

  server.listen(config.port, () => {
    logger.info("startup.listen_success", {
      port: config.port,
      env: config.nodeEnv,
    });
    logger.info("config.env.loaded", {
      envPath: envDiagnostics.envPath,
      productionEnvPath: envDiagnostics.productionEnvPath,
      envLoaded: envDiagnostics.loaded,
      loadedEnvFiles: envDiagnostics.loadedEnvFiles,
      nodeEnv: config.nodeEnv,
    });
    logger.info("provider.proxmox.config", {
      proxmoxUrl: config.proxmox.baseUrl,
      proxmoxTokenId: config.proxmox.tokenId,
      proxmoxTokenSecretSet: Boolean(config.proxmox.tokenSecret),
    });
    logger.info("startup.vpn_policy.config", {
      enforceOnStartup: config.connectivity.enforceVpnPolicyOnStartup,
      emergencyOverride: config.connectivity.vpnPolicyEmergencyOverride,
    });
    logger.info("startup.database.config", {
      configured: Boolean(config.database.url),
      ssl: config.database.ssl,
      pool: config.database.maxPoolSize,
    });
    logger.info("server.started", {
      port: config.port,
      env: config.nodeEnv,
    });
  });
}

bootstrap().catch((error) => {
  logger.error("server.startup_failed", {
    code: error?.code || "INTERNAL_ERROR",
    message: error?.message || "Unknown startup error",
    details: error?.details || {},
    stack: formatErrorStack(error),
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("process.unhandled_rejection", {
    reason: typeof reason === "string" ? reason : reason?.message || "Unhandled rejection",
    stack: formatErrorStack(reason),
  });
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", {
    code: error?.code || "INTERNAL_ERROR",
    message: error?.message || "Uncaught exception",
    stack: formatErrorStack(error),
  });
  process.exit(1);
});