import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { graphql, buildSchema } from 'graphql';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nearbyStops, planJourneys, searchStops } from './transit.js';

const schema = buildSchema(`
  enum Direction { TO_OFFICE FROM_OFFICE }

  type Stop {
    id: ID!
    name: String!
    code: String
    latitude: Float!
    longitude: Float!
    distance: Float
  }

  type JourneyLeg {
    mode: String!
    route: String
    from: String!
    to: String!
    departureTime: String
    arrivalTime: String
    realtimeState: String
  }

  type Journey {
    id: ID!
    departureTime: String!
    arrivalTime: String!
    durationMinutes: Int!
    transfers: Int!
    summary: String!
    legs: [JourneyLeg!]!
  }

  type Query {
    nearbyStops(radius: Int = 1200): [Stop!]!
    searchStops(search: String!): [Stop!]!
    journeys(stopId: String!, stopName: String!, latitude: Float!, longitude: Float!, direction: Direction!): [Journey!]!
  }
`);

const rootValue = {
  nearbyStops: ({ radius }: { radius?: number }) => nearbyStops(radius ?? 1200),
  searchStops: ({ search }: { search: string }) => searchStops(search),
  journeys: (args: {
    stopId: string;
    stopName: string;
    latitude: number;
    longitude: number;
    direction: 'TO_OFFICE' | 'FROM_OFFICE';
  }) => planJourneys({
    id: args.stopId,
    name: args.stopName,
    latitude: args.latitude,
    longitude: args.longitude,
  }, args.direction),
};

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.post('/graphql', async (request, response, next) => {
  try {
    const { query, variables, operationName } = request.body ?? {};
    if (typeof query !== 'string' || query.length > 25_000) {
      response.status(400).json({ errors: [{ message: 'A valid GraphQL query is required.' }] });
      return;
    }
    const result = await graphql({
      schema,
      source: query,
      rootValue,
      variableValues: variables,
      operationName: typeof operationName === 'string' ? operationName : undefined,
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
});

const here = dirname(fileURLToPath(import.meta.url));
const clientBuild = resolve(here, '../client');
if (existsSync(clientBuild)) {
  app.use(express.static(clientBuild, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.get('*', (_request, response) => response.sendFile(resolve(clientBuild, 'index.html')));
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error('Request failed:', error instanceof Error ? error.message : 'unknown error');
  response.status(500).json({ errors: [{ message: 'The request could not be completed.' }] });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Timetables server listening on port ${port}`);
});
