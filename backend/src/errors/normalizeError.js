import { TmosError } from "./TmosError.js";

function isConnectivityError(error) {
  const code = String(error?.code || "").toUpperCase();
  return ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "EAI_AGAIN", "ECONNRESET", "ETIMEDOUT"].includes(code);
}

function providerDetails(error) {
  const details = {};

  if (error?.response?.status) {
    details.upstreamStatus = error.response.status;
  }

  if (error?.response?.statusText) {
    details.upstreamStatusText = error.response.statusText;
  }

  if (error?.code) {
    details.upstreamCode = error.code;
  }

  return details;
}

export function normalizeError(error) {
  if (error instanceof TmosError) {
    return error;
  }

  if (error?.response?.status === 401 || error?.response?.status === 403) {
    return new TmosError({
      code: "AUTH_FORBIDDEN",
      message: "Provider authorization failed",
      status: 403,
      details: providerDetails(error),
    });
  }

  if (error?.code === "ECONNABORTED") {
    return new TmosError({
      code: "PROVIDER_TIMEOUT",
      message: "Provider request timed out",
      status: 504,
      details: providerDetails(error),
    });
  }

  if (isConnectivityError(error)) {
    return new TmosError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Live connection not configured",
      status: 503,
      details: providerDetails(error),
    });
  }

  if (error?.response?.status >= 500) {
    return new TmosError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Provider unavailable",
      status: 503,
      details: providerDetails(error),
    });
  }

  if (error?.response?.status >= 400) {
    return new TmosError({
      code: "PROVIDER_BAD_RESPONSE",
      message: "Provider returned invalid response",
      status: 502,
      details: providerDetails(error),
    });
  }

  return new TmosError({
    code: "INTERNAL_ERROR",
    message: error?.message || "Internal error",
    status: 500,
    details: providerDetails(error),
  });
}