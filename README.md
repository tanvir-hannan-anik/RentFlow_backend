# Equipment Rental Platform - Backend

Segment 01 provides a JavaScript ES Modules Express server. `GET /` returns a plain-text startup placeholder. There is no authentication, database connection, or business API.

## Requirements

Use Node.js 22.12.0 or newer and npm. Setup was performed with Node.js 22.12.0 and npm 11.11.1.

## Run independently

Open a terminal in this `backend` folder:

```powershell
npm ci
npm run dev
```

Visit http://localhost:5000. The frontend does not need to be running. Stop the server with Ctrl+C.

The default port is 5000. Optionally configure it:

```powershell
Copy-Item .env.example .env
```

Change `PORT` in `.env` if needed. Both launch commands load this optional file using Node's built-in support. An existing shell environment variable takes precedence. Local environment files are ignored by Git.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependency tree from the lockfile. |
| `npm run dev` | Start the server with Node's built-in file watcher. |
| `npm start` | Start the server without the watcher. |
| `npm run check` | Check both source files for JavaScript syntax errors. |

Plain JavaScript runs directly in Node, so no compilation or build command is needed.

## Structure

`src/app.js` creates the Express app and placeholder route. `src/server.js` validates the port and starts listening. This separation keeps startup concerns out of the app. `docs` holds the development log. Add routes, controllers, and services only when later segments need them.

This folder is an independent npm project and Git repository. See [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) for the setup explanation and validation details.
