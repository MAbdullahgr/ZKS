// INFRA: Structured logger. Emits one JSON line per log entry so log
// aggregators (Vercel logs, Datadog, Loki, etc.) can parse fields directly
// instead of regex-ing free-text lines. Level filtering via LOG_LEVEL env
// var (debug/info/warn/error, default 'info') — keeps production logs
// noise-free while letting devs crank up verbosity locally.
//
// Each entry: { level, message, timestamp, ...meta } — meta fields are
// spread into the entry, so callers can pass any structured context:
//   logger.error("DB query failed", { table: "Sale", code: "P1001", durationMs: 42 })

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Resolve min level ONCE at module load. Re-reading process.env.LOG_LEVEL on
// every log call would be wasteful — and risky if some test/library mutates
// env mid-request. The env is read once and frozen for the process lifetime.
const configuredLevel = (process.env.LOG_LEVEL as LogLevel) || "info";
const minLevel = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.info;

export function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (LOG_LEVELS[level] < minLevel) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  };

  // Route to the matching console method so host runtimes (Vercel, Node)
  // preserve severity-aware streams (stdout for debug/info, stderr for
  // warn/error). JSON.stringify so the entry is one parseable line.
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
