import { env } from "./env.js";

export const corsOptions = {
  origin(origin, callback) {
    // CLI tools and server-to-server requests may have no Origin header.
    if (!origin || env.corsOrigins.includes(origin)) {
      return callback(null, true);
    }

    const error = new Error("Origin is not allowed.");
    error.status = 403;
    error.expose = true;
    callback(error);
  },
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
};
