import { fromNodeHeaders } from "better-auth/node";
import { createLocalJWKSet, jwtVerify } from "jose";
import { getAuth } from "../config/auth.js";
import { env } from "../config/env.js";
import { sendResponse } from "../utils/api-response.js";

export async function verifyToken(request, response, next) {
  response.set("Cache-Control", "no-store");
  if (!request.headers.cookie) return sendResponse(response, 401, "Sign in to continue.");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== env.authUrl) {
    return sendResponse(response, 403, "Request origin is not allowed.");
  }
  try {
    const auth = getAuth();
    const current = await auth.api.getSession({ headers: fromNodeHeaders(request.headers), query: { disableCookieCache: true } });
    if (!current || current.user.banned) return sendResponse(response, 401, "Session is invalid or expired.");
    if (request.headers.authorization) {
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization);
      if (!match) return sendResponse(response, 401, "Invalid access token.");
      try {
        const keys = createLocalJWKSet(await auth.api.getJwks());
        const { payload } = await jwtVerify(match[1], keys, {
          issuer: env.authUrl, audience: "rentflow-api", algorithms: ["EdDSA"],
          requiredClaims: ["exp", "iat", "sub", "sid"], maxTokenAge: "5m",
        });
        if (payload.sub !== current.user.id || payload.sid !== current.session.id) {
          return sendResponse(response, 401, "Access token does not match this session.");
        }
      } catch { return sendResponse(response, 401, "Access token is invalid or expired."); }
    }
    // Authorization uses the database-backed session, never JWT/client role claims.
    request.auth = current;
    next();
  } catch {
    return sendResponse(response, 503, "Authentication is temporarily unavailable.");
  }
}

function requireRole(role) {
  return (request, response, next) => {
    if (!request.auth) return sendResponse(response, 401, "Sign in to continue.");
    if (request.auth.user.role !== role) return sendResponse(response, 403, "You do not have permission to access this resource.");
    next();
  };
}

export const verifyRenter = requireRole("customer");
export const verifyOwner = requireRole("owner");
export const verifyAdmin = requireRole("admin");

export function requireJwt(request, response, next) {
  if (!request.headers.authorization) return sendResponse(response, 401, 'A valid access token is required.');
  return verifyToken(request, response, next);
}
