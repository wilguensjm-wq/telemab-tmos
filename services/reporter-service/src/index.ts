import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HTTPServer } from 'http';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';

import { loadConfig, validateConfig } from '@platform/config';
import { createLogger, expressLoggingMiddleware } from '@platform/logging';
import { MetricsCollector, expressMetricsMiddleware, metricsRoutes } from '@platform/monitoring';
import { authMiddleware, requireAuth } from '@platform/auth';
import { EventPublisher } from '@platform/events';

import {
  Reporter,
  ReporterSession,
  ReporterStatus,
  RegisterReporterRequest,
  UpdateStatusRequest,
  HeartbeatRequest,
  ReporterResponse,
  ReporterListResponse,
  WebSocketMessage,
  generateSessionId,
} from './types';

const HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds
const HEARTBEAT_CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

interface ReporterConnection {
  reporter: Reporter;
  session: ReporterSession;
  ws?: WebSocket;
  lastHeartbeat: number;
}

class ReporterService {
  private app: express.Application;
  private httpServer: HTTPServer;
  private wss: WebSocketServer;
  private config = loadConfig();
  private logger = createLogger(this.config);
  private dbPool: Pool | null = null;
  private redisClient: RedisClientType | null = null;
  private eventPublisher: EventPublisher | null = null;
  private metricsCollector: MetricsCollector | null = null;

