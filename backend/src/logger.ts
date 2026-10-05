/**
 * Minimal leveled console logger. No external dependency — this backend has
 * nowhere near the log volume that would justify one. Never logs credentials;
 * callers pass structured `meta` rather than interpolating secrets into the
 * message string.
 */
type Level = "info" | "warn" | "error";

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const payload = meta ? `${line} ${JSON.stringify(meta)}` : line;
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
