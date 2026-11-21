# Backend development log

## Segment 01 - 2026-11-21

### Scope and input checks

The workspace was empty when inspected before setup. No files were overwritten. AGENTS.md and the assignment PDF were unavailable in the checked workspace and parent locations. The user's suggested frontend location was also absent when checked. This setup follows the written Segment 01 requirements; the missing documents could not be verified.

Only a startup placeholder is implemented. There is no authentication, database operation, or business API.

### Setup steps

1. Checked the installed tools: Node 22.12.0, npm 11.11.1, and Git 2.51.0.windows.1. Git already had a user name and email.
2. Created an independent `backend` folder and `package.json`. Set `private` to prevent accidental npm publication and `type` to `module` to allow JavaScript `import` and `export`.
3. Installed the stable Express 5.3.0 release with `npm install --offline=false`. Authorized registry access was needed because the environment initially forced offline access. npm generated the package lockfile.
4. Created `src/app.js` to configure Express separately from the listening server. `GET /` returns plain text so startup can be checked without adding a business API.
5. Created `src/server.js` to read `PORT`, default to 5000, reject invalid port values, and start the server.
6. Added scripts using Node's built-in watcher and optional environment-file support. No nodemon or dotenv dependency is needed.
7. Added an environment example, ignore rules, independent run instructions, and this log.
8. Validated syntax and both startup modes. Results are recorded below.
9. Initialized Git inside this folder only and prepared the initial setup commit. No remote or push is required.

### Installed direct package

| Package | Version | Why it is installed |
| --- | --- | --- |
| `express` | 5.3.0 | Provides a small HTTP application and route handling. |

There are no development dependencies. Supporting Express packages are recorded in `package-lock.json`. `npm ci` installs that exact tree.

### Every project file and folder

| Path | Purpose |
| --- | --- |
| `package.json` | Project identity, ES Modules setting, scripts, Node requirement, and Express dependency. |
| `package-lock.json` | Exact dependency tree and package integrity information. |
| `.gitignore` | Excludes dependencies, coverage, logs, OS files, and private environment files; allows `.env.example`. |
| `.env.example` | Documents the optional `PORT=5000` setting. |
| `README.md` | Independent setup and run instructions. |
| `docs/DEVELOPMENT_LOG.md` | This setup explanation and validation record. |
| `src/app.js` | Creates and exports Express with the startup placeholder route. |
| `src/server.js` | Validates the port and starts the HTTP listener. |
| `node_modules/` | Generated installed packages; not committed. |
| `.git/` | This application's independent repository history. |

Routes, controllers, models, and services folders will be added only when later segments require actual code.

### Commands and configuration

Run from `backend`; the frontend is not required:

```powershell
npm ci
npm run check
npm run dev
```

`dev` runs `node --watch --env-file-if-exists=.env src/server.js`, which reloads the server when source files change. `start` runs the same entry point without the watcher. `check` uses `node --check` on both source files; it is a syntax check, not a full linter or automated feature test. No build step is needed for plain JavaScript.

Optionally run `Copy-Item .env.example .env` and edit `PORT`. Node reads the file when present; the app works without it. Existing shell environment values take priority. Valid ports are whole numbers from 1 through 65535. Visit http://localhost:5000 for the default setting and stop with Ctrl+C.

Git setup commands are `git init -b main`, `git add .`, and `git commit -m "chore: initialize Express backend"`, run within this folder. Use `git log -1 --oneline` for the commit identifier and `git status --short` for uncommitted changes. No Git repository is created in the parent workspace.

### Validation results

- `npm install --offline=false` completed with zero reported vulnerabilities.
- `npm run check` passed for both JavaScript source files.
- `npm run dev` started on port 5000 and returned HTTP 200 with `Equipment Rental Platform backend`.
- `npm start` independently started on port 5000 and returned HTTP 200 with the same placeholder.
- The development watcher initially hit the sandbox's `spawn EPERM` restriction. It passed after authorized execution outside that restriction.
- Both commands work without a `.env` file. Node's message that the optional file is missing is informational.
- No build is needed, and no business-feature test suite is included in this setup segment.

