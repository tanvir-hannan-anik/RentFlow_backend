import dotenv from "dotenv";

dotenv.config({ quiet: true });

const nodeEnv = process.env.NODE_ENV ?? "development";
const port = Number(process.env.PORT ?? 5000);

if (!["development", "test", "production"].includes(nodeEnv)) {
  throw new Error("NODE_ENV must be development, test, or production.");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a whole number between 1 and 65535.");
}

const corsOrigins = (process.env.CORS_ORIGINS ??
  (nodeEnv === "production" ? "" : "http://localhost:3000"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

for (const origin of corsOrigins) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
    throw new Error("CORS_ORIGINS must contain exact HTTP(S) origins without paths.");
  }
}

export const env = { nodeEnv, port, corsOrigins };
