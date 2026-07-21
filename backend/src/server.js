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

async function bootstrap() {
  try {
    await assertNoUnmappedProtectedV1Routes();
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
    onError: (error) => {
      logger.error("database.pool.error", {
        code: error?.code || "UNKNOWN",
        message: error?.message || "Database pool error",
      });
    },
  });

  await runMigrations({ db, logger });

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

  await rbacRepository.syncCatalog({
    roles: ROLE_CATALOG,
    permissions: PERMISSION_CATALOG,
    rolePermissions: ROLE_PERMISSION_CATALOG,
  });

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

  const ffmpegManager = new FfmpegManager();
  const recordingManager = new RecordingManager();
  const rtmpOutputManager = new RtmpOutputManager();
  const srtOutputManager = new SrtOutputManager();
  const broadcastEngine = new BroadcastEngine({
    ffmpegManager,
    recordingManager,
    rtmpOutputManager,
    srtOutputManager,
  });
  const broadcastHealthService = new BroadcastHealthService({
    broadcastEngine,
    ffmpegManager,
    recordingManager,
    rtmpOutputManager,
    srtOutputManager,
  });
  broadcastEngine.setHealthService(broadcastHealthService);

  await authService.ensureBootstrapUser();
  await sessionRepository.pruneExpired();
  await platformConfigService.persistRuntimeConfig(config);

  setAuthorizationDependencies({ authService, authorizationService, auditService });

  const registry = buildProviderRegistry({ registry: new ProviderRegistry(), config });
  const orchestration = new ProviderOrchestrationService({ registry, auditService, eventService, providerStateService });
  const app = createApp({
    orchestration,
    authService,
    auditService,
    eventService,
    platformConfigService,
    databaseService,
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

  await presenceService.startHeartbeatMonitor();

  await enforceVpnStartupPolicy({
    orchestration,
    connectivityConfig: config.connectivity,
    logger,
  });

  server.listen(config.port, () => {
    logger.info("config.env.loaded", {
      envPath: envDiagnostics.envPath,
      envLoaded: envDiagnostics.loaded,
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
  });
  process.exit(1);
});