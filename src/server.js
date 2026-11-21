// Dynamic imports let us catch configuration errors before starting to listen.
try {
  const { env } = await import("./config/env.js");
  const { default: app } = await import("./app.js");
  const server = app.listen(env.port);

  server.on("listening", () => {
    console.log(`RentFlow API: http://localhost:${env.port}/api/health`);
  });

  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE"
      ? `Port ${env.port} is already in use.`
      : "Unable to start the API server.");
    process.exitCode = 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      server.close((error) => process.exit(error ? 1 : 0));
      // Do not wait forever for a connection that will not finish.
      setTimeout(() => process.exit(1), 10000).unref();
    });
  }
} catch (error) {
  console.error(process.env.NODE_ENV === "production"
    ? "API startup failed. Check the server environment configuration."
    : `API startup failed: ${error.message}`);
  process.exitCode = 1;
}
