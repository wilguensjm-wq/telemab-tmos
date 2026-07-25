import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient, RedisClientType } from 'redis';
import { PlatformConfig } from '@platform/config';
import { Logger } from '@platform/logging';

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface JWTPayload {
  sub: string; // user ID
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Session {
  sessionId: string;
  userId: string;
  email: string;
  roles: string[];
  createdAt: string;
  lastActivityAt: string;
  userAgent?: string;
  ipAddress?: string;
}

export class AuthService {
  private redisClient: RedisClientType | null = null;

  constructor(private config: PlatformConfig, private logger: Logger) {}

  async connect(): Promise<void> {
    try {
      this.redisClient = createClient({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
      }) as RedisClientType;

      await this.redisClient.connect();
      this.logger.info('AuthService connected to Redis');
    } catch (error) {
      this.logger.error('Failed to connect Redis for AuthService', error);
      throw error;
    }
  }

  // Token management
  generateAccessToken(user: User): string {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.security.jwtExpiryMinutes * 60,
    };

    return jwt.sign(payload, this.config.security.jwtSecret);
  }

  generateRefreshToken(user: User): string {
    const payload = {
      sub: user.id,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.config.security.refreshTokenExpiryDays * 24 * 60 * 60,
    };

    return jwt.sign(payload, this.config.security.jwtSecret);
  }

  verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.config.security.jwtSecret) as JWTPayload;
    } catch (error) {
      this.logger.debug('Failed to verify access token', { error: String(error) });
      return null;
    }
  }

  verifyRefreshToken(token: string): any {
    try {
      return jwt.verify(token, this.config.security.jwtSecret);
    } catch (error) {
      this.logger.debug('Failed to verify refresh token', { error: String(error) });
      return null;
    }
  }

  // Session management
  async createSession(user: User, options: { userAgent?: string; ipAddress?: string }): Promise<Session> {
    const session: Session = {
      sessionId: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: user.id,
      email: user.email,
      roles: user.roles,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
    };

    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }

    // Store session in Redis with 24-hour TTL
    const ttl = 24 * 60 * 60;
    await this.redisClient.setEx(
      `session:${session.sessionId}`,
      ttl,
      JSON.stringify(session)
    );

    this.logger.info('Session created', {
      sessionId: session.sessionId,
      userId: user.id,
    });

    return session;
  }

  async getSession(sessionId: string): Promise<Session | null> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }

    const data = await this.redisClient.get(`session:${sessionId}`);
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.lastActivityAt = new Date().toISOString();

    const ttl = 24 * 60 * 60;
    await this.redisClient.setEx(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(session)
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }

    await this.redisClient.del(`session:${sessionId}`);
    this.logger.info('Session deleted', { sessionId });
  }

  // Password management
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Authentication flow
  async issueTokens(user: User): Promise<AuthTokens> {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.security.jwtExpiryMinutes * 60,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<AuthTokens | null> {
    const payload = this.verifyRefreshToken(refreshToken);
    if (!payload || payload.type !== 'refresh') {
      return null;
    }

    // In real implementation, fetch user from database
    const user: User = {
      id: payload.sub,
      email: 'user@example.com',
      name: 'User',
      roles: ['user'],
      permissions: [],
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
    };

    return this.issueTokens(user);
  }

  async disconnect(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.logger.info('AuthService disconnected');
    }
  }
}

// Express middleware
export function authMiddleware(config: PlatformConfig, logger: Logger) {
  return (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user (public endpoints)
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, config.security.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;

    if (!payload) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = payload;
    req.userId = payload.sub;

    next();
  };
}

export function requireAuth(req: any, res: any, next: any) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasRole = roles.some((role) => req.user.roles.includes(role));
    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