  // In-memory connection tracking
  private connections: Map<string, ReporterConnection> = new Map();
  private reporterSessions: Map<string, string> = new Map(); // reporter_id -> session_id
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });
  }

  async initialize(): Promise<void> {
    try {
      validateConfig(this.config);
    } catch (error) {
      this.logger.error('Configuration validation failed', error);
      process.exit(1);
    }

    // Middleware setup
    this.app.use(express.json());
    this.app.use(expressLoggingMiddleware(this.config));

    // Metrics
    this.metricsCollector = new MetricsCollector(this.config, this.logger);
    this.app.use(expressMetricsMiddleware(this.metricsCollector));

    // Auth middleware
    this.app.use(authMiddleware(this.config, this.logger));

    // Database connection pool
    this.dbPool = new Pool({
      host: this.config.database.host,
      port: this.config.database.port,
      user: this.config.database.user,
      password: this.config.database.password,
      database: this.config.database.database,
      max: this.config.database.maxConnections,
      ssl: this.config.database.ssl,
    });

    this.dbPool.on('error', (err) => {
      this.logger.error('Unexpected error on idle client', err);
    });

    // Test database connection
    try {
      const client = await this.dbPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.logger.info('Database connection successful');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      process.exit(1);
    }

    // Redis connection
    this.redisClient = createClient({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
    }) as RedisClientType;

    try {
      await this.redisClient.connect();
      this.logger.info('Redis connection successful');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      process.exit(1);
    }

    // Event publisher
    this.eventPublisher = new EventPublisher(this.config, this.logger);
    try {
      await this.eventPublisher.connect();
    } catch (error) {
      this.logger.error('Failed to initialize event publisher', error);
      // Continue without events for now
    }

    // Setup routes
    this.setupRoutes();

    // Setup WebSocket handlers
    this.setupWebSocket();

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'healthy',
        service: this.config.serviceName,
        timestamp: new Date().toISOString(),
      });
    });

    // Readiness check
    this.app.get('/ready', async (req: Request, res: Response) => {
      try {
        const client = await this.dbPool!.connect();
        await client.query('SELECT NOW()');
        client.release();

        res.status(200).json({
          status: 'ready',
          service: this.config.serviceName,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          service: this.config.serviceName,
          error: String(error),
        });
      }
    });

    // Metrics
    this.app.get('/metrics', metricsRoutes(this.metricsCollector!));

    // Register reporter
    this.app.post('/reporters', requireAuth, async (req: Request, res: Response) => {
      try {
        const userId = req.user.sub;
        const { name, location } = req.body as RegisterReporterRequest;

        if (!name) {
          return res.status(400).json({ error: 'Reporter name is required' });
        }

        const result = await this.dbPool!.query(
          `INSERT INTO reporters (user_id, name, location, status, connected_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, user_id, name, location, status, last_heartbeat_at, connected_at`,
          [userId, name, location || null, 'available']
        );

        const reporter = result.rows[0];
        const sessionId = generateSessionId();

        // Create session
        const sessionResult = await this.dbPool!.query(
          `INSERT INTO reporter_sessions (reporter_id, session_id, ip_address, user_agent, started_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id`,
          [reporter.id, sessionId, req.ip, req.headers['user-agent']]
        );

        // Store mapping
        this.reporterSessions.set(reporter.id, sessionId);

        // Create status history entry
        await this.dbPool!.query(
          `INSERT INTO reporter_status_history (reporter_id, session_id, new_status, reason)
           VALUES ($1, $2, $3, $4)`,
          [reporter.id, sessionResult.rows[0].id, 'available', 'Reporter registered']
        );

        // Publish event
        if (this.eventPublisher) {
          await this.eventPublisher.publish({
            eventId: uuidv4(),
            eventType: 'reporter.registered',
            correlationId: req.headers['x-correlation-id'] as string,
            timestamp: new Date().toISOString(),
            source: 'reporter-service',
            data: {
              reporterId: reporter.id,
              userId,
              name,
              location,
              status: 'available',
              sessionId,
            },
          });
        }

        this.logger.info('Reporter registered', {
          reporterId: reporter.id,
          userId,
          name,
        });

        res.status(201).json({
          id: reporter.id,
          userId: reporter.user_id,
          name: reporter.name,
          location: reporter.location,
          status: reporter.status,
          lastHeartbeatAt: reporter.last_heartbeat_at,
          connectedAt: reporter.connected_at,
          sessionId,
        });
      } catch (error) {
        this.logger.error('Failed to register reporter', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Update status
    this.app.patch('/reporters/:reporterId/status', requireAuth, async (req: Request, res: Response) => {
      try {
        const { reporterId } = req.params;
        const { status, reason } = req.body as UpdateStatusRequest;
        const userId = req.user.sub;

        if (!['available', 'live', 'busy', 'offline'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }

        // Verify ownership
        const ownershipResult = await this.dbPool!.query(
          'SELECT id, status FROM reporters WHERE id = $1 AND user_id = $2',
          [reporterId, userId]
        );

        if (ownershipResult.rows.length === 0) {
          return res.status(404).json({ error: 'Reporter not found' });
        }

        const oldStatus = ownershipResult.rows[0].status;

        // Update status
        const result = await this.dbPool!.query(
          `UPDATE reporters SET status = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, status, updated_at`,
          [status, reporterId]
        );

        // Record status change
        const sessionId = this.reporterSessions.get(reporterId);
        await this.dbPool!.query(
          `INSERT INTO reporter_status_history (reporter_id, session_id, old_status, new_status, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [reporterId, sessionId || null, oldStatus, status, reason || null]
        );

        // Log activity
        await this.dbPool!.query(
          `INSERT INTO reporter_activity (reporter_id, session_id, activity_type, metadata)
           VALUES ($1, $2, $3, $4)`,
          [reporterId, sessionId || null, 'status_change', JSON.stringify({ from: oldStatus, to: status, reason })]
        );

        // Publish event
        if (this.eventPublisher) {
          await this.eventPublisher.publish({
            eventId: uuidv4(),
            eventType: 'reporter.status_changed',
            correlationId: req.headers['x-correlation-id'] as string,
            timestamp: new Date().toISOString(),
            source: 'reporter-service',
            data: {
              reporterId,
              userId,
              oldStatus,
              newStatus: status,
              reason,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Notify connected clients
        this.broadcastStatusChange(reporterId, status);

        this.logger.info('Reporter status updated', {
          reporterId,
          oldStatus,
          newStatus: status,
        });

        res.status(200).json({
          id: reporterId,
          status: result.rows[0].status,
          updatedAt: result.rows[0].updated_at,
        });
      } catch (error) {
        this.logger.error('Failed to update reporter status', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Heartbeat
    this.app.post('/reporters/:reporterId/heartbeat', requireAuth, async (req: Request, res: Response) => {
      try {
        const { reporterId } = req.params;
        const { location } = req.body as HeartbeatRequest;
        const userId = req.user.sub;

        // Verify ownership
        const result = await this.dbPool!.query(
          'SELECT id FROM reporters WHERE id = $1 AND user_id = $2',
          [reporterId, userId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Reporter not found' });
        }

        // Update heartbeat
        const updateResult = await this.dbPool!.query(
          `UPDATE reporters SET last_heartbeat_at = NOW(), updated_at = NOW()
           WHERE id = $1
           RETURNING last_heartbeat_at`,
          [reporterId]
        );

        // Increment session heartbeat count
        const sessionId = this.reporterSessions.get(reporterId);
        if (sessionId) {
          await this.dbPool!.query(
            `UPDATE reporter_sessions SET heartbeat_count = heartbeat_count + 1
             WHERE session_id = $1`,
            [sessionId]
          );
        }

        // Update location if provided
        if (location) {
          await this.dbPool!.query(
            'UPDATE reporters SET location = $1 WHERE id = $2',
            [location, reporterId]
          );
        }

        res.status(200).json({
          success: true,
          lastHeartbeatAt: updateResult.rows[0].last_heartbeat_at,
        });
      } catch (error) {
        this.logger.error('Failed to process heartbeat', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get reporters (for Mission Control)
    this.app.get('/reporters', requireAuth, async (req: Request, res: Response) => {
      try {
        const result = await this.dbPool!.query(
          `SELECT id, user_id, name, location, status, last_heartbeat_at, connected_at
           FROM reporters
           WHERE deleted_at IS NULL
           ORDER BY connected_at DESC`
        );

        const reporters: ReporterResponse[] = result.rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          location: row.location,
          status: row.status,
          lastHeartbeatAt: row.last_heartbeat_at?.toISOString(),
          connectedAt: row.connected_at?.toISOString(),
        }));

        const response: ReporterListResponse = {
          reporters,
          count: reporters.length,
          timestamp: new Date().toISOString(),
        };

        res.status(200).json(response);
      } catch (error) {
        this.logger.error('Failed to fetch reporters', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Disconnect reporter
    this.app.post('/reporters/:reporterId/disconnect', requireAuth, async (req: Request, res: Response) => {
      try {
        const { reporterId } = req.params;
        const userId = req.user.sub;

        // Verify ownership
        const result = await this.dbPool!.query(
          'SELECT id FROM reporters WHERE id = $1 AND user_id = $2',
          [reporterId, userId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Reporter not found' });
        }

        // Update status to offline
        const updateResult = await this.dbPool!.query(
          `UPDATE reporters SET status = 'offline', disconnected_at = NOW(), updated_at = NOW()
           WHERE id = $1
           RETURNING id, status`,
          [reporterId]
        );

        // End session
        const sessionId = this.reporterSessions.get(reporterId);
        if (sessionId) {
          await this.dbPool!.query(
            `UPDATE reporter_sessions SET ended_at = NOW()
             WHERE session_id = $1`,
            [sessionId]
          );
        }

        // Publish event
        if (this.eventPublisher) {
          await this.eventPublisher.publish({
            eventId: uuidv4(),
            eventType: 'reporter.disconnected',
            correlationId: req.headers['x-correlation-id'] as string,
            timestamp: new Date().toISOString(),
            source: 'reporter-service',
            data: {
              reporterId,
              userId,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Remove from connections
        this.connections.delete(reporterId);
        this.reporterSessions.delete(reporterId);

        // Notify connected clients
        this.broadcastStatusChange(reporterId, 'offline');

        this.logger.info('Reporter disconnected', { reporterId, userId });

        res.status(200).json({
          id: reporterId,
          status: updateResult.rows[0].status,
        });
      } catch (error) {
        this.logger.error('Failed to disconnect reporter', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      const reporterId = (req as any).reporterId;

      if (!reporterId) {
        ws.close(1008, 'Missing reporter ID');
        return;
      }

      this.logger.info('WebSocket connected', { reporterId });

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WebSocketMessage;

          if (message.type === 'ping') {
            ws.send(
              JSON.stringify({
                type: 'pong',
                timestamp: new Date().toISOString(),
              })
            );
          }
        } catch (error) {
          this.logger.error('Failed to process WebSocket message', error);
          ws.send(
            JSON.stringify({
              type: 'error',
              payload: { message: 'Failed to process message' },
              timestamp: new Date().toISOString(),
            })
          );
        }
      });

      ws.on('close', () => {
        this.logger.info('WebSocket disconnected', { reporterId });
      });

      ws.on('error', (error) => {
        this.logger.error('WebSocket error', error, { reporterId });
      });
    });
  }

  private broadcastStatusChange(reporterId: string, status: ReporterStatus): void {
    const message: WebSocketMessage = {
      type: 'status_change',
      payload: {
        reporterId,
        status,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatCheckInterval = setInterval(async () => {
      try {
        const result = await this.dbPool!.query(
          `SELECT id FROM reporters
           WHERE status != 'offline' AND last_heartbeat_at < NOW() - INTERVAL '${HEARTBEAT_TIMEOUT_MS / 1000} seconds'`
        );

        for (const row of result.rows) {
          const reporterId = row.id;

          await this.dbPool!.query(
            `UPDATE reporters SET status = 'offline', updated_at = NOW()
             WHERE id = $1`,
            [reporterId]
          );

          this.logger.warn('Reporter heartbeat timeout', { reporterId });
          this.broadcastStatusChange(reporterId, 'offline');

          // Publish event
          if (this.eventPublisher) {
            await this.eventPublisher.publish({
              eventId: uuidv4(),
              eventType: 'reporter.heartbeat_timeout',
              correlationId: uuidv4(),
              timestamp: new Date().toISOString(),
              source: 'reporter-service',
              data: { reporterId },
            });
          }
        }
      } catch (error) {
        this.logger.error('Error in heartbeat monitoring', error);
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  async start(): Promise<void> {
    const port = this.config.servicePort;

    this.httpServer.listen(port, () => {
      this.logger.info(`Reporter Service started on port ${port}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      this.logger.info('SIGTERM received, shutting down gracefully');
      await this.shutdown();
      process.exit(0);
    });
  }

  private async shutdown(): Promise<void> {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
    }

    this.wss.close();
    this.httpServer.close();

    if (this.dbPool) {
      await this.dbPool.end();
    }

    if (this.redisClient) {
      await this.redisClient.quit();
    }

    if (this.eventPublisher) {
      await this.eventPublisher.disconnect();
    }

    this.logger.info('Reporter Service shut down');
  }
}

async function main(): Promise<void> {
  const service = new ReporterService();
  await service.initialize();
  await service.start();
}

main().catch((error) => {
  console.error('Failed to start Reporter Service:', error);
  process.exit(1);
});