## Segment 02 - 2026-11-21

### Review and scope

Reviewed the available frontend AGENTS.md and both existing projects before editing; both Git working trees were clean. No backend-specific AGENTS.md or assignment PDF was available. Continued the existing Express ES Modules project for RentFlow without recreating it. This segment has no authentication, database, equipment routes, or business services.

### Packages and configuration

Installed `dotenv@18.0.10`, `cors@2.8.6`, and `helmet@8.3.0` with `npm install --save-exact dotenv cors helmet --offline=false`. Express remains 5.3.0. The updated package-lock.json records the complete tree. npm reported zero vulnerabilities. The existing environment needs authorized registry access for installations.

`src/config/env.js` loads dotenv quietly before reading configuration, validates NODE_ENV and PORT, and parses/validates comma-separated origins. Existing process environment takes precedence over .env. Development defaults to port 5000 and origin http://localhost:3000. Production has no approved browser origins unless configured. The updated .env.example explains all three variables. Startup scripts now use dotenv rather than Node's environment-file flag: `npm run dev` runs `node --watch src/server.js`; `npm start` runs `node src/server.js`.

### Files and responsibilities

- `src/config/cors.js`: exact allowlist; absent Origin is permitted for CLI/server calls; rejected origins produce 403. GET, HEAD, OPTIONS and Content-Type are permitted for preflight. No wildcard or credential middleware was added.
- `src/app.js`: development logger, Helmet, CORS, JSON parser, API routes, 404, final error handler, in that order. JSON size limit is 100 KB. Express's identification header is disabled.
- `src/routes/api.routes.js`: mounts GET /health beneath /api.
- `src/controllers/health.controller.js`: sends the requested message with HTTP 200 and no-store caching.
- `src/utils/api-response.js`: small shared sender for success/message and optional data. No larger response abstraction is needed.
- `src/middleware/request-logger.js`: measures finished requests in development; captures the original path before routing and omits query strings, headers, and bodies.
- `src/middleware/not-found.js`: JSON 404 with a hint to use GET /api/health.
- `src/middleware/error-handler.js`: maps malformed JSON to 400 and oversized bodies to 413, handles intentional client errors, and hides internal failures behind a generic 500 message. No client stack trace is returned. Production error logs also omit internal details. Delegates to Express if response headers were already sent.
- `src/server.js`: catches configuration import errors, handles listener errors such as occupied ports, logs readiness, and closes on SIGINT/SIGTERM with a ten-second deadline.
- `test/api.test.js`: Node's built-in test runner with real ephemeral HTTP listeners and subprocess startup checks. The synthetic failure route exists only in a test app, not in the public API.
- `README.md`: current run commands, environment reference, structure, request flow, manual requests, automated tests, and separate-host deployment instructions.

No services folder was created because there is no business logic yet. The former GET / plain-text placeholder is replaced by GET /api/health; unknown paths, including /, receive JSON 404. Standard CORS preflight uses an empty 204 response, not a JSON body.

### Verification and commands

`npm run check` passed for the entry files; `npm test` passed all 11 tests and imports the complete application. Tests cover exact health output and security headers, unknown routes, malformed and valid JSON, oversized bodies, two approved origins, unapproved/deceptive/null origins, preflight, production error privacy, invalid environment values, and occupied ports. The expected synthetic error logs `Unexpected API error.`. The occupied-port test was corrected to use the same network binding as the real server, avoiding an IPv4/IPv6 mismatch on Windows.

`npm run dev` started on port 5000; requests through the frontend returned the expected results and request logs. `NODE_ENV=production` with `npm start` also started successfully. The production listener uses CORS_ORIGINS=http://localhost:3000 for local integration checks. Frontend `npm run test:connection` verifies the helper and proxy. README.md contains all manual curl commands for health, missing routes, malformed JSON, CORS and OPTIONS. Test subprocesses and dev/build tools needed authorized execution outside the sandbox's process-spawning restriction.

