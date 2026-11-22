# GearRent Backend

Express + TypeScript + MongoDB API for GearRent. Better Auth provides sessions and JWTs. Routes implement equipment submission/approval, private details, favorites, profiles, rental requests, Stripe Checkout with server verification, imgbb uploads, and role dashboards.

Development: `npm install`, configure `.env.local` from `.env.example`, then `npm run dev`.
Production: `npm run build` followed by `npm start`.
Checks: `npm run check`, `npm test`, `npm run test:auth`, `npm run test:equipment`.
Database: `npm run db:check`, `npm run db:setup`, and optional `npm run db:seed`.

Stripe uses no webhooks. Checkout verification and the server's periodic reconciliation retrieve payment state from Stripe directly. MongoDB transactions protect inventory and payment persistence. Keep this backend running for reconciliation. The imgbb key and all other secrets belong only in backend environment variables.

See the workspace `README.md` for the complete workflow and setup instructions. Local API: http://localhost:5000/api/health. Public production URL is not deployed yet.

Dependencies: Express, TypeScript, MongoDB, Better Auth, @better-auth/mongo-adapter, Stripe, multer, jose, dotenv, cors, helmet; tsx and Node's test runner support development and tests.

Admin credentials are stored locally in `.admin-credentials.local.json` and ignored by Git. Never commit that file or `.env.local`.
