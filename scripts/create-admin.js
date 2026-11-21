// Local operator-only bootstrap using Better Auth's official server API.
let closeDatabase;
try {
  const connection = await import("../src/config/database.js");
  closeDatabase = connection.closeDatabase;
  const database = await connection.connectDatabase();
  if (await database.collection("users").countDocuments({ role: "admin" })) {
    throw new Error("An admin already exists. Use the authenticated role-change flow.");
  }
  const { isValidPassword } = await import("../src/utils/auth-validation.js");
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME ?? "RentFlow Admin";
  if (!email || !isValidPassword(password)) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and a valid BOOTSTRAP_ADMIN_PASSWORD in the backend environment.");
  const { initializeAuth } = await import("../src/config/auth.js");
  await initializeAuth().api.createUser({ body: { email, password, name, role: "admin" } });
  console.log("Initial administrator created. Remove the bootstrap password from your environment.");
} catch {
  console.error("Admin bootstrap failed. Check configuration, account uniqueness, and whether an admin already exists.");
  process.exitCode = 1;
} finally { await closeDatabase?.(); }
