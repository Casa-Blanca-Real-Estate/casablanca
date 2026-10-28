// What kind of failure the ErrorBoundary caught, from a fixed list: the activity log stores the
// kind (`error.<code>`), never the message (Dispatch 22b). A plain module so the server can check
// a posted name against the same list; ErrorBoundary.tsx re-exports it.
export const ERROR_CODES = ['render', 'type_error', 'reference_error', 'range_error', 'chunk_load', 'network', 'api'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export function errorCode(error: unknown): ErrorCode {
  if (error && typeof error === 'object' && 'status' in error && 'code' in error) return 'api';
  const message = error instanceof Error ? error.message : String(error);
  if (/dynamically imported module|loading chunk|importing a module script/i.test(message)) return 'chunk_load';
  if (error instanceof TypeError && /fetch|network/i.test(message)) return 'network';
  if (error instanceof TypeError) return 'type_error';
  if (error instanceof ReferenceError) return 'reference_error';
  if (error instanceof RangeError) return 'range_error';
  return 'render';
}
