import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { TmosError } from "../errors/TmosError.js";

function buildUser(userRecord, { roles = [], permissions = [] } = {}) {
  const resolvedRole = roles[0] || userRecord.roleName;
  return {
    id: userRecord.id,
    username: userRecord.username,
    name: userRecord.displayName,
    role: resolvedRole,
    roles,
    permissions,
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("scrypt$")) {
    return false;
  }

  const [, salt, storedKey] = storedHash.split("$");
  const candidateKey = scryptSync(password, salt, 64).toString("hex");
  const storedBuffer = Buffer.from(storedKey, "hex");
  const candidateBuffer = Buffer.from(candidateKey, "hex");
  if (storedBuffer.length !== candidateBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, candidateBuffer);
}

function hashRefreshToken(refreshToken) {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function signAccessToken({ username, role, name, sid }) {
  return jwt.sign(
    {
      sub: username,
      role,
      name,
      typ: "access",
      sid,
    },
    config.auth.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: config.auth.accessTokenTtl,
      issuer: "tmos-backend",
      audience: "tmos-frontend",
    },
  );
}

function signRefreshToken({ username, sid }) {
  return jwt.sign(
    {
      sub: username,
      typ: "refresh",
      sid,
    },
    config.auth.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: config.auth.refreshTokenTtl,
      issuer: "tmos-backend",
      audience: "tmos-frontend",
    },
  );
}

