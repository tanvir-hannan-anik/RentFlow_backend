import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { MongoClient } from "mongodb";

// No test uses Atlas or local secret files.
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
process.env.DATABASE_NAME = "rentflow_test";
const { connectDatabase, closeDatabase, getDatabase, isDatabaseHealthy } =
  await import("../src/config/database.js");
const { databaseIndexes, setupDatabaseIndexes } = await import("../src/config/database-indexes.js");

after(async () => { await closeDatabase(); mock.restoreAll(); });

test("concurrent connections reuse one client, ping, and database", async () => {
  const database = { command: mock.fn(async () => ({ ok: 1 })) };
  const connect = mock.method(MongoClient.prototype, "connect", async function () { return this; });
  const db = mock.method(MongoClient.prototype, "db", () => database);
  const close = mock.method(MongoClient.prototype, "close", async () => {});
  try {
    const results = await Promise.all([connectDatabase(), connectDatabase(), connectDatabase()]);
    assert.ok(results.every((result) => result === database));
    assert.equal(connect.mock.callCount(), 1);
    assert.equal(db.mock.callCount(), 1);
    assert.equal(getDatabase(), database);
    assert.equal(await isDatabaseHealthy(), true);
    await closeDatabase();
    assert.equal(close.mock.callCount(), 1);
    assert.throws(getDatabase, /not connected/);
    assert.equal(await isDatabaseHealthy(), false);
  } finally { await closeDatabase(); mock.restoreAll(); }
});

test("driver failures are sanitized and failed clients are closed", async () => {
  mock.method(MongoClient.prototype, "connect", async () => {
    throw new Error("mongodb://private-user:private-password@private-host");
  });
  const close = mock.method(MongoClient.prototype, "close", async () => {});
  try {
    await assert.rejects(connectDatabase(), (error) => {
      assert.equal(error.message, "Database connection failed. Check database configuration and Atlas access.");
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(close.mock.callCount(), 1);
    assert.equal(await isDatabaseHealthy(), false);
  } finally { await closeDatabase(); mock.restoreAll(); }
});

test("a failed ping marks an established connection unavailable", async () => {
  let available = true;
  mock.method(MongoClient.prototype, "connect", async function () { return this; });
  mock.method(MongoClient.prototype, "db", () => ({ command: async () => {
    if (!available) throw new Error("private network error");
    return { ok: 1 };
  } }));
  mock.method(MongoClient.prototype, "close", async () => {});
  try {
    await connectDatabase();
    available = false;
    assert.equal(await isDatabaseHealthy(), false);
    available = true;
    assert.equal(await isDatabaseHealthy(), true);
  } finally { await closeDatabase(); mock.restoreAll(); }
});

test("index setup is repeatable and never touches auth collections or documents", async () => {
  const definitions = new Map();
  const database = { collection(name) {
    assert.notEqual(name, "users");
    return { async createIndexes(indexes) {
      if (definitions.has(name)) assert.deepEqual(indexes, definitions.get(name));
      definitions.set(name, indexes);
    } };
  } };
  await setupDatabaseIndexes(database);
  await setupDatabaseIndexes(database);
  assert.deepEqual([...definitions.keys()], ["equipment", "favorites", "bookings", "payments", "reviews"]);
  assert.equal(databaseIndexes.favorites[0].unique, true);
  const paymentIndex = databaseIndexes.payments.find((index) => index.name === "payments_stripe_intent");
  assert.equal(paymentIndex.unique, true);
  assert.deepEqual(paymentIndex.partialFilterExpression, { stripePaymentIntentId: { $type: "string" } });
});
