/**
 * Minimal structured logger: one JSON line per event.
 * Values whose key looks like a secret are redacted before printing.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SECRET_KEY = /(key|token|secret|password|authorization)/i;
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const configured = (process.env.LOG_LEVEL ?? "info") as Level;
  return LEVELS[configured] ?? LEVELS.info;
}

export function redact(fields: Fields, depth = 0): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY.test(key)) out[key] = "[redacted]";
    else if (value instanceof Error) out[key] = value.message;
    else if (value && typeof value === "object" && !Array.isArray(value))
      out[key] = depth >= 4 ? "[object]" : redact(value as Fields, depth + 1);
    else out[key] = value;
  }
  return out;
}

function write(level: Level, event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" || process.env.LOG_SILENT === "1") return;
  if (LEVELS[level] < minLevel()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...redact(fields) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};
