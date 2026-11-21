export const roles = ["customer", "owner", "admin"];

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 128
    && /[A-Z]/.test(password) && /[a-z]/.test(password);
}

export function isValidPhotoUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
