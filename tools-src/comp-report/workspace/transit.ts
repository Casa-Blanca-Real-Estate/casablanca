// The subway near a comp's building (NW-037 a, Dispatch 20): from the building's
// mapped location (ws.geocodes, Dispatch 11) to the nearest stations and the
// lines that stop there, from Dispatch 17's MTA list (workspace/data/,
// subway-stations.json). Context on Sort's card only: transit never reaches the
// engine, the numbers or Hubert. In the tool a line shows as a coloured circle
// with its letter; client emails, when they carry it, use plain text with a dot
// (Kimani, 2026-10-21: data/README.md).
const EARTH_RADIUS_MILES = 3958.8;
const RAD = Math.PI / 180;

/** Miles between two points, flat-earth, as the engine measures a comp's distance: a hair off the great circle at a walk. */
function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLng = (b.lng - a.lng) * RAD * Math.cos(((a.lat + b.lat) / 2) * RAD);
  return Math.sqrt(dLat * dLat + dLng * dLng) * EARTH_RADIUS_MILES;
}

export interface SubwayLine {
  color: string;
  textColor: string;
}

export interface Station {
  name: string;
  /** The services that stop on a weekday, 7am to 7pm. */
  lines: string[];
  /** The ones that stop only at night or on weekends. */
  otherLines: string[];
  lat: number;
  lng: number;
}

export interface SubwayData {
  lines: Record<string, SubwayLine>;
  stations: Station[];
}

export interface NearStation {
  name: string;
  lines: { line: string; color: string; textColor: string }[];
  miles: number;
}

/** How far a station can be and still count as near: about a ten-minute walk. */
export const NEAR_MILES = 0.5;
/** At most this many stations are named. */
export const MAX_STATIONS = 2;

/**
 * The stations nearest a point, within NEAR_MILES, closest first, at most
 * MAX_STATIONS, each with its weekday lines in the MTA's colours. A line with
 * no colour in the list is left out. None near: an empty list.
 */
export function nearestStations(point: { lat: number; lng: number }, data: SubwayData, opts: { within?: number; max?: number } = {}): NearStation[] {
  const within = opts.within ?? NEAR_MILES;
  const max = opts.max ?? MAX_STATIONS;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return [];
  return data.stations
    .map((s) => ({ s, miles: distanceMiles(point, s) }))
    .filter((x) => x.miles <= within)
    .sort((a, b) => a.miles - b.miles || a.s.name.localeCompare(b.s.name))
    .slice(0, max)
    .map(({ s, miles }) => ({
      name: s.name,
      miles,
      lines: s.lines.flatMap((line) => {
        const c = data.lines[line];
        return c ? [{ line, color: c.color, textColor: c.textColor }] : [];
      }),
    }));
}

let loading: Promise<SubwayData> | null = null;

/** The MTA list, loaded once, on its own (it's large): the browser fetches it when a card first needs it. */
export function loadSubway(): Promise<SubwayData> {
  loading ??= import('./data/subway-stations.json').then((m) => (m.default ?? m) as unknown as SubwayData);
  return loading;
}