### Deployment flow

Browser -> frontend /api/* -> Next.js rewrite -> independently hosted Express -> JSON/status back to the browser. Set the real backend origin as frontend BACKEND_URL before building; set the exact frontend origin in backend CORS_ORIGINS and NODE_ENV=production. Rebuild frontend when its destination changes. A missing Origin is allowed but does not prove a caller is trusted: CORS is not authentication.

The two repositories remain independent, with meaningful Segment 02 commits and no GitHub push. Earlier Segment 01 log entries retain the original setup history.

### References reviewed

- https://expressjs.com/en/resources/middleware/cors/
- https://expressjs.com/en/guide/error-handling/
- https://github.com/helmetjs/helmet
- https://www.npmjs.com/package/dotenv

## Segment 03 - 2026-11-21

### Connection and configuration

Reviewed existing instructions, code, and both development logs. No assignment PDF was present, so the schema will explicitly distinguish supplied requirements from provisional choices. Found a credential in the user's modified .env.example; replaced it with a placeholder, normalized the existing ignored .env.local key from MONGODB_URL to MONGODB_URI, and added DATABASE_NAME=rentflow. No credential is committed. Rotation was recommended because the value had been exposed in the shareable example.

Installed the official mongodb driver. dotenv now reads .env.local then .env, preserving shell-variable priority. Added a shared MongoClient/promise, a pool capped at ten, bounded connection/ping timeouts, safe errors, and explicit cleanup. Startup must connect and ping before listening; it fails closed when configuration or Atlas access is invalid. No requests create new clients. Failed connection attempts remain failed until closeDatabase resets the module or the process restarts.

Added GET /api/health/database as a 200/503 readiness check. Existing GET /api/health remains unchanged as liveness. Added explicit db:check and idempotent db:setup commands. The latter creates indexes and empty application collections without touching users or auth internals. Normal startup never runs index maintenance. Shutdown and listener errors close the driver pool.

### Document design and offline tests

Created DATABASE_DESIGN.md with all six planned collections, field types, relationships, illustrative documents, auth ownership boundaries, precise BSON Int64 minor-unit prices, proposed booking/payment states, half-open UTC rental intervals, Atlas setup, and a table matching all executable indexes. PDF-dependent choices are marked provisional. Users and auth internals remain wholly deferred to Better Auth; no auth schema or sample records are inserted. Configuration validation is kept local; unused business validation abstractions were not added.

Added isolated database tests for concurrent pool reuse, cleanup and sanitized failures, readiness loss/recovery, and repeatable index definitions without auth writes. All 16 offline tests and entry syntax checks passed. The live check initially reached Atlas but authentication failed. After the user's update, both local copies matched and connection plus ping succeeded. Removed the redundant MongoDB value from frontend/.env.local while preserving BACKEND_URL and the backend credential; both local files are ignored. Backend README now documents database-required startup and the separate setup command.

### Live verification and completion

Installed mongodb@7.9.1; npm reported zero vulnerabilities. `npm run db:check` passed against Atlas after the credential update. `npm run db:setup` passed twice against rentflow, verifying real idempotency. Read-only index inspection confirmed all 14 named indexes across equipment (5), favorites (1), bookings (3), payments (3), and reviews (2), including unique/partial options. Repeated connectDatabase calls returned the same database handle. No sample data or auth records were written.

Production-mode `npm start` connected before listening. GET /api/health and GET /api/health/database both returned HTTP 200 with the expected safe JSON; readiness had Cache-Control: no-store. A second startup on the occupied port exited 1 and released its pool. Offline tests remain 16/16 passing; syntax checks passed. The public 503 path is covered without Atlas by the isolated HTTP test. No frontend source changed; only its ignored local credential entry was removed.

The assignment PDF remains unavailable, so PDF-specific completeness and proposed enum/workflow choices still need review when supplied. See DATABASE_DESIGN.md for all commands and limitations. The backend change is committed separately; no remote push was requested.
