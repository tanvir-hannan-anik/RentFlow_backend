// Explicit maintenance commands; ordinary startup never changes indexes.
let closeDatabase;
try {
  const connection = await import("../src/config/database.js");
  closeDatabase = connection.closeDatabase;
  const database = await connection.connectDatabase();
  if (process.argv[2] === "setup") {
    const { setupDatabaseIndexes } = await import("../src/config/database-indexes.js");
    await setupDatabaseIndexes(database);
    console.log("Application collections and indexes are ready. Better Auth collections were not modified.");
  } else {
    console.log("Database connection and ping succeeded.");
  }
} catch {
  console.error("Database check/setup failed. Check configuration, Atlas access, permissions, and index conflicts.");
  process.exitCode = 1;
} finally {
  try { await closeDatabase?.(); } catch {
    console.error("Database cleanup failed.");
    process.exitCode = 1;
  }
}
