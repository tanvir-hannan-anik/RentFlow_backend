import express from "express";
import cors from "cors";
import helmet from "helmet";
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
app.use(express.json({ limit: "100kb" }));
app.use("/api", apiRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
