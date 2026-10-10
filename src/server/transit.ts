import type { Journey, JourneyLeg, Stop } from '../shared/types.js';

const HQ = {
  label: 'Eficode — Pohjoinen Rautatiekatu 25',
  latitude: 60.1694149,
  longitude: 24.9257622,
};

const STOP_SEARCH_QUERY = `query SearchStops($search: String!) {
  stops(name: $search) {
    gtfsId
    name
    code
    lat
    lon
  }
}`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface UpstreamLeg {
  mode?: string | null;
  duration?: number | null;
  from?: { name?: string | null } | null;
  to?: { name?: string | null } | null;
  start?: { scheduledTime?: string | null } | null;
  end?: { scheduledTime?: string | null } | null;
  trip?: { routeShortName?: string | null } | null;
  realtimeState?: string | null;
}

interface UpstreamItinerary {
  start?: string | null;
  end?: string | null;
  duration?: number | null;
  legs?: UpstreamLeg[] | null;
}

function endpoint(): string {
  return process.env.DIGITRANSIT_API_URL || 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
}

async function queryDigitransit<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = process.env.DIGITRANSIT_SUBSCRIPTION_KEY;
  if (key) headers['digitransit-subscription-key'] = key;

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The HSL journey service took too long to respond. Please try again.');
    }
    throw new Error('Could not connect to the HSL journey service. Please try again.');
  }

  const payload = (await response.json().catch(() => null)) as GraphQLResponse<T> | null;
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Digitransit rejected the request. Check the server-side API subscription key.');
    }
    throw new Error(`The HSL journey service returned HTTP ${response.status}.`);
  }
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((item) => item.message).join('; '));
  }
  if (!payload?.data) throw new Error('The HSL journey service returned an empty response.');
  return payload.data;
}

function normalizeStop(raw: Record<string, unknown>, distance: number | null = null): Stop | null {
  const id = typeof raw.gtfsId === 'string' ? raw.gtfsId : '';
  const name = typeof raw.name === 'string' ? raw.name : '';
  const latitude = Number(raw.lat);
  const longitude = Number(raw.lon);
  if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id,
    name,
    code: typeof raw.code === 'string' && raw.code ? raw.code : null,
    latitude,
    longitude,
    distance,
  };
}

function displayTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function normalizeJourney(raw: UpstreamItinerary, index = 0): Journey | null {
  const legs = (raw.legs ?? []).map((leg): JourneyLeg => ({
    mode: leg.mode || 'TRANSIT',
    route: leg.trip?.routeShortName || null,
    from: leg.from?.name || 'Start',
    to: leg.to?.name || 'End',
    departureTime: displayTime(leg.start?.scheduledTime) || null,
    arrivalTime: displayTime(leg.end?.scheduledTime) || null,
    realtimeState: leg.realtimeState || null,
  }));
  const transitLegs = legs.filter((leg) => leg.mode.toUpperCase() !== 'WALK');

  const departureTime = displayTime(raw.start) || legs.find((leg) => leg.departureTime)?.departureTime || '';
  const arrivalTime = displayTime(raw.end) || [...legs].reverse().find((leg) => leg.arrivalTime)?.arrivalTime || '';
  const routeNames = transitLegs.map((leg) => leg.route).filter((route): route is string => Boolean(route));
  const transfers = Math.max(0, transitLegs.length - 1);
  const durationSeconds = Number(raw.duration);
  const legSeconds = legs.reduce((total, leg, legIndex) => total + Number(raw.legs?.[legIndex]?.duration || 0), 0);
  const durationMinutes = Math.max(1, Math.round((durationSeconds || legSeconds) / 60));

  return {
    id: `${departureTime}-${index}`,
    departureTime,
    arrivalTime,
    durationMinutes,
    transfers,
    summary: routeNames.length ? routeNames.join(' → ') : transitLegs.length ? 'Public transport' : 'Walk',
    legs,
  };
}

export async function searchStops(search: string): Promise<Stop[]> {
  const term = search.trim();
  if (term.length < 2 || term.length > 80) return [];
  const result = await queryDigitransit<{ stops?: Array<Record<string, unknown>> }>(STOP_SEARCH_QUERY, { search: term });
  return (result.stops ?? []).map((stop) => normalizeStop(stop)).filter((stop): stop is Stop => stop !== null).slice(0, 12);
}

export async function nearbyStops(radius: number): Promise<Stop[]> {
  const safeRadius = Math.min(3000, Math.max(200, Math.round(radius)));
  const query = `{
    stopsByRadius(lat: ${HQ.latitude}, lon: ${HQ.longitude}, radius: ${safeRadius}, first: 10) {
      edges {
        node {
          stop { gtfsId name code lat lon }
          distance
        }
      }
    }
  }`;
  const result = await queryDigitransit<{
    stopsByRadius?: { edges?: Array<{ node?: { stop?: Record<string, unknown>; distance?: number } }> };
  }>(query);
  return (result.stopsByRadius?.edges ?? [])
    .map(({ node }) => node?.stop ? normalizeStop(node.stop, Number(node.distance)) : null)
    .filter((stop): stop is Stop => stop !== null);
}

export async function planJourneys(
  stop: Pick<Stop, 'id' | 'name' | 'latitude' | 'longitude'>,
  direction: 'TO_OFFICE' | 'FROM_OFFICE',
): Promise<Journey[]> {
  if (!stop.id.startsWith('HSL:') || !stop.name.trim()) throw new Error('Choose a valid HSL stop.');
  if (
    !Number.isFinite(stop.latitude) || stop.latitude < 59 || stop.latitude > 62 ||
    !Number.isFinite(stop.longitude) || stop.longitude < 22 || stop.longitude > 27
  ) throw new Error('The selected stop has invalid coordinates.');

  const from = direction === 'TO_OFFICE'
    ? { latitude: stop.latitude, longitude: stop.longitude, label: stop.name }
    : { latitude: HQ.latitude, longitude: HQ.longitude, label: HQ.label };
  const to = direction === 'TO_OFFICE'
    ? { latitude: HQ.latitude, longitude: HQ.longitude, label: HQ.label }
    : { latitude: stop.latitude, longitude: stop.longitude, label: stop.name };
  const point = (place: typeof from) => `{location: {coordinate: {latitude: ${place.latitude}, longitude: ${place.longitude}}}, label: ${JSON.stringify(place.label)}}`;
  const query = `{
    planConnection(
      origin: ${point(from)}
      destination: ${point(to)}
      first: 8
      dateTime: {earliestDeparture: "${new Date().toISOString()}"}
    ) {
      edges {
        node {
          start
          end
          duration
          legs {
            mode
            duration
            from { name }
            to { name }
            start { scheduledTime }
            end { scheduledTime }
            realtimeState
            trip { routeShortName }
          }
        }
      }
    }
  }`;

  const result = await queryDigitransit<{
    planConnection?: { edges?: Array<{ node?: UpstreamItinerary }> };
  }>(query);
  return (result.planConnection?.edges ?? [])
    .map((edge, index) => edge.node ? normalizeJourney(edge.node, index) : null)
    .filter((journey): journey is Journey => journey !== null)
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
}
