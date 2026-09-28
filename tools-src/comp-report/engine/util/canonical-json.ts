// Canonical JSON — one byte-exact serialisation per value, so hashes of inputs
// and outputs are reproducible in any JavaScript runtime.
//
// Object keys are sorted by UTF-16 code unit (never locale), keys whose value
// is undefined are dropped, and anything JSON can't represent faithfully
// (NaN, Infinity, functions, class instances, undefined inside arrays) throws
// rather than being silently coerced. Number and string formatting follow
// JSON.stringify, which the language specification pins exactly.

export function canonicalJson(value: unknown): string {
  return write(value, '$');
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function write(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`canonicalJson: non-finite number at ${path}`);
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        return '[' + value.map((item, i) => {
          if (item === undefined) throw new Error(`canonicalJson: undefined array item at ${path}[${i}]`);
          return write(item, `${path}[${i}]`);
        }).join(',') + ']';
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error(`canonicalJson: non-plain object at ${path}`);
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort(compareCodeUnits);
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + write(record[k], `${path}.${k}`)).join(',') + '}';
    }
    default:
      throw new Error(`canonicalJson: cannot serialise a ${typeof value} at ${path}`);
  }
}
