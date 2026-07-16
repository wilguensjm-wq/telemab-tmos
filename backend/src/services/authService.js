import { createHash } from "node:crypto";
import { config } from "../config/index.js";
import { TmosError } from "../errors/TmosError.js";

function sign(username) {
  const payload = `${username}:${Date.now()}:${config.auth.jwtSecret}`;
  return Buffer.from(payload).toString("base64url");
}

function unsign(token) {
  try {
    const text = Buffer.from(token, "base64url").toString("utf8");
    const [username] = text.split(":");
    return username || null;
  } catch {
    return null;
  }
}

const sessionStore = new Map();

export const authService = {
  login({ username, password }) {
    if (username !== config.auth.adminUser || password !== config.auth.adminPass) {
      throw new TmosError({
        code: "AUTH_INVALID_CREDENTIALS",
        message: "Invalid credentials",
        status: 401,
      });
    }

    const token = sign(username);
    const refreshToken = createHash("sha256").update(token).digest("hex");
    const user = {
      id: "op-1",
      username,
      name: "TMOS Operator",
      role: "Administrator",
    };

    sessionStore.set(token, user);

    return { accessToken: token, refreshToken, user };
  },

  refresh(_refreshToken) {
    const user = {
      id: "op-1",
      username: config.auth.adminUser,
      name: "TMOS Operator",
      role: "Administrator",
    };
    const token = sign(user.username);
    sessionStore.set(token, user);

    return {
      accessToken: token,
      refreshToken: createHash("sha256").update(token).digest("hex"),
      user,
    };
  },

  logout(token) {
    sessionStore.delete(token);
    return { success: true };
  },

  verifyToken(token) {
    if (!token) return { valid: false };

    const user = sessionStore.get(token);
    if (user) {
      return { valid: true, user };
    }

    const username = unsign(token);
    if (!username) {
      return { valid: false };
    }

    return {
      valid: true,
      user: {
        id: "op-1",
        username,
        name: "TMOS Operator",
        role: "Administrator",
      },
    };
  },
};