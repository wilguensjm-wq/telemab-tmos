import { createHash } from "node:crypto";
import { TmosError } from "../errors/TmosError.js";

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function buildHash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export class IdempotencyService {
  constructor({ mediaRepository, ttlMinutes = 30 }) {
    this.mediaRepository = mediaRepository;
    this.ttlMinutes = ttlMinutes;
  }

  hashPayload(payload) {
    return buildHash(payload || {});
  }

  assertValidKey(idempotencyKey) {
    if (!idempotencyKey || !String(idempotencyKey).trim()) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Idempotency-Key header is required",
        status: 400,
      });
    }

    const key = String(idempotencyKey).trim();
    if (key.length < 12) {
      throw new TmosError({
        code: "VALIDATION_ERROR",
        message: "Idempotency-Key must be at least 12 characters",
        status: 400,
      });
    }

    return key;
  }

  async begin({ idempotencyKey, endpoint, actor, correlationId, payload }) {
    const operationKey = this.assertValidKey(idempotencyKey);
    const requestHash = this.hashPayload(payload);
    const existing = await this.mediaRepository.findOperationKey(operationKey);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new TmosError({
          code: "VALIDATION_ERROR",
          message: "Idempotency-Key reuse with different payload is not allowed",
          status: 409,
          details: {
            operationKey,
            endpoint,
          },
        });
      }

      return {
        replay: true,
        operation: existing,
      };
    }

    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60 * 1000).toISOString();
    const created = await this.mediaRepository.createOperationKey({
      operationKey,
      endpoint,
      actor,
      correlationId,
      requestHash,
      expiresAt,
    });

    return {
      replay: false,
      operation: created,
    };
  }

  async complete({ operationKey, responsePayload }) {
    const responseHash = buildHash(responsePayload || {});
    return this.mediaRepository.completeOperationKey({
      operationKey,
      responseHash,
      responsePayload,
    });
  }
}
