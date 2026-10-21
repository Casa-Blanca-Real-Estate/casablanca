// DEV ONLY — builds workspace/data/subway-stations.json (Dispatch 17, NW-037 a)
// from the MTA's static subway GTFS, unzipped:
//
//   curl -sSO https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip && unzip gtfs_subway.zip -d gtfs
//   node tools-src/comp-report/dev/subway-stations.ts gtfs
//
// One station per GTFS parent stop, except that parent stops with the same name
// joined by a transfer (Times Sq-42 St's four) become one, at their average
// position. `lines` are the services that stop there on a weekday between 7am
// and 7pm, the bullets a rider expects; `otherLines` stop only at nights or
// weekends. X-variants (6X, 7X, FX) show as their line; the three shuttles as S.
// Re-run when the MTA changes service; the source note is data/subway-stations.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node dev/subway-stations.ts <unzipped gtfs dir>');

function csv(name: string): Record<string, string>[] {
  const [head, ...rows] = readFileSync(join(dir!, name), 'utf8').trim().split(/\r?\n/);
  const cols = head!.split(',');
  return rows.map((line) => {
    const cells: string[] = [];
    let cur = '', quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
}

const routes = csv('routes.txt');
const lineOf = new Map(routes.map((r) => [r.route_id!, r.route_short_name!.replace(/^(\w)X$/, '$1')]));
const order = new Map(routes.map((r) => [lineOf.get(r.route_id!)!, Number(r.route_sort_order)]));
const lines: Record<string, { color: string; textColor: string }> = {};
for (const r of [...routes].sort((a, b) => Number(a.route_sort_order) - Number(b.route_sort_order))) {
  const line = lineOf.get(r.route_id!)!;
  const colour = { color: `#${r.route_color}`, textColor: `#${r.route_text_color}` };
  const seen = lines[line];
  if (seen && (seen.color !== colour.color || seen.textColor !== colour.textColor)) throw new Error(`two colours for ${line}`);
  lines[line] = colour;
}

const stops = csv('stops.txt');
const parentOf = new Map(stops.map((s) => [s.stop_id!, s.parent_station || s.stop_id!]));
const parents = stops.filter((s) => s.location_type === '1');

const trips = new Map(csv('trips.txt').map((t) => [t.trip_id!, t]));
const daytime = new Map<string, Set<string>>();
const anytime = new Map<string, Set<string>>();
const add = (m: Map<string, Set<string>>, k: string, v: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v);
for (const st of csv('stop_times.txt')) {
  const trip = trips.get(st.trip_id!);
  if (!trip) continue;
  const parent = parentOf.get(st.stop_id!)!;
  const line = lineOf.get(trip.route_id!)!;
  add(anytime, parent, line);
  const hour = Number(st.departure_time!.slice(0, 2));
  if (trip.service_id === 'Weekday' && hour >= 7 && hour < 19) add(daytime, parent, line);
}

// Same-name parent stops joined by a transfer are one station.
const group = new Map(parents.map((p) => [p.stop_id!, p.stop_id!]));
const find = (id: string): string => (group.get(id) === id ? id : find(group.get(id)!));
const nameOf = new Map(parents.map((p) => [p.stop_id!, p.stop_name!]));
for (const t of csv('transfers.txt')) {
  if (t.from_stop_id === t.to_stop_id || nameOf.get(t.from_stop_id!) !== nameOf.get(t.to_stop_id!)) continue;
  group.set(find(t.from_stop_id!), find(t.to_stop_id!));
}
const members = new Map<string, typeof parents>();
for (const p of parents) (members.get(find(p.stop_id!)) ?? members.set(find(p.stop_id!), []).get(find(p.stop_id!))!).push(p);

const byOrder = (a: string, b: string) => order.get(a)! - order.get(b)!;
const stations = [...members.values()].flatMap((ps) => {
  const all = new Set(ps.flatMap((p) => [...(anytime.get(p.stop_id!) ?? [])]));
  if (!all.size) return [];   // a stop with no scheduled trains in this feed
  const day = new Set(ps.flatMap((p) => [...(daytime.get(p.stop_id!) ?? [])]));
  const main = day.size ? day : all;
  const mean = (k: 'stop_lat' | 'stop_lon') => Number((ps.reduce((s, p) => s + Number(p[k]), 0) / ps.length).toFixed(6));
  return [{
    name: ps[0]!.stop_name!,
    lines: [...main].sort(byOrder),
    otherLines: [...all].filter((l) => !main.has(l)).sort(byOrder),
    lat: mean('stop_lat'),
    lng: mean('stop_lon'),
    gtfsStopIds: ps.map((p) => p.stop_id!).sort(),
  }];
}).sort((a, b) => a.gtfsStopIds[0]!.localeCompare(b.gtfsStopIds[0]!));

const feed = csv('feed_info.txt')[0]!;
const out = { source: { feed: 'MTA New York City Transit static subway GTFS', feedVersion: feed.feed_version, feedStart: feed.feed_start_date, feedEnd: feed.feed_end_date }, lines, stations };
writeFileSync(new URL('../workspace/data/subway-stations.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`${stations.length} stations, ${Object.keys(lines).length} lines`);
