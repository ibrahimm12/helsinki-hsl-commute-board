export type Direction = 'TO_OFFICE' | 'FROM_OFFICE';

export interface Stop {
  id: string;
  name: string;
  code: string | null;
  latitude: number;
  longitude: number;
  distance: number | null;
}

export interface JourneyLeg {
  mode: string;
  route: string | null;
  from: string;
  to: string;
  departureTime: string | null;
  arrivalTime: string | null;
  realtimeState: string | null;
}

export interface Journey {
  id: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  transfers: number;
  summary: string;
  legs: JourneyLeg[];
}
