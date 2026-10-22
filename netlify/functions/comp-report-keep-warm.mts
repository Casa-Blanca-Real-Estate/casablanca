// Keeps the comp report's first-load functions warm through the working day — a
// SCHEDULED function. A function that hasn't run for a few minutes starts cold
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

export default async (req: Request) => {
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

// Every 2 minutes, 12:00–23:59 UTC: 8am–8pm in New York in summer, 7am–7pm in winter.
// Measured: a function a minute or two idle is still mostly warm; fully cold it
// takes about 1.9 s more (docs/comp-report/load-speed.md).
export const config = { schedule: '*/2 12-23 * * *' };
