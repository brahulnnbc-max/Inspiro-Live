import express from 'express';
import dotenv from 'dotenv';
import { apiRouter } from '../src/server/api.ts';

dotenv.config();

const app = express();
app.set('etag', false);
app.use(express.json());

// Health checks
app.get(['/api/health', '/api/healthz', '/health', '/healthz'], (_req, res) => {
  res.status(200).send('OK');
});

// Mount API router on both /api and root for serverless flexibility
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
