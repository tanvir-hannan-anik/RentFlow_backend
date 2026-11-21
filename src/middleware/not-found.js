import { sendResponse } from "../utils/api-response.js";

export function notFound(request, response) {
  return sendResponse(response, 404, "Endpoint not found. Try GET /api/health.");
}
