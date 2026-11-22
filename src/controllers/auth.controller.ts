import { fromNodeHeaders } from "better-auth/node";
import { getAuth } from "../config/auth.js";
import { roles } from "../utils/auth-validation.js";
import { sendResponse } from "../utils/api-response.js";

export function getCurrentUser(request, response) {
  const { id, name, email, image, role } = request.auth.user;
  return sendResponse(response, 200, "Authenticated", { user: { id, name, email, image, role } });
}

export async function changeUserRole(request, response) {
  const { role } = request.body ?? {};
  if (!roles.includes(role)) return sendResponse(response, 400, "Choose customer, owner, or admin.");
  if (request.params.userId === request.auth.user.id) return sendResponse(response, 403, "You cannot change your own role.");
  try {
    const result = await getAuth().api.setRole({
      headers: fromNodeHeaders(request.headers), body: { userId: request.params.userId, role },
    });
    return sendResponse(response, 200, "Role updated", { user: { id: result.user.id, role: result.user.role } });
  } catch (error) {
    const status = [400, 401, 403, 404].includes(error.statusCode) ? error.statusCode : 500;
    return sendResponse(response, status, status === 404 ? "User not found." : "Unable to change this user's role.");
  }
}
