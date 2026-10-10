# Timetables App — Implementation Plan

## 1. Objective

Build and publish a browser-based information screen showing upcoming HSL public-transport journeys between Eficode headquarters (Pohjoinen Rautatiekatu 25, Helsinki) and a user-selected stop or location. The screen should make the next useful departures and journey times easy to scan.

## 2. Requirements and acceptance criteria

- Retrieve public transport timetable/journey data from HSL's open-data ecosystem, using its GraphQL interface (Digitransit Journey Planner API).
- Let the user choose a nearby stop/location and whether journeys are **to headquarters** or **from headquarters**.
- Display upcoming departures with departure time, line/route, destination, estimated journey duration, and transfer information when provided by the API.
- Clearly show loading, empty-results, and recoverable error states; refresh results periodically and provide a manual refresh affordance.
- Keep API credentials on the server; do not bundle secrets into browser assets.
- Package the application with Docker and provide deployment instructions for a cloud host that runs containers.
- Verify the core journey-search flow and the production container build before publishing.

## 3. Proposed implementation

### Application structure

- **Frontend:** React + TypeScript, built with Vite. Responsive, high-contrast timetable layout designed for an always-on display as well as a normal browser.
- **Backend:** Node.js + TypeScript service exposing a small GraphQL API to the frontend. It validates inputs, calls the HSL/Digitransit GraphQL endpoint server-side, and maps provider responses to a stable app-specific schema.
- **Data access:** Use the Journey Planner GraphQL API for stops and journey itineraries. Keep endpoint URL and API key (if required by the selected HSL/Digitransit API access method) in server environment configuration. Do not use the realtime service-alerts protobuf endpoint as a substitute for timetable queries.
- **Packaging:** Docker multi-stage build; serve the built frontend and backend from a deployable container (or document separate container services if the selected hosting platform requires them).

### User experience

- Default to the Eficode headquarters address and offer a searchable stop/location selector.
- Provide a clear direction toggle: **To Eficode** / **From Eficode**.
- Show a compact list of the next departures, sorted by departure time, with a visible “last updated” time.
- Make the chosen location and direction persist during refreshes; handle missing or invalid selections gracefully.

## 4. Work breakdown

1. **Repository and API setup**
   - Establish the React/TypeScript frontend and Node/TypeScript backend structure.
   - Confirm the current Digitransit GraphQL endpoint, required headers/credentials, stop-search query, and journey-planning query from the official API documentation.
   - Add environment-variable examples without committing credentials.
2. **Backend GraphQL service**
   - Define typed app schema and resolvers for stop search and upcoming journeys.
   - Build provider GraphQL requests, normalize response data, validate coordinates/stop IDs, and handle timeouts and upstream errors.
3. **Timetable interface**
   - Implement location search, direction selection, departure cards/list, loading/error/empty states, automatic refresh, and responsive display styling.
   - Add accessible labels and ensure text remains legible at a distance.
4. **Testing and verification**
   - Add focused tests for query construction, response mapping, and invalid/upstream-error cases.
   - Test both travel directions and the main browser flow using mocked provider responses where practical.
   - Build and run the Docker image locally; verify the health endpoint and app behavior.
5. **Cloud publication and handoff**
   - Select a container-capable cloud host, configure runtime environment variables, deploy the image, and verify the public URL.
   - Document local development, Docker build/run, required API configuration, and deployment details.
   - Push the completed solution to a personal GitHub repository and provide both repository and deployed-app URLs.

## 5. Definition of done

- The published browser UI displays HSL journey timetable results for both directions between headquarters and a selected location.
- GraphQL is used for timetable data access; credentials, if required, remain server-side.
- Empty/loading/error states and refresh behavior are usable and understandable.
- Docker build and container startup succeed, and the deployment is reachable over HTTPS.
- The repository documents setup and deployment and contains no committed secrets.

## 6. Assumptions and dependencies

- The implementation will use the Digitransit Journey Planner GraphQL API because the assignment requires HSL open data and GraphQL. Its current endpoint and access requirements must be confirmed against official documentation during implementation.
- A cloud account, API access credentials if needed, and GitHub repository permissions must be available before deployment/publishing. These cannot be inferred from the README.
- The repository currently contains the assignment README but no application implementation or established framework, so the proposed stack is a starting point.
