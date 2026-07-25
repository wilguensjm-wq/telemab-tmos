import { AuthService, User, AuthTokens } from '../src/index';
import { loadConfig } from '@platform/config';
import { createLogger } from '@platform/logging';

describe('AuthService', () => {
  let authService: AuthService;
  let testUser: User;

  beforeAll(async () => {
    const config = loadConfig();
    const logger = createLogger(config);
    authService = new AuthService(config, logger);

    testUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['user'],
      permissions: [],
      mfaEnabled: false,
      createdAt: new Date().toISOString(),
    };

    // Skip Redis connection for unit tests
    // In integration tests, we would await authService.connect()
  });

  describe('Token Management', () => {
    test('generateAccessToken creates valid JWT', () => {
      const token = authService.generateAccessToken(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('generateRefreshToken creates valid refresh token', () => {
      const token = authService.generateRefreshToken(testUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('verifyAccessToken decodes valid token', () => {
      const token = authService.generateAccessToken(testUser);
      const payload = authService.verifyAccessToken(token);

      expect(payload).toBeDefined();
      expect(payload?.sub).toBe(testUser.id);
      expect(payload?.email).toBe(testUser.email);
      expect(payload?.roles).toContain('user');
    });

    test('verifyAccessToken rejects invalid token', () => {
      const payload = authService.verifyAccessToken('invalid-token');

      expect(payload).toBeNull();
    });

    test('issueTokens returns both access and refresh tokens', async () => {
      const tokens = await authService.issueTokens(testUser);

      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBeGreaterThan(0);
    });
  });

  describe('Password Management', () => {
    test('hashPassword creates bcrypt hash', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20); // bcrypt hashes are long
    });

    test('verifyPassword validates correct password', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);

      const valid = await authService.verifyPassword(password, hash);

      expect(valid).toBe(true);
    });

    test('verifyPassword rejects incorrect password', async () => {
      const password = 'SecurePassword123!';
      const hash = await authService.hashPassword(password);

      const valid = await authService.verifyPassword('WrongPassword', hash);

      expect(valid).toBe(false);
    });
  });
});
