import { useEffect, useMemo, useState } from 'react';
import type { Direction, Journey, Stop } from '../shared/types';

type GraphQLResult<T> = { data?: T; errors?: Array<{ message: string }> };

async function requestGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json() as GraphQLResult<T>;
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.map((error) => error.message).join(' · ') || 'The timetable service is unavailable.');
  }
  if (!result.data) throw new Error('The timetable service returned no data.');
  return result.data;
}

function loadSavedStop(): Stop | null {
  try {
    const value = localStorage.getItem('timetable-stop');
    if (!value) return null;
    const stop = JSON.parse(value) as Stop;
    if (typeof stop.id === 'string' && typeof stop.name === 'string' && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)) return stop;
  } catch {
    localStorage.removeItem('timetable-stop');
  }
  return null;
}

function loadSavedDirection(): Direction {
  return localStorage.getItem('timetable-direction') === 'FROM_OFFICE' ? 'FROM_OFFICE' : 'TO_OFFICE';
}

function formatClock(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—:—' : new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' }).format(date);
}

function formatNow(value: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki',
  }).format(value);
}

function minutesUntil(value: string, now: Date): number | null {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.max(0, Math.ceil((target - now.getTime()) / 60_000));
}

const NEARBY_QUERY = `query NearbyStops {
  nearbyStops(radius: 1400) { id name code latitude longitude distance }
}`;
const SEARCH_QUERY = `query SearchStops($search: String!) {
  searchStops(search: $search) { id name code latitude longitude distance }
}`;
const JOURNEYS_QUERY = `query Journeys($stopId: String!, $stopName: String!, $latitude: Float!, $longitude: Float!, $direction: Direction!) {
  journeys(stopId: $stopId, stopName: $stopName, latitude: $latitude, longitude: $longitude, direction: $direction) {
    id departureTime arrivalTime durationMinutes transfers summary
    legs { mode route from to departureTime arrivalTime realtimeState }
  }
}`;

