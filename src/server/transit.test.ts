import { describe, expect, it } from 'vitest';
import { normalizeJourney } from './transit.js';

describe('normalizeJourney', () => {
  it('maps a mixed transit itinerary and counts transfers', () => {
    const journey = normalizeJourney({
      start: '2026-10-10T08:00:00Z',
      end: '2026-10-10T08:34:00Z',
      duration: 2040,
      legs: [
        { mode: 'WALK', duration: 180, from: { name: 'Kamppi' }, to: { name: 'Kamppi stop' } },
        {
          mode: 'BUS', duration: 900,
          from: { name: 'Kamppi stop' }, to: { name: 'Central station' },
          start: { scheduledTime: '2026-10-10T08:03:00Z' },
          end: { scheduledTime: '2026-10-10T08:18:00Z' },
          trip: { routeShortName: '14' },
        },
        {
          mode: 'TRAM', duration: 960,
          from: { name: 'Central station' }, to: { name: 'Office' },
          start: { scheduledTime: '2026-10-10T08:20:00Z' },
          end: { scheduledTime: '2026-10-10T08:36:00Z' },
          trip: { routeShortName: '7' },
        },
      ],
    });

    expect(journey).toMatchObject({
      departureTime: '2026-10-10T08:00:00.000Z',
      arrivalTime: '2026-10-10T08:34:00.000Z',
      durationMinutes: 34,
      transfers: 1,
      summary: '14 → 7',
    });
    expect(journey?.legs).toHaveLength(3);
  });

  it('keeps walking-only itineraries instead of treating them as no service', () => {
    const journey = normalizeJourney({
      start: '2026-10-10T09:00:00Z',
      end: '2026-10-10T09:06:00Z',
      duration: 360,
      legs: [{
        mode: 'WALK', duration: 360,
        from: { name: 'Leppäsuonkatu' }, to: { name: 'Eficode' },
        start: { scheduledTime: '2026-10-10T09:00:00Z' },
        end: { scheduledTime: '2026-10-10T09:06:00Z' },
      }],
    });

    expect(journey).toMatchObject({
      durationMinutes: 6,
      transfers: 0,
      summary: 'Walk',
    });
    expect(journey?.legs[0]?.mode).toBe('WALK');
  });

  it('falls back to leg schedule times when itinerary times are missing', () => {
    const journey = normalizeJourney({
      duration: 600,
      legs: [{
        mode: 'RAIL', duration: 600,
        start: { scheduledTime: '2026-10-10T09:00:00Z' },
        end: { scheduledTime: '2026-10-10T09:10:00Z' },
        trip: { routeShortName: 'A' },
      }],
    });
    expect(journey?.departureTime).toBe('2026-10-10T09:00:00.000Z');
    expect(journey?.arrivalTime).toBe('2026-10-10T09:10:00.000Z');
  });
});
