import express from 'express';
import { apiRouter } from '../src/server/api.ts';

const app = express();
app.use(express.json());

// Health checks
app.get(['/api/health', '/api/healthz'], (_req, res) => {
  res.status(200).send('OK');
});

// Mount API router on both /api and root for serverless flexibility
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
