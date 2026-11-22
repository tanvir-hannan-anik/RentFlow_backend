import { env } from "./env.js";

export const corsOptions = {
  origin(origin, callback) {
    // CLI tools and server-to-server requests may have no Origin header.
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = Object.assign(new Error("Origin is not allowed."), {status:403, expose:true});
    error.status = 403;
    error.expose = true;
    callback(error);
  },
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
