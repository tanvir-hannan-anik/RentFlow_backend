import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { spawn } from "node:child_process";
import express from "express";

process.env.NODE_ENV = "production";
process.env.CORS_ORIGINS = "http://localhost:3000,https://rentflow.example";
process.env.PORT = "5000";
const { default: app } = await import("../src/app.js");
const { errorHandler } = await import("../src/middleware/error-handler.js");

let server;
let baseUrl;
before(async () => {
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test("health responds with the expected JSON and security headers", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, message: "Equipment Rental API is running" });
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("unknown endpoints return a useful JSON 404", async () => {
  const response = await fetch(`${baseUrl}/api/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { success: false, message: "Endpoint not found. Try GET /api/health." });
});

test("malformed JSON gets a safe 400 response", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"secret":',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, message: "Request body must contain valid JSON." });
});

test("valid JSON passes parsing and reaches the 404 handler", async () => {
  const response = await fetch(`${baseUrl}/api/missing`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ example: true }),
  });
  assert.equal(response.status, 404);
});

test("oversized JSON returns 413", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(103000) }),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).success, false);
});

test("each approved origin is allowed exactly", async () => {
  for (const origin of ["http://localhost:3000", "https://rentflow.example"]) {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.match(response.headers.get("vary"), /Origin/);
  }
});

test("unapproved origins receive 403 without CORS permission", async () => {
  for (const origin of ["https://unapproved.example", "http://localhost:3000.attacker.example", "null"]) {
    const response = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await response.json(), { success: false, message: "Origin is not allowed." });
  }
});

test("approved CORS preflight returns 204", async () => {
  const response = await fetch(`${baseUrl}/api/health`, {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "content-type" },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
  assert.match(response.headers.get("access-control-allow-methods"), /GET/);
});

test("unexpected errors never expose internal details in production", async (context) => {
  // A test-only route exercises the real middleware without adding a public failure endpoint.
  const failingApp = express();
  failingApp.get("/", () => { throw new Error("private database password"); });
  failingApp.use(errorHandler);
  const failingServer = failingApp.listen(0, "127.0.0.1");
  await once(failingServer, "listening");
  context.after(() => new Promise((resolve) => failingServer.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${failingServer.address().port}`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { success: false, message: "Internal server error." });
});

function runServer(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/server.js"], {
      env: { ...process.env, ...environment }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const timer = setTimeout(() => { child.kill(); reject(new Error("Server did not exit after startup failure.")); }, 5000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

test("invalid configuration exits safely with a nonzero status", async () => {
  for (const environment of [{ PORT: "invalid" }, { CORS_ORIGINS: "https://example.com/path" }]) {
    const result = await runServer(environment);
    assert.equal(result.code, 1);
    assert.match(result.output, /API startup failed/);
    assert.doesNotMatch(result.output, /at .*file:/);
  }
});

test("an occupied port fails with a useful message", async () => {
  const result = await runServer({ PORT: String(server.address().port) });
  assert.equal(result.code, 1);
  assert.match(result.output, /already in use/);
});
