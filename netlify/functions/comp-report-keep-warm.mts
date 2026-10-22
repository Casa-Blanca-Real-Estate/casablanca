// Keeps the comp report's first-load functions warm in business hours — a
// SCHEDULED function. Business hours are Kimani's: 9am to 9pm New York time,
// Monday to Saturday. Outside them a reload may start cold, and that's fine. A function that hasn't run for a few minutes starts cold
// on its next call, about a second and a half slower; a reload hits /me and
// then the report or the list, so after a pause each reload paid that twice.
//
// Each ping carries no sign-in, so the function answers 401 before it touches
// Identity or the database: it warms the function and nothing else. The
// database is deliberately left to sleep when idle — keeping it awake is billed
// by the hour (docs/comp-report/load-speed.md).
const PATHS = [
  '/api/comp-report/me',
  '/api/comp-report/reports',
  '/api/comp-report/workspace',
  '/api/comp-report/messages',
];

/** 9am–9pm in New York, Monday to Saturday, daylight saving included. */
export function inBusinessHours(at: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(at);
  const day = parts.find((p) => p.type === 'weekday')?.value;
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  return day !== 'Sun' && hour >= 9 && hour < 21;
}

export default async (req: Request) => {
  if (!inBusinessHours(new Date())) return;
  let origin = process.env.URL ?? null;
  if (!origin) {
    try {
      origin = new URL(req.url).origin;
    } catch {
      return;
    }
  }
  await Promise.allSettled(PATHS.map((path) => fetch(origin + path, { headers: { 'x-comp-report-keep-warm': '1' } })));
};

// Every 2 minutes. Measured: a function a minute or two idle is still mostly
// warm; fully cold it takes about 1.9 s more (docs/comp-report/load-speed.md).
// The schedule is in UTC, so it covers 9am–9pm New York in both summer
// (13:00–00:59 UTC) and winter (14:00–01:59 UTC), every day; inBusinessHours()
// drops the rest, Sundays included, before any ping goes out.
export const config = { schedule: '*/2 0-1,13-23 * * *' };
