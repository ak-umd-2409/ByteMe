/**
 * Tiny dependency-free schema validator with type inference.
 *
 * Used for (1) API request bodies and (2) every LLM response. Anything that
 * fails validation is rejected; callers then fall back to deterministic logic.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export interface Schema<T> {
  parse(input: unknown, path?: string): Result<T>;
  /** Marker used only for type inference. */
  readonly _type?: T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(path: string, message: string): Result<T> => ({
  ok: false,
  errors: [`${path || "value"}: ${message}`],
});

interface StringOpts {
  min?: number;
  max?: number;
  pattern?: RegExp;
  trim?: boolean;
}

function string(opts: StringOpts = {}): Schema<string> {
  return {
    parse(input, path = "") {
      if (typeof input !== "string") return fail(path, "must be text");
      const value = opts.trim === false ? input : input.trim();
      if (opts.min !== undefined && value.length < opts.min)
        return fail(path, `must be at least ${opts.min} characters`);
      if (opts.max !== undefined && value.length > opts.max)
        return fail(path, `must be at most ${opts.max} characters`);
      if (opts.pattern && !opts.pattern.test(value)) return fail(path, "has an invalid format");
      return ok(value);
    },
  };
}

interface NumberOpts {
  min?: number;
  max?: number;
  integer?: boolean;
}

function number(opts: NumberOpts = {}): Schema<number> {
  return {
    parse(input, path = "") {
      if (typeof input !== "number" || !Number.isFinite(input)) return fail(path, "must be a number");
      if (opts.integer && !Number.isInteger(input)) return fail(path, "must be a whole number");
      if (opts.min !== undefined && input < opts.min) return fail(path, `must be ≥ ${opts.min}`);
      if (opts.max !== undefined && input > opts.max) return fail(path, `must be ≤ ${opts.max}`);
      return ok(input);
    },
  };
}

function boolean(): Schema<boolean> {
  return {
    parse(input, path = "") {
      return typeof input === "boolean" ? ok(input) : fail(path, "must be true or false");
    },
  };
}

function oneOf<const V extends readonly string[]>(values: V): Schema<V[number]> {
  const allowed = new Set<string>(values);
  return {
    parse(input, path = "") {
      return typeof input === "string" && allowed.has(input)
        ? ok(input as V[number])
        : fail(path, `must be one of: ${values.join(", ")}`);
    },
  };
}

function array<T>(item: Schema<T>, opts: { min?: number; max?: number } = {}): Schema<T[]> {
  return {
    parse(input, path = "") {
      if (!Array.isArray(input)) return fail(path, "must be a list");
      if (opts.min !== undefined && input.length < opts.min)
        return fail(path, `must have at least ${opts.min} items`);
      if (opts.max !== undefined && input.length > opts.max)
        return fail(path, `must have at most ${opts.max} items`);
      const values: T[] = [];
      const errors: string[] = [];
      input.forEach((entry, index) => {
        const result = item.parse(entry, `${path}[${index}]`);
        if (result.ok) values.push(result.value);
        else errors.push(...result.errors);
      });
      return errors.length ? { ok: false, errors } : ok(values);
    },
  };
}

type Shape = Record<string, Schema<unknown>>;
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never;
}[keyof S];
type ObjectOf<S extends Shape> = {
  [K in Exclude<keyof S, OptionalKeys<S>>]: Infer<S[K]>;
} & { [K in OptionalKeys<S>]?: Infer<S[K]> };

interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return {
    optional: true,
    parse(input, path = "") {
      if (input === undefined || input === null) return ok(undefined);
      return inner.parse(input, path) as Result<T | undefined>;
    },
  };
}

function object<S extends Shape>(shape: S, opts: { allowUnknown?: boolean } = {}): Schema<ObjectOf<S>> {
  return {
    parse(input, path = "") {
      if (!input || typeof input !== "object" || Array.isArray(input))
        return fail(path, "must be an object");
      const source = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const errors: string[] = [];
      for (const [key, schema] of Object.entries(shape)) {
        const result = schema.parse(source[key], path ? `${path}.${key}` : key);
        if (result.ok) {
          if (result.value !== undefined) out[key] = result.value;
        } else errors.push(...result.errors);
      }
      if (!opts.allowUnknown) {
        for (const key of Object.keys(source)) {
          if (!(key in shape)) errors.push(`${path ? `${path}.` : ""}${key}: is not an allowed field`);
        }
      }
      return errors.length ? { ok: false, errors } : ok(out as ObjectOf<S>);
    },
  };
}

function nullable<T>(inner: Schema<T>): Schema<T | null> {
  return {
    parse(input, path = "") {
      if (input === null) return ok(null);
      return inner.parse(input, path) as Result<T | null>;
    },
  };
}

function record<T>(valueSchema: Schema<T>, opts: { maxKeys?: number; keys?: readonly string[] } = {}): Schema<Record<string, T>> {
  const allowed = opts.keys ? new Set(opts.keys) : null;
  return {
    parse(input, path = "") {
      if (!input || typeof input !== "object" || Array.isArray(input)) return fail(path, "must be an object");
      const entries = Object.entries(input as Record<string, unknown>);
      if (opts.maxKeys !== undefined && entries.length > opts.maxKeys) return fail(path, `must have at most ${opts.maxKeys} keys`);
      const out: Record<string, T> = {};
      const errors: string[] = [];
      for (const [key, value] of entries) {
        if (allowed && !allowed.has(key)) {
          errors.push(`${path ? `${path}.` : ""}${key}: is not an allowed key`);
          continue;
        }
        const result = valueSchema.parse(value, path ? `${path}.${key}` : key);
        if (result.ok) out[key] = result.value;
        else errors.push(...result.errors);
      }
      return errors.length ? { ok: false, errors } : ok(out);
    },
  };
}

/** Accept anything JSON-shaped (used for opaque round-tripped payloads). */
function unknownValue(): Schema<unknown> {
  return { parse: (input) => ok(input) };
}

export const v = { string, number, boolean, oneOf, array, object, optional, nullable, record, unknown: unknownValue };

/**
 * Parse model output that should be JSON. Tolerates ```json fences, rejects
 * everything else. Returns null on any failure so callers can fall back.
 */
export function parseJsonLoose(text: string | null | undefined): unknown {
  if (!text) return null;
  let body = text.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1];
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
