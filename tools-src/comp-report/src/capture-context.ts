// The dev notebook (docs/dev-notebook/README.md) records what was on screen
// with each note Kimani writes. The URL already gives the report and the step;
// this adds what it can't, like the report's title. Plain values on a window
// global: nothing in the comp report reads it back or sends it anywhere, and
// with no notebook in the browser nothing reads it at all.
type Published = Record<string, unknown>;

export function publishCaptureContext(key: string, value: unknown): void {
  const w = window as unknown as { __cbCaptureContext?: Published };
  const ctx = w.__cbCaptureContext ?? (w.__cbCaptureContext = {});
  if (value === null || value === undefined) delete ctx[key];
  else ctx[key] = value;
}
