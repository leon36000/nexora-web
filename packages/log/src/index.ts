const REDACTED = "[REDACTED]";

/** Noms de champs dont la valeur n'est jamais journalisée. */
const SENSITIVE_KEY =
  /secret|token|password|passwd|authorization|api[-_]?key|cookie|ciphertext|plaintext|private[-_]?key|^value$|^iv$|auth[-_]?tag/i;

const STRING_PATTERNS: Array<[RegExp, string]> = [
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, `$1${REDACTED}`],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, REDACTED],
  // Clés clientes de la passerelle (S5) : nxk_ + 256 bits en base64url.
  [/\bnxk_[A-Za-z0-9_-]{16,}/g, REDACTED],
  [/\b(?:pk|rk|whsec|sk)_(?:live|test)_[A-Za-z0-9]{8,}/g, REDACTED],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${REDACTED}@`],
];

/** Nettoie une chaîne libre (message d'erreur, URL) des motifs de secrets connus. */
export function scrubString(input: string): string {
  let out = input;
  for (const [pattern, replacement] of STRING_PATTERNS)
    out = out.replace(pattern, replacement);
  return out;
}

/**
 * Copie profonde sûre à journaliser : champs sensibles masqués, chaînes nettoyées,
 * erreurs réduites à leur nom et leur message (jamais la pile), cycles tolérés.
 */
export function redact(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error) {
    return { name: value.name, message: scrubString(value.message) };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, seen);
  }
  return out;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  name: string;
  level?: LogLevel;
  /** Destination d'une ligne JSON ; par défaut stdout (stderr pour warn et error). */
  sink?: (line: string, level: LogLevel) => void;
  context?: Record<string, unknown>;
}

function defaultSink(line: string, level: LogLevel): void {
  const stream =
    level === "warn" || level === "error" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function createLogger(options: LoggerOptions): Logger {
  const min = ORDER[options.level ?? "info"];
  const sink = options.sink ?? defaultSink;
  const context = options.context ?? {};

  const emit = (
    level: LogLevel,
    msg: string,
    fields?: Record<string, unknown>,
  ) => {
    if (ORDER[level] < min) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      name: options.name,
      msg: scrubString(msg),
      ...(redact({ ...context, ...fields }) as Record<string, unknown>),
    };
    sink(JSON.stringify(record), level);
  };

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (fields) =>
      createLogger({ ...options, context: { ...context, ...fields } }),
  };
}
