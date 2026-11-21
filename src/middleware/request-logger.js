export function requestLogger(request, response, next) {
  const startedAt = performance.now();
  const path = request.path;
  response.on("finish", () => {
    const duration = Math.round(performance.now() - startedAt);
    // Do not log request bodies, query strings, or authorization headers.
    console.log(`${request.method} ${path} ${response.statusCode} ${duration}ms`);
  });
  next();
}
