import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

// This test owns only this new, randomly named database, never rentflow.
const databaseName = `rf_auth_${randomUUID().replaceAll("-", "").slice(0, 24)}`;
process.env.DATABASE_NAME = databaseName;
process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
const { connectDatabase, closeDatabase } = await import("../src/config/database.js");
let server;
let database;
let ownsDatabase = false;
let passed = 0;

try {
  database = await connectDatabase();
  assert.equal((await database.listCollections().toArray()).length, 0);
  ownsDatabase = true;
  const { initializeAuth } = await import("../src/config/auth.js");
  const auth = initializeAuth();
  await auth.$context;
  const { default: app } = await import("../src/app.js");
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = "GET", body, cookie, token, origin = "http://localhost:3000" } = {}) => fetch(`${base}/api${path}`, {
    method, headers: {
      Origin: origin,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined, redirect: "manual", signal: AbortSignal.timeout(20000),
  });
  const cookieFrom = (response) => response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  function pass(label) { passed++; console.log(`PASS: ${label}`); }
  const profile = { name: "Auth Test", email: "customer@example.test", password: "ValidPass123", image: "https://example.com/photo.png" };

  for (const password of ["abc", "abcdef", "ABCDEF"]) {
    assert.equal((await request("/auth/sign-up/email", { method: "POST", body: { ...profile, password } })).status, 400);
  }
  pass("server rejects short, lowercase-only, and uppercase-only passwords");
  assert.equal((await request("/auth/sign-up/email", { method: "POST", body: { ...profile, image: "javascript:alert(1)" } })).status, 400);
  pass("invalid photo URLs are rejected");
  assert.equal((await request("/auth/sign-up/email", { method: "POST", body: { ...profile, role: "admin" } })).status, 403);
  pass("registration cannot choose an elevated role");

  const signup = await request("/auth/sign-up/email", { method: "POST", body: profile });
  assert.equal(signup.status, 200, "Registration must succeed");
  const user = (await signup.json()).user;
  const cookie = cookieFrom(signup);
  assert.equal(user.role, "customer");
  assert.equal(user.image, profile.image);
  assert.match(signup.headers.getSetCookie().join(";"), /httponly/i);
  assert.match(signup.headers.getSetCookie().join(";"), /samesite=lax/i);
  pass("registration creates a Customer and persistent HttpOnly session");
  for (let i = 0; i < 2; i++) {
    const current = await request("/auth/get-session", { cookie });
    assert.equal((await current.json()).user.id, user.id);
  }
  pass("session survives separate refresh requests");
  assert.equal((await request("/me")).status, 401);
  assert.equal((await request("/owner", { cookie })).status, 403);
  assert.equal((await request("/admin", { cookie })).status, 403);
  assert.equal((await request("/customer", { cookie })).status, 200);
  pass("missing identity gets 401 and wrong roles get 403");

  const tokenResponse = await request("/auth/token", { cookie });
  assert.equal(tokenResponse.status, 200);
  const { token } = await tokenResponse.json();
  assert.equal((await request("/me", { cookie, token })).status, 200);
  assert.equal((await request("/me", { token })).status, 401);
  const parts = token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ ...payload, sub: "forged", role: "admin" })).toString("base64url")}.${parts[2]}`;
  assert.equal((await request("/me", { cookie, token: forged })).status, 401);
  pass("JWT signature is verified and token alone cannot bypass session revocation");

  for (const invalid of [{ exp: Math.floor(Date.now() / 1000) - 60 }, { iss: "https://untrusted.example" }, { aud: "another-api" }, { sid: "another-session" }]) {
    const signed = await auth.api.signJWT({ body: { payload: { ...payload, ...invalid } } });
    assert.equal((await request("/me", { cookie, token: signed.token })).status, 401);
  }
  pass("expired, wrong-issuer, wrong-audience, and mismatched-session JWTs fail");

  assert.equal((await request("/auth/update-user", { method: "POST", cookie, body: { role: "owner" } })).status, 403);
  assert.equal((await request(`/admin/users/${user.id}/role`, { method: "POST", cookie, token, body: { role: "admin" } })).status, 403);
  assert.equal((await request("/auth/admin/set-role", { method: "POST", cookie, body: { userId: user.id, role: "admin" } })).status, 403);
  pass("profile and both role endpoints reject customer escalation");

  const adminAccount = await auth.api.createUser({ body: { email: "admin@example.test", password: "AdminPass123", name: "Test Admin", role: "admin" } });
  const adminLogin = await request("/auth/sign-in/email", { method: "POST", body: { email: "admin@example.test", password: "AdminPass123" } });
  assert.equal(adminLogin.status, 200);
  const adminCookie = cookieFrom(adminLogin);
  const change = (targetId, role, origin) => request(`/admin/users/${targetId}/role`, { method: "POST", cookie: adminCookie, body: { role }, ...(origin ? { origin } : {}) });
  assert.equal((await change(adminAccount.user.id, "customer")).status, 403);
  assert.equal((await request("/auth/admin/set-role", { method: "POST", cookie: adminCookie, body: { userId: adminAccount.user.id, role: "customer" } })).status, 403);
  assert.equal((await change(user.id, "superadmin")).status, 400);
  assert.equal((await change(user.id, "owner", "https://untrusted.example")).status, 403);
  assert.equal((await change(user.id, "owner")).status, 200);
  assert.equal((await request("/owner", { cookie, token })).status, 200);
  assert.equal((await request("/customer", { cookie, token })).status, 403);
  assert.equal((await change(user.id, "customer")).status, 200);
  assert.equal((await request("/owner", { cookie, token })).status, 403);
  pass("admin can change another user's role; self changes/CSRF fail; permissions update immediately");

  assert.equal((await request("/auth/admin/create-user", { method: "POST", body: { name: "Attacker", email: "attacker@example.test", password: "Attack123", role: "admin" } })).status, 403);
  assert.equal((await request("/auth/request-password-reset", { method: "POST", body: { email: profile.email } })).status, 404);
  assert.equal((await request("/auth/send-verification-email", { method: "POST", body: { email: profile.email } })).status, 404);
  pass("bootstrap is not public; reset and email-verification endpoints are disabled");

  assert.equal((await request("/auth/sign-out", { method: "POST", cookie, body: {} })).status, 200);
  assert.equal((await request("/me", { cookie, token })).status, 401);
  const wrong = await request("/auth/sign-in/email", { method: "POST", body: { email: profile.email, password: "WrongPass123" } });
  assert.equal(wrong.status, 401);
  const login = await request("/auth/sign-in/email", { method: "POST", body: { email: profile.email, password: profile.password } });
  assert.equal(login.status, 200);
  assert.equal((await request("/me", { cookie: cookieFrom(login) })).status, 200);
  pass("logout invalidates old tokens and email/password login restores a session");

  const options = await (await request("/auth-options")).json();
  if (options.googleEnabled) {
    const social = await request("/auth/sign-in/social", { method: "POST", body: { provider: "google", callbackURL: "/dashboard" } });
    assert.equal(social.status, 200);
    const url = new URL((await social.json()).url);
    assert.equal(url.hostname, "accounts.google.com");
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/callback/google");
    assert.ok(url.searchParams.get("state"));
    pass("Google authorization URL, callback, and OAuth state are configured");
  } else console.log("SKIP: Google authorization redirect (credentials not configured).");
  console.log(`${passed} authentication integration checks passed.`);
} catch (error) {
  console.error(`Authentication integration check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (ownsDatabase && database?.databaseName === databaseName && /^rf_auth_[a-f0-9]{24}$/.test(databaseName)) {
    await database.dropDatabase();
  }
  await closeDatabase();
}
