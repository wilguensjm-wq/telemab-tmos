import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { TmosError } from "../errors/TmosError.js";

const sessionStore = new Map();

function buildUser(username) {
  return {
    id: "op-1",
    username,
    name: "TMOS Operator",
    role: "Administrator",
  };
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

function issueSession(user) {
  const sid = randomUUID();
  const accessToken = signAccessToken({
    username: user.username,
    role: user.role,
    name: user.name,
    sid,
  });
  const refreshToken = signRefreshToken({ username: user.username, sid });

  sessionStore.set(sid, {
    username: user.username,
    refreshTokenHash: createHash("sha256").update(refreshToken).digest("hex"),
  });

  return { accessToken, refreshToken, user };
}

function verifyJwt(token, expectedType, options = {}) {
  const payload = jwt.verify(token, config.auth.jwtSecret, {
    algorithms: ["HS256"],
    issuer: "tmos-backend",
    audience: "tmos-frontend",
    ...options,
  });

  if (payload?.typ !== expectedType || !payload?.sid || !payload?.sub) {
    throw new Error("Invalid token payload");
  }

  return payload;
}

export const authService = {
  login({ username, password }) {
    if (username !== config.auth.adminUser || password !== config.auth.adminPass) {
      throw new TmosError({
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Invalid credentials",
        status: 401,
      });
    }

    return issueSession(buildUser(username));
  },

  refresh(refreshToken) {
    if (!refreshToken) {
      throw new TmosError({
        code: "AUTH_FORBIDDEN",
        message: "Invalid or expired refresh token",
        status: 401,
      });
    }

    try {
      const payload = verifyJwt(refreshToken, "refresh");
      const session = sessionStore.get(payload.sid);
      const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");

      if (!session || session.username !== payload.sub || session.refreshTokenHash !== refreshTokenHash) {
        throw new Error("Session does not match refresh token");
      }

      sessionStore.delete(payload.sid);
      return issueSession(buildUser(payload.sub));
    } catch {
      throw new TmosError({
        code: "AUTH_FORBIDDEN",
        message: "Invalid or expired refresh token",
        status: 401,
      });
    }
  },

  logout(accessToken, refreshToken) {
    if (accessToken) {
      try {
        const payload = verifyJwt(accessToken, "access", { ignoreExpiration: true });
        sessionStore.delete(payload.sid);
      } catch {
        // Ignore malformed/expired access tokens on logout.
      }
    }

    if (refreshToken) {
      try {
        const payload = verifyJwt(refreshToken, "refresh", { ignoreExpiration: true });
        sessionStore.delete(payload.sid);
      } catch {
        // Ignore malformed/expired refresh tokens on logout.
      }
    }

    return { success: true };
  },

  verifyToken(token) {
    if (!token) {
      return { valid: false };
    }

    try {
      const payload = verifyJwt(token, "access");
      const session = sessionStore.get(payload.sid);
      if (!session || session.username !== payload.sub) {
        return { valid: false };
      }

      return {
        valid: true,
        user: buildUser(payload.sub),
      };
    } catch {
      return { valid: false };
    }
  },
};