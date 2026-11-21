import { MongoClient } from "mongodb";
import { env } from "./env.js";

let client;
let database;
let connectionPromise;

export function connectDatabase() {
  // Concurrent callers share one connection attempt and one driver pool.
  if (!connectionPromise) connectionPromise = openConnection();
  return connectionPromise;
}

async function openConnection() {
  try {
    if (!env.mongodbUri || !/^mongodb(?:\+srv)?:\/\//.test(env.mongodbUri)) {
      throw new Error("Invalid database configuration.");
    }
    if (!env.databaseName || !/^[a-zA-Z0-9_-]{1,63}$/.test(env.databaseName)) {
      throw new Error("Invalid database configuration.");
    }

    client = new MongoClient(env.mongodbUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
    });
    await client.connect();
    const connectedDatabase = client.db(env.databaseName);
    await connectedDatabase.command({ ping: 1 }, { timeoutMS: 3000 });
    database = connectedDatabase;
    return database;
  } catch {
    await client?.close().catch(() => {});
    client = undefined;
    database = undefined;
    // Never forward a driver's error, URI, hostname, or credentials.
    throw new Error("Database connection failed. Check database configuration and Atlas access.");
  }
}

export function getDatabase() {
  if (!database) throw new Error("Database is not connected.");
  return database;
}

export function getDatabaseClient() {
  getDatabase();
  return client;
}

export async function isDatabaseHealthy() {
  try {
    await getDatabase().command({ ping: 1 }, { timeoutMS: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase() {
  await connectionPromise?.catch(() => {});
  const currentClient = client;
  client = undefined;
  database = undefined;
  connectionPromise = undefined;
  await currentClient?.close();
}
