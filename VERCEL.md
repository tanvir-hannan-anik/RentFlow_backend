# Deploy the API
Create a separate Vercel project for this backend repository (Root Directory backend if importing the parent folder). Framework: Other. Node.js: 22.x. Configuration is in vercel.json; api/index.ts initializes MongoDB and Better Auth on cold starts.

Set these Production environment variables before deployment:
- MONGODB_URI: your Atlas connection string
- DATABASE_NAME: your existing database name
- BETTER_AUTH_SECRET: existing secret, at least 32 characters
- BETTER_AUTH_URL: https://YOUR-FRONTEND.vercel.app
- CORS_ORIGINS: https://YOUR-FRONTEND.vercel.app
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- STRIPE_SECRET_KEY and IMGBB_API_KEY

Use exact origins without trailing slashes. Allow the deployment's network access in MongoDB Atlas. The API must be reachable by the frontend; Vercel deployment protection must not block API requests. Never commit .env.local.

Check /api/health and /api/health/database after deployment. Stripe status is verified when the customer returns or checks payment, and before competing checkouts. The local server's periodic reconciliation timer does not run in serverless deployment; unattended reconciliation needs a separately scheduled job. No webhook is required.

The install command explicitly includes devDependencies: npm ci --include=dev. TypeScript and @types/node are required during compilation, even when NODE_ENV is production. Commit package-lock.json together with package.json. Redeploy without the existing build cache after changing installation settings.

Upload limit: 4 MB, leaving room for multipart encoding under the default Vercel request limit. Both projects explicitly install development dependencies for TypeScript compilation.

The TypeScript build includes src/ and api/. Local npm start runs dist/src/server.js; Vercel invokes api/index.ts. Deploy the backend repository root, not src/ or api/.
