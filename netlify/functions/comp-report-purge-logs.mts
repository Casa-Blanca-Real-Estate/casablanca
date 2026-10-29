// Trims the sign-in and activity logs once a day — a SCHEDULED function (Dispatch 22b). It only
// calls the three purge functions, as the system actor log-purge: the open doors' rows go after
// 30 days, every other sign-in-log row after 13 months, activity after 90 days, and the IP
// buckets with their day's salt after the day ends. 08:17 UTC, an off-hour in New York.
// See tools-src/comp-report/server/api/purge-logs.ts.
import { purgeLogs } from '../../tools-src/comp-report/server/api/purge-logs.ts';
import { databasePool } from '../../tools-src/comp-report/server/db.ts';

export default async () => {
  try {
    const trimmed = await purgeLogs(databasePool());
    console.log(JSON.stringify({ purge: 'comp-report-logs', trimmed }));
  } catch (error) {
    console.error('comp-report purge: failed', error instanceof Error ? error.message : error);
  }
};

export const config = { schedule: '17 8 * * *' };
