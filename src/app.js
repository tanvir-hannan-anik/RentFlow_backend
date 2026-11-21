import express from "express";
import cors from "cors";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { getAuth } from "./config/auth.js";
import { env } from "./config/env.js";
import { corsOptions } from "./config/cors.js";
import apiRoutes from "./routes/api.routes.js";
import { requestLogger } from "./middleware/request-logger.js";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

app.disable("x-powered-by");
if (env.nodeEnv === "development") app.use(requestLogger);
app.use(helmet());
app.use(cors(corsOptions));
// Better Auth must read the original request stream before express.json().
app.all("/api/auth/{*path}", (request, response) => toNodeHandler(getAuth())(request, response));
app.use(express.json({ limit: "100kb" }));
app.use("/api", apiRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