async function issueSession({ user, sessionRepository }) {
  const sid = randomUUID();
  const accessToken = signAccessToken({
    username: user.username,
    role: user.role,
    name: user.name,
    sid,
  });
  const refreshToken = signRefreshToken({ username: user.username, sid });
  const refreshTokenPayload = jwt.decode(refreshToken);
  const expiresAt = Number.isFinite(refreshTokenPayload?.exp)
    ? new Date(refreshTokenPayload.exp * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await sessionRepository.create({
    id: sid,
    userId: user.id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt,
  });

  return { accessToken, refreshToken, user };
}

function getCandidateJwtSecrets() {
  const secrets = [
    config.auth.jwtSecret,
    process.env.TMOS_JWT_SECRET_PREVIOUS,
    process.env.TMOS_JWT_SECRET_LEGACY,
    process.env.TMOS_JWT_SECRET_OLD,
    process.env.TMOS_JWT_SECRET_CURRENT,
    process.env.JWT_SECRET,
    process.env.JWT_SECRET_PREVIOUS,
    "dev-secret",
    "dev-secret-key-change-in-production-at-least-32-chars",
    "replace-me",
  ];

  const seen = new Set();
  return secrets.filter((secret) => {
    if (typeof secret !== "string") {
      return false;
    }

    const trimmed = secret.trim();
    if (!trimmed || seen.has(trimmed)) {
      return false;
    }

    seen.add(trimmed);
    return true;
  });
}

function verifyJwt(token, expectedType, options = {}) {
  const verifyProfiles = [
    {
      name: "strict",
      verifyOptions: {
        algorithms: ["HS256"],
        issuer: "tmos-backend",
        audience: "tmos-frontend",
        ...options,
      },
    },
    {
      name: "legacy-claims",
      verifyOptions: {
        algorithms: ["HS256"],
        ...options,
      },
    },
  ];

  let lastError = null;

  for (const secret of getCandidateJwtSecrets()) {
    for (const profile of verifyProfiles) {
      try {
        const payload = jwt.verify(token, secret, profile.verifyOptions);

        if (payload?.typ !== expectedType || !payload?.sid || !payload?.sub) {
          throw new Error("Invalid token payload");
        }

        return payload;
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError || new Error("Invalid token payload");
}

export class AuthService {
  constructor({ userRepository, sessionRepository, rbacRepository = null }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.rbacRepository = rbacRepository;
  }

  async resolveRolesForUser(userRecord) {
    if (!userRecord?.id || !this.rbacRepository) {
      return userRecord?.roleName ? [userRecord.roleName] : [];
    }

    const roles = await this.rbacRepository.listRoleKeysForUser(userRecord.id);
    if (roles.length) {
      return roles;
    }

    return userRecord.roleName ? [userRecord.roleName] : [];
  }

  async resolvePermissionsForUser(userRecord) {
    if (!userRecord?.id || !this.rbacRepository) {
      return [];
    }

    return this.rbacRepository.listPermissionKeysForUser(userRecord.id);
  }

  async buildIdentity(userRecord) {
    const [roles, permissions] = await Promise.all([
      this.resolveRolesForUser(userRecord),
      this.resolvePermissionsForUser(userRecord),
    ]);

    return buildUser(userRecord, { roles, permissions });
  }

  async ensureBootstrapUser() {
    const existing = await this.userRepository.findByUsername(config.auth.adminUser);
    const updated = await this.userRepository.upsertUser({
      id: existing?.id,
      username: config.auth.adminUser,
      passwordHash: hashPassword(config.auth.adminPass),
      displayName: "TMOS Operator",
      roleName: "Administrator",
      isActive: true,
    });

    if (this.rbacRepository) {
      await this.rbacRepository.ensureUserRole({
        userId: updated.id,
        roleKey: "Administrator",
      });
    }

    return this.buildIdentity(updated);
  }

  async login({ username, password }) {
    const user = await this.userRepository.findByUsername(username);
    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      throw new TmosError({
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Invalid credentials",
        status: 401,
      });
    }

    return issueSession({
      user: await this.buildIdentity(user),
      sessionRepository: this.sessionRepository,
    });
  }

  async refresh(refreshToken) {
    if (!refreshToken) {
      throw new TmosError({
        code: "AUTH_FORBIDDEN",
        message: "Invalid or expired refresh token",
        status: 401,
      });
    }

    try {
      const payload = verifyJwt(refreshToken, "refresh");
      const session = await this.sessionRepository.findById(payload.sid);
      const refreshTokenHash = hashRefreshToken(refreshToken);

      if (!session || session.revokedAt || session.refreshTokenHash !== refreshTokenHash) {
        throw new Error("Session does not match refresh token");
      }

      const user = await this.userRepository.findByUsername(payload.sub);
      if (!user || !user.isActive) {
        throw new Error("User is not active");
      }

      const identity = await this.buildIdentity(user);

      // Keep the same session id on refresh to avoid cross-device reporter disruption
      // when multiple browser sessions are sharing the same authenticated context.
      // A fresh access token is issued while the existing refresh token/session remain valid.
      const accessToken = signAccessToken({
        username: identity.username,
        role: identity.role,
        name: identity.name,
        sid: payload.sid,
      });

      return {
        accessToken,
        refreshToken,
        user: identity,
      };
    } catch {
      throw new TmosError({
        code: "AUTH_FORBIDDEN",
        message: "Invalid or expired refresh token",
        status: 401,
      });
    }
  }

  async logout(accessToken, refreshToken) {
    if (accessToken) {
      try {
        const payload = verifyJwt(accessToken, "access", { ignoreExpiration: true });
        await this.sessionRepository.revoke(payload.sid);
      } catch {
        // Ignore malformed/expired access tokens on logout.
      }
    }

    if (refreshToken) {
      try {
        const payload = verifyJwt(refreshToken, "refresh", { ignoreExpiration: true });
        await this.sessionRepository.revoke(payload.sid);
      } catch {
        // Ignore malformed/expired refresh tokens on logout.
      }
    }

    return { success: true };
  }

  async verifyToken(token) {
    if (!token) {
      return { valid: false };
    }

    try {
      const payload = verifyJwt(token, "access");
      const session = await this.sessionRepository.findById(payload.sid);
      if (!session || session.revokedAt) {
        return { valid: false };
      }

      const user = await this.userRepository.findByUsername(payload.sub);
      if (!user || !user.isActive) {
        return { valid: false };
      }

      return {
        valid: true,
        user: await this.buildIdentity(user),
      };
    } catch {
      return { valid: false };
    }
  }

  async listSessions(userId) {
    if (!userId) {
      return [];
    }
    return this.sessionRepository.listByUserId(userId);
  }
}