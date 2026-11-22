import { betterAuth } from "better-auth";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { admin, jwt } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { env } from "./env.js";
import { getDatabase, getDatabaseClient } from "./database.js";
import { isValidPassword, isValidPhotoUrl, roles } from "../utils/auth-validation.js";

let auth;

// Also used by integration tests with a dedicated test database.
export function createAuth(database, client, config = env) {
  if (!config.authSecret || config.authSecret.length < 32) {
    throw new Error("Set a random BETTER_AUTH_SECRET of at least 32 characters.");
  }
  const origin = new URL(config.authUrl);
  if (origin.origin !== config.authUrl || !["http:", "https:"].includes(origin.protocol)
    || (config.nodeEnv === "production" && origin.protocol !== "https:")) {
    throw new Error("BETTER_AUTH_URL must be the public frontend origin (HTTPS in production).");
  }
  if (Boolean(config.googleClientId) !== Boolean(config.googleClientSecret)) {
    throw new Error("Configure both Google OAuth credentials or neither.");
  }

  const access = createAccessControl({ user: ["set-role"] });
  const instance = betterAuth({
    appName: "GearRent",
    baseURL: config.authUrl,
    basePath: "/api/auth",
    secret: config.authSecret,
    trustedOrigins: [config.authUrl],
    database: mongodbAdapter(database, { client }),
    user: { modelName: "users", additionalFields: { phone: { type: 'string', required: false }, address: { type: 'string', required: false } } },
    emailAndPassword: {
      enabled: true, minPasswordLength: 6, maxPasswordLength: 128,
      requireEmailVerification: false, autoSignIn: true,
    },
    socialProviders: config.googleClientId ? {
      google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret, prompt: 'select_account', redirectURI: `${config.authUrl}/api/auth/callback/google` },
    } : {},
    // Existing password accounts link Google explicitly from their authenticated profile.
    account: { accountLinking: { enabled: true, disableImplicitLinking: true, trustedProviders: [] } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: origin.protocol === "https:" },
    rateLimit: { enabled: config.nodeEnv !== "test", storage: "database", window: 60, max: 100 },
    disabledPaths: ["/request-password-reset", "/reset-password", "/send-verification-email", "/verify-email"],
    logger: { level: "error", log: () => console.error("Authentication service error.") },
    plugins: [
      admin({
        defaultRole: "customer", ac: access,
        roles: {
          customer: access.newRole({ user: [] }),
          owner: access.newRole({ user: [] }),
          admin: access.newRole({ user: ["set-role"] }),
        },
      }),
      jwt({
        jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } },
        jwt: {
          issuer: config.authUrl, audience: "rentflow-api", expirationTime: "5m",
          definePayload: ({ session }) => ({ sid: session.id }),
        },
      }),
    ],
    hooks: { before: createAuthMiddleware(async (context) => {
      const body = (context.body ?? {}) as Record<string, string>;
      if (["/sign-up/email", "/change-password", "/admin/create-user"].includes(context.path)) {
        const password = context.path === "/change-password" ? body.newPassword : body.password;
        if (!isValidPassword(password)) {
          throw new APIError("BAD_REQUEST", { message: "Password must be 6-128 characters with uppercase and lowercase letters." });
        }
      }
      if (["/sign-up/email", "/update-user"].includes(context.path)) {
        if (Object.hasOwn(body, "role")) throw new APIError("FORBIDDEN", { message: "Roles are managed by administrators." });
        if (context.path === "/sign-up/email" && (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100)) {
          throw new APIError("BAD_REQUEST", { message: "Name is required and must be at most 100 characters." });
        }
        if ((context.path === "/sign-up/email" || Object.hasOwn(body, "image")) && !isValidPhotoUrl(body.image)) {
          throw new APIError("BAD_REQUEST", { message: "Enter a valid HTTP(S) photo URL." });
        }
      }
      if (context.path.startsWith("/admin/")) {
        // Only the local bootstrap script may call createUser without HTTP headers.
        if (context.path === "/admin/create-user" && !context.request && !context.headers) return;
        if (context.path !== "/admin/set-role") throw new APIError("FORBIDDEN", { message: "This administrative action is not enabled." });
        const current = await instance.api.getSession({ headers: context.headers, query: { disableCookieCache: true } });
        if (!current) throw new APIError("UNAUTHORIZED", { message: "Sign in to continue." });
        if (current.user.role !== "admin" || current.user.id === body.userId) {
          throw new APIError("FORBIDDEN", { message: "Only an administrator can change another user's role." });
        }
        if (!roles.includes(body.role)) throw new APIError("BAD_REQUEST", { message: "Choose customer, owner, or admin." });
      }
    }) },
  });
  return instance;
}

export function initializeAuth() {
  auth ??= createAuth(getDatabase(), getDatabaseClient());
  return auth;
}

export function getAuth() {
  if (!auth) throw new Error("Authentication is not initialized.");
  return auth;
}
