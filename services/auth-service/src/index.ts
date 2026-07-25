import express from 'express';
import { loadConfig, validateConfig } from '@platform/config';
import { createLogger, expressLoggingMiddleware } from '@platform/logging';
import { MetricsCollector, expressMetricsMiddleware, metricsRoutes } from '@platform/monitoring';
import { AuthService, authMiddleware, requireAuth, requireRole } from '@platform/auth';
import { EventPublisher } from '@platform/events';
import { Pool } from 'pg';

async function main() {
  const config = loadConfig();

  try {
    validateConfig(config);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }

  const logger = createLogger(config);

  // Initialize Express app
  const app = express();
  app.use(express.json());

  // Logging middleware
  app.use(expressLoggingMiddleware(config));

  // Metrics collection
  const metricsCollector = new MetricsCollector(config, logger);
  app.use(expressMetricsMiddleware(metricsCollector));

  // Auth middleware (optional for all endpoints)
  app.use(authMiddleware(config, logger));

  // Initialize database connection pool
  const dbPool = new Pool({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    max: config.database.maxConnections,
    ssl: config.database.ssl,
  });

  dbPool.on('error', (err) => {
    logger.error('Unexpected error on idle client', err);
  });

  // Test database connection
  try {
    const client = await dbPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful');
  } catch (error) {
    logger.error('Failed to connect to database', error);
    process.exit(1);
  }

  // Initialize auth service
  const authService = new AuthService(config, logger);
  try {
    await authService.connect();
  } catch (error) {
    logger.error('Failed to initialize auth service', error);
    process.exit(1);
  }

  // Initialize event publisher
  const eventPublisher = new EventPublisher(config, logger);
  try {
    await eventPublisher.connect();
  } catch (error) {
    logger.error('Failed to initialize event publisher', error);
    // Continue without events for now
  }

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      service: config.serviceName,
      timestamp: new Date().toISOString(),
    });
  });

  // Metrics endpoint
  app.get('/metrics', metricsRoutes(metricsCollector));

  // Ready check endpoint
  app.get('/ready', async (req, res) => {
    try {
      // Check database
      const client = await dbPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      res.status(200).json({
        status: 'ready',
        service: config.serviceName,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        service: config.serviceName,
        error: String(error),
      });
    }
  });

  // Auth endpoints
  app.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      // Query user from database
      const result = await dbPool.query(
        'SELECT id, email, name, roles, password_hash, mfa_enabled, created_at FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const dbUser = result.rows[0];
      const passwordValid = await authService.verifyPassword(password, dbUser.password_hash);

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        roles: dbUser.roles || ['user'],
        permissions: [],
        mfaEnabled: dbUser.mfa_enabled,
        createdAt: dbUser.created_at,
      };

      const tokens = await authService.issueTokens(user);
      const session = await authService.createSession(user, {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      res.status(200).json({
        tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
        },
        session: {
          id: session.sessionId,
        },
      });
    } catch (error) {
      logger.error('Login failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/auth/logout', requireAuth, async (req, res) => {
    try {
      // Sessions are logged out via token expiry in this design
      // Could also track invalidated tokens in Redis if needed
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const tokens = await authService.refreshAccessToken(refreshToken);
      if (!tokens) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      res.status(200).json(tokens);
    } catch (error) {
      logger.error('Token refresh failed', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/auth/me', requireAuth, async (req, res) => {
    try {
      const result = await dbPool.query(
        'SELECT id, email, name, roles, created_at FROM users WHERE id = $1',
        [req.user.sub]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];
      res.status(200).json({
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles || ['user'],
      });
    } catch (error) {
      logger.error('Failed to fetch user', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Start server
  const port = config.servicePort;
  app.listen(port, () => {
    logger.info(`Auth Service started on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await dbPool.end();
    await authService.disconnect();
    await eventPublisher.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start Auth Service:', error);
  process.exit(1);
});
