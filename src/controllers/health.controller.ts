import { sendResponse } from "../utils/api-response.js";
import { isDatabaseHealthy } from "../config/database.js";

export function getHealth(request, response) {
  response.set("Cache-Control", "no-store");
  return sendResponse(response, 200, "Equipment Rental API is running");
}

export async function getDatabaseHealth(request, response) {
  response.set("Cache-Control", "no-store");
  const healthy = await isDatabaseHealthy();
  return sendResponse(response, healthy ? 200 : 503,
    healthy ? "Database is available" : "Database is unavailable");
}
