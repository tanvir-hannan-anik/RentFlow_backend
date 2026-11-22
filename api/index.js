// Keep application imports inside the handler so startup failures return safe JSON.
let application;
export default async function handler(request, response) {
  try {
    application ??= import('../dist/src/index.js').then(module => module.default);
    const app = await application;
    return app(request, response);
  } catch (error) {
    console.error('API module startup failed', { code: error?.code || error?.name || 'UNKNOWN' });
    response.statusCode = 503;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify({ success: false, message: 'API startup failed. Check backend environment settings and runtime logs.' }));
  }
}
