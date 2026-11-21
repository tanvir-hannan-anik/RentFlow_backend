# RentFlow backend

A small JavaScript ES Modules Express REST foundation. Segment 03 adds the official MongoDB driver, a reusable pool, database readiness, and explicit index setup. No authentication, equipment CRUD, booking, or Stripe features exist yet.

## Run independently

Use Node.js 22.12+ and npm. From this folder:

```powershell
npm ci
# Copy only if .env does not already exist.
Copy-Item .env.example .env
# Set real MONGODB_URI and DATABASE_NAME in .env (or existing .env.local).
npm run db:check
npm run db:setup
npm run dev
```

Visit http://localhost:5000/api/health. `npm start` runs without the development watcher. Stop with Ctrl+C. Direct API checks do not require the frontend.

| Variable | Purpose |
| --- | --- |
| `PORT` | Listening port, default 5000; must be 1-65535. |
| `NODE_ENV` | `development` (default), `test`, or `production`. |
| `CORS_ORIGINS` | Comma-separated exact frontend origins without paths, trailing slashes, or wildcards. |
| `MONGODB_URI` | Required backend-only MongoDB connection URI. Never commit credentials. |
| `DATABASE_NAME` | Required database name; recommended `rentflow`. |

Example: `CORS_ORIGINS=http://localhost:3000,https://your-frontend.example`.

dotenv loads `.env.local`, then `.env`, before configuration is read. Existing shell/hosting values take priority. Use MONGODB_URI, not the old MONGODB_URL spelling. Development defaults to allowing localhost:3000; production defaults to an empty browser-origin allowlist. Set your deployed frontend origin explicitly. Requests without Origin are allowed for server-to-server and CLI tools. CORS is not authentication.

## Request and response flow

`server.js` loads configuration, connects to MongoDB and pings it, then starts listening. Missing or invalid database access causes a safe error and nonzero exit before any HTTP port opens. `app.js` configures middleware in this order:

1. Development-only request logging: method, path, status, duration. No bodies, query strings, or authorization headers are logged.
2. Helmet security headers and CORS origin checks/preflight handling.
3. Express JSON parsing, limited to 100 KB.
4. API routes and the health controller.
5. JSON 404 handler, then centralized error handling.

`GET /api/health` returns HTTP 200:

```json
{"success":true,"message":"Equipment Rental API is running"}
```

JSON responses consistently use `success` and `message`. The response helper supports optional `data` for later endpoints. Unknown routes return 404, malformed JSON 400, oversized JSON 413, rejected origins 403, and unexpected errors 500. Internal error messages and stacks are never sent to clients; production logs also omit unexpected details. Standard CORS preflight responses are empty HTTP 204 rather than JSON.

The old root placeholder is replaced by `/api/health`; `/` now receives the JSON 404. Allowed CORS methods currently match this segment: GET, HEAD, OPTIONS. Extend them when real routes require it.

Invalid configuration and occupied ports exit nonzero. SIGINT/SIGTERM stop new requests and allow up to ten seconds for existing requests before forced exit.

MongoDB is closed after HTTP requests drain and also on listener failure. `GET /api/health/database` pings the existing pool and returns 200 when available or a sanitized 503 otherwise. The existing health route stays unchanged. See [DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) for Atlas setup, fields, examples, money/date rules, relationships, and indexes.

`npm run db:check` connects and pings without writing. `npm run db:setup` creates the five application collections and their indexes; rerunning unchanged definitions is safe. It never creates users/auth records, inserts seeds, or drops existing indexes. Setup is an explicit maintenance step, not part of ordinary startup.

## Structure

```text
src/
  config/env.js
  config/cors.js
  config/database.js
  config/database-indexes.js
  controllers/health.controller.js
  routes/api.routes.js
  middleware/request-logger.js
  middleware/not-found.js
  middleware/error-handler.js
  utils/api-response.js
  app.js
  server.js
test/api.test.js
test/database.test.js
scripts/database.js
```

Configuration validates the environment and defines CORS. Routes choose controllers; the health controller sends the shared response shape. Middleware handles common request concerns. No service folder is needed until business logic exists. Express is retained; new packages are dotenv, cors, and helmet. Node's built-in test runner, fetch, and watcher avoid extra development dependencies.

## Test commands

```powershell
npm run check
npm test
```

`check` checks entry-file syntax; `test` imports the full app and uses temporary local listeners. Sixteen offline tests cover API behavior, safe startup without database credentials, readiness failure, connection reuse, cleanup, recovery of readiness, and repeatable index definitions. Driver calls are mocked for database unit tests; these do not prove Atlas connectivity. Tests explicitly override database settings so they cannot use local secrets. The intentional failure test logs `Unexpected API error.`; this is expected.

Live database verification requires valid credentials: run `npm run db:check`, then `npm run db:setup` twice, then `npm start` and request `/api/health/database`. No sample business data is inserted by these commands.

With `npm run dev` running, use these PowerShell commands:

```powershell
curl.exe -i http://localhost:5000/api/health
curl.exe -i http://localhost:5000/api/missing
curl.exe -i -X POST http://localhost:5000/api/health -H 'Content-Type: application/json' --data-binary '{'
curl.exe -i http://localhost:5000/api/health -H 'Origin: http://localhost:3000'
curl.exe -i http://localhost:5000/api/health -H 'Origin: https://unapproved.example'
curl.exe -i -X OPTIONS http://localhost:5000/api/health -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: GET'
```

For the end-to-end check, start both applications and run `npm run test:connection` inside frontend.

## Production routing

Deploy independently with `NODE_ENV=production`, your host's `PORT`, and `CORS_ORIGINS=https://your-frontend.example`. Set frontend server-only `BACKEND_URL=https://your-backend.example` before its build. Browser requests reach the frontend's `/api/*`; Next.js forwards them to Express. Rebuild the frontend when its backend destination changes. See the frontend README for details.

See docs/DEVELOPMENT_LOG.md for package versions and implementation history.
