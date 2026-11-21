export function sendResponse(response, status, message, data) {
  const body = { success: status < 400, message };
  if (data !== undefined) body.data = data;
  return response.status(status).json(body);
}
