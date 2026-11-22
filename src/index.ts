import express from 'express';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { initializeAuth } from './config/auth.js';
const deployment = express();
let ready: Promise<void> | undefined;
deployment.use(async (_req, res, next) => {
  try {
    ready ??= (async () => { await connectDatabase(); await initializeAuth().$context; })().catch(error => { ready = undefined; throw error; });
    await ready;
    next();
  } catch { res.status(503).json({success:false,message:'Service temporarily unavailable. Check database and authentication configuration.'}); }
});
deployment.use(app);
export default deployment;
