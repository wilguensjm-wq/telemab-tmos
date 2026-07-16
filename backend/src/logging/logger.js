function entry(level, message, details = {}) {
  return JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

export const logger = {
  info(message, details = {}) {
    console.log(entry("info", message, details));
  },
  warn(message, details = {}) {
    console.warn(entry("warn", message, details));
  },
  error(message, details = {}) {
    console.error(entry("error", message, details));
  },
};