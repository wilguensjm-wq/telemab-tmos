export function ok(res, req, data, status = 200) {
  return res.status(status).json({
    success: true,
    data,
    meta: {
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    },
  });
}

export function fail(res, req, error) {
  return res.status(error.status || 500).json({
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "Internal error",
      details: error.details || {},
    },
    meta: {
      correlationId: req.correlationId,
      timestamp: new Date().toISOString(),
    },
  });
}