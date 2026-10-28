// HTTP plumbing shared by the comp report's functions. Every endpoint is
// same-origin — the SPA is served from the same site — so there are no CORS
// headers, and no response is cacheable: everything here is per-user.

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  console.error('comp-report: unhandled error', error);
  return json({ error: 'internal', message: 'Something went wrong on our side.' }, 500);
}

/** Runs a handler; any HttpError becomes its JSON response, anything else a 500. */
export async function respond(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    return errorResponse(error);
  }
}

export function allowMethods(req: Request, ...methods: string[]): void {
  if (!methods.includes(req.method)) {
    throw new HttpError(405, 'method_not_allowed', `Use ${methods.join(' or ')}.`);
  }
}

/** Parses a JSON body into an object, or refuses the request. Bodies are small here. */
export async function readJsonObject(req: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'body_too_large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_body', 'Send a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

/**
 * The body as text, refused with 413 once it passes maxBytes: by Content-Length before reading,
 * then by counting bytes as they stream, so an oversized body is never read whole or parsed.
 */
export async function readBoundedText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'body_too_large');
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'body_too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** readJsonObject, with the size counted in bytes as the body streams (readBoundedText). */
export async function readBoundedJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const text = await readBoundedText(req, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_body', 'Send a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
