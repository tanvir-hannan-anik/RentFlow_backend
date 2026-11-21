# RentFlow backend

A small JavaScript ES Modules Express REST foundation. Segment 02 includes configuration, middleware, and health checks only. No authentication, database, or equipment features exist yet.

## Run independently

Use Node.js 22.12+ and npm. From this folder:

```powershell
npm ci
# Copy only if .env does not already exist.
Copy-Item .env.example .env
npm run dev
```

Visit http://localhost:5000/api/health. `npm start` runs without the development watcher. Stop with Ctrl+C. Direct API checks do not require the frontend.

| Variable | Purpose |
| --- | --- |
| `PORT` | Listening port, default 5000; must be 1-65535. |
| `NODE_ENV` | `development` (default), `test`, or `production`. |
| `CORS_ORIGINS` | Comma-separated exact frontend origins without paths, trailing slashes, or wildcards. |

Example: `CORS_ORIGINS=http://localhost:3000,https://your-frontend.example`.

dotenv loads `.env` before configuration is read. Existing shell/hosting values take priority. Development defaults to allowing localhost:3000; production defaults to an empty browser-origin allowlist. Set your deployed frontend origin explicitly. Requests without Origin are allowed for server-to-server and CLI tools. CORS is not authentication.

## Request and response flow

`server.js` loads validated configuration and starts listening. `app.js` configures middleware in this order:

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

## Structure

```text
src/
  config/env.js
  config/cors.js
  controllers/health.controller.js
  routes/api.routes.js
  middleware/request-logger.js
  middleware/not-found.js
  middleware/error-handler.js
  utils/api-response.js
  app.js
  server.js
test/api.test.js
```

Configuration validates the environment and defines CORS. Routes choose controllers; the health controller sends the shared response shape. Middleware handles common request concerns. No service folder is needed until business logic exists. Express is retained; new packages are dotenv, cors, and helmet. Node's built-in test runner, fetch, and watcher avoid extra development dependencies.

## Test commands

```powershell
npm run check
npm test
```

`check` checks entry-file syntax; `test` imports the full app and uses temporary local listeners. Eleven tests cover health/security headers, unknown routes, valid/malformed/oversized JSON, allowed/rejected origins, preflight, production error privacy, invalid configuration, and occupied ports. The intentional failure test logs `Unexpected API error.`; this is expected. Tests set their own environment and need no running server.

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
