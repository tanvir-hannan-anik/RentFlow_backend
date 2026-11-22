import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const nodeEnv = process.env.NODE_ENV ?? "development";
const port = Number(process.env.PORT ?? 5000);

if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error("NODE_ENV must be development, test, or production.");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a whole number between 1 and 65535.");
}

function publicOrigin(value: string, name: string) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, '') !== '') throw new Error();
    return url.origin;
  } catch { throw new Error(name + ' must be an HTTP(S) website origin without a path.'); }
}
const authUrlValue = process.env.BETTER_AUTH_URL ?? (nodeEnv === 'production' ? '' : 'http://localhost:3000');
const authUrl = authUrlValue ? publicOrigin(authUrlValue, 'BETTER_AUTH_URL') : '';
const corsOrigins = (process.env.CORS_ORIGINS ?? authUrl).split(',').map(value => value.trim()).filter(Boolean).map(value => publicOrigin(value, 'CORS_ORIGINS'));

export const env = {
  nodeEnv, port, corsOrigins,
  mongodbUri: process.env.MONGODB_URI,
  databaseName: process.env.DATABASE_NAME,
  authUrl,
  authSecret: process.env.BETTER_AUTH_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  imgbbApiKey: process.env.IMGBB_API_KEY,
};
