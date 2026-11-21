import { env } from "../config/env.js";
import { sendResponse } from "../utils/api-response.js";

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  let message = "Internal server error.";

  if (error.type === "entity.parse.failed") {
    message = "Request body must contain valid JSON.";
  } else if (status === 413) {
    message = "Request body is too large. Maximum size is 100 KB.";
  } else if (status < 500 && error.expose === true) {
    message = error.message;
  } else if (status < 500) {
    message = "Request could not be processed.";
  }

  if (status >= 500) {
    console.error(env.nodeEnv === "production" ? "Unexpected API error." : error);
  }

  return sendResponse(response, status, message);
}
