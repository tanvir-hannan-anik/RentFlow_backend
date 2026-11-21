import { sendResponse } from "../utils/api-response.js";

export function getHealth(request, response) {
  response.set("Cache-Control", "no-store");
  return sendResponse(response, 200, "Equipment Rental API is running");
}