export default function App() {
  const [direction, setDirection] = useState<Direction>(() => loadSavedDirection());
  const [selectedStop, setSelectedStop] = useState<Stop | null>(() => loadSavedStop());
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Stop[]>([]);
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [searchError, setSearchError] = useState('');
  const [journeyError, setJourneyError] = useState('');
  const [nearbyError, setNearbyError] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingJourneys, setLoadingJourneys] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [refreshToken, setRefreshToken] = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestGraphQL<{ nearbyStops: Stop[] }>(NEARBY_QUERY)
      .then(({ nearbyStops: stops }) => {
        if (!cancelled) {
          setNearbyStops(stops);
          setNearbyError('');
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setNearbyError(error instanceof Error ? error.message : 'Nearby stops could not be loaded.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (!showPicker || term.length < 2) {
      setSuggestions([]);
      setSearchError('');
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      requestGraphQL<{ searchStops: Stop[] }>(SEARCH_QUERY, { search: term })
        .then(({ searchStops: stops }) => {
          if (!cancelled) {
            setSuggestions(stops);
            setSearchError('');
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) setSearchError(error instanceof Error ? error.message : 'Stop search failed.');
        })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, showPicker]);

  useEffect(() => {
    if (!selectedStop) {
      setJourneys([]);
      setLoadingJourneys(false);
      setJourneyError('');
      setUpdatedAt(null);
      return;
    }
    let cancelled = false;
    const loadJourneys = async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoadingJourneys(true);
      try {
        const { journeys: results } = await requestGraphQL<{ journeys: Journey[] }>(JOURNEYS_QUERY, {
          stopId: selectedStop.id,
          stopName: selectedStop.name,
          latitude: selectedStop.latitude,
          longitude: selectedStop.longitude,
          direction,
        });
        if (!cancelled) {
          setJourneys(results);
          setJourneyError('');
          setUpdatedAt(new Date());
        }
      } catch (error) {
        if (!cancelled) setJourneyError(error instanceof Error ? error.message : 'Journeys could not be loaded.');
      } finally {
        if (!cancelled) {
          setLoadingJourneys(false);
          setRefreshing(false);
        }
      }
    };
    void loadJourneys(false);
    const timer = window.setInterval(() => { void loadJourneys(true); }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedStop, direction, refreshToken]);

  const options = useMemo(() => search.trim().length >= 2 ? suggestions : nearbyStops, [nearbyStops, search, suggestions]);

  function chooseStop(stop: Stop) {
    setSelectedStop(stop);
    localStorage.setItem('timetable-stop', JSON.stringify(stop));
    setSearch('');
    setShowPicker(false);
    setSuggestions([]);
  }

  function chooseDirection(nextDirection: Direction) {
    setDirection(nextDirection);
    localStorage.setItem('timetable-direction', nextDirection);
  }

  const directionLabel = direction === 'TO_OFFICE' ? 'To Eficode' : 'From Eficode';
  const destinationLabel = direction === 'TO_OFFICE' ? 'Eficode · Helsinki' : selectedStop?.name || 'Choose a stop';

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Eficode travel board home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>eficode<span className="brand-period">.</span></span>
        </a>
        <div className="topbar-right">
          <span className="live-indicator"><i /> HSL LIVE BOARD</span>
          <span className="topbar-divider" />
          <span className="current-time">{formatNow(now)}</span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">YOUR NEXT JOURNEY, AT A GLANCE</p>
          <h1>Make your<br /><em>move on time.</em></h1>
          <p className="hero-description">A little head start makes all the difference. Find your next HSL connection to or from the office.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-disc" />
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="art-pin"><span>H</span></div>
          <div className="art-caption">HELSINKI<br /><strong>60°10′N</strong></div>
        </div>
      </section>

      <section className="board" aria-label="HSL timetable">
        <div className="board-topline">
          <div>
            <p className="section-kicker">DEPARTURE BOARD <span>—</span> POHJOINEN RAUTATIEKATU 25</p>
            <h2>Where are you headed?</h2>
          </div>
          <div className="updated-label">
            <span className={updatedAt ? 'status-dot is-live' : 'status-dot'} />
            {updatedAt ? `Updated ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' }).format(updatedAt)}` : 'Waiting for a stop'}
          </div>
        </div>

        <div className="controls-row">
          <div className="direction-switch" role="group" aria-label="Journey direction">
            <button className={direction === 'TO_OFFICE' ? 'direction-option active' : 'direction-option'} onClick={() => chooseDirection('TO_OFFICE')} aria-pressed={direction === 'TO_OFFICE'}>
              <span className="direction-arrow">↙</span> To Eficode
            </button>
            <button className={direction === 'FROM_OFFICE' ? 'direction-option active' : 'direction-option'} onClick={() => chooseDirection('FROM_OFFICE')} aria-pressed={direction === 'FROM_OFFICE'}>
              <span className="direction-arrow">↗</span> From Eficode
            </button>
          </div>
          <button className="stop-selector" onClick={() => setShowPicker((shown) => !shown)} aria-expanded={showPicker}>
            <span className="selector-icon" aria-hidden="true">⌖</span>
            <span className="selector-copy"><small>{direction === 'TO_OFFICE' ? 'TRAVELLING FROM' : 'TRAVELLING TO'}</small><strong>{selectedStop?.name || 'Choose a stop'}</strong></span>
            <span className="chevron" aria-hidden="true">⌄</span>
          </button>
        </div>

        {showPicker && (
          <div className="stop-picker">
            <label htmlFor="stop-search">Search HSL stops</label>
            <div className="search-field"><span aria-hidden="true">⌕</span><input id="stop-search" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setShowPicker(false); }} placeholder="Try Kamppi or Rautatieasema" /><kbd>ESC</kbd></div>
            {searchError && <p className="inline-error" role="alert">{searchError}</p>}
            {searching && <p className="picker-hint">Searching HSL stops…</p>}
            {!searching && search.trim().length >= 2 && !searchError && options.length === 0 && <p className="picker-hint">No matching stops. Try another name.</p>}
            {search.trim().length < 2 && <p className="picker-hint">Stops near the office</p>}
            <div className="stop-options" role="listbox" aria-label="Available stops">
              {options.map((stop) => (
                <button key={stop.id} className="stop-option" role="option" aria-selected={selectedStop?.id === stop.id} onClick={() => chooseStop(stop)}>
                  <span className="stop-option-pin">●</span><span><strong>{stop.name}</strong><small>{stop.code ? `Stop ${stop.code}` : 'HSL stop'}{stop.distance != null ? ` · ${Math.round(stop.distance)} m away` : ''}</small></span><span className="option-arrow">↗</span>
                </button>
              ))}
            </div>
            {nearbyError && search.trim().length < 2 && <p className="inline-error" role="alert">{nearbyError}</p>}
          </div>
        )}

        <div className="journeys-heading">
          <div><span className="journey-heading-icon" aria-hidden="true">✳</span><h3>Upcoming journeys</h3><span className="journey-count">{journeys.length ? String(journeys.length).padStart(2, '0') : '—'}</span></div>
          <button className="refresh-button" onClick={() => setRefreshToken((token) => token + 1)} disabled={!selectedStop || refreshing} aria-label="Refresh journey times">
            <span className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'}>↻</span> Refresh
          </button>
        </div>

        {!selectedStop ? (
          <div className="empty-state choose-state">
            <div className="empty-icon" aria-hidden="true">⌖</div>
            <div><strong>Choose your stop to get started</strong><p>Search any HSL stop to see the next connections {direction === 'TO_OFFICE' ? 'to' : 'from'} Eficode.</p></div>
            <button className="text-action" onClick={() => setShowPicker(true)}>Find a stop <span>↗</span></button>
          </div>
        ) : journeyError ? (
          <div className="error-state" role="alert"><span className="error-icon">!</span><div><strong>We couldn’t load the timetable</strong><p>{journeyError}</p><small>Check the server’s Digitransit API key and connection, then try again.</small></div><button className="retry-button" onClick={() => setRefreshToken((token) => token + 1)}>Try again</button></div>
        ) : loadingJourneys ? (
          <div className="loading-state" aria-live="polite"><span className="loader" /><span>Finding the next connections…</span></div>
        ) : journeys.length ? (
          <div className="journey-list" aria-live="polite">
            {journeys.map((journey, index) => {
              const wait = minutesUntil(journey.departureTime, now);
              const transitLegs = journey.legs.filter((leg) => leg.mode.toUpperCase() !== 'WALK');
              const walkingOnly = transitLegs.length === 0;
              const displayLegs = walkingOnly ? journey.legs : transitLegs;
              return (
                <article className={index === 0 ? 'journey-card next-journey' : 'journey-card'} key={journey.id}>
                  <div className="departure-time"><strong>{formatClock(journey.departureTime)}</strong><span>{wait === null ? 'NEXT DEPARTURE' : wait === 0 ? 'LEAVES NOW' : `IN ${wait} MIN`}</span></div>
                  <div className="journey-route">
                    <div className="route-lines">{displayLegs.slice(0, 4).map((leg, legIndex) => <span className={`route-pill mode-${leg.mode.toLowerCase()}`} key={`${leg.route || leg.mode}-${legIndex}`}>{leg.route || leg.mode}</span>)}</div>
                    <div className="route-endpoints"><span>{transitLegs[0]?.from || (direction === 'TO_OFFICE' ? selectedStop.name : 'Eficode')}</span><span className="route-connector" /><span>{transitLegs[transitLegs.length - 1]?.to || destinationLabel}</span></div>
                    <p className="route-summary">{walkingOnly ? 'Close enough to walk · No transit needed' : `${journey.summary}${journey.transfers === 0 ? ' · Direct' : ` · ${journey.transfers} ${journey.transfers === 1 ? 'transfer' : 'transfers'}`}`}</p>
                  </div>
                  <div className="arrival-time"><span>ARRIVES</span><strong>{formatClock(journey.arrivalTime)}</strong><small>{journey.durationMinutes} min</small></div>
                  <span className="card-index">{String(index + 1).padStart(2, '0')}</span>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state no-journeys"><div className="empty-icon" aria-hidden="true">◷</div><div><strong>No upcoming public transport journeys found</strong><p>Try another stop or switch the direction. The HSL planner may also have no service at this time.</p></div></div>
        )}

        <div className="board-footer"><span>Showing journeys {direction === 'TO_OFFICE' ? 'towards' : 'from'} <strong>{direction === 'TO_OFFICE' ? 'Eficode HQ' : selectedStop?.name || 'your stop'}</strong></span><span className="source-label"><i /> HSL · DIGITRANSIT</span></div>
      </section>

      <footer className="page-footer"><span>Made for the moments between <em>“just one more thing”</em> and “I should leave.”</span><span>Transit data © HSL · CC BY 4.0</span></footer>
    </main>
  );
}
