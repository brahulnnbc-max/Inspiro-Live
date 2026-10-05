import express from 'express';
import { apiRouter } from '../src/server/api.ts';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Keep all API routes under /api for Vercel serverless deployment.
app.use('/api', apiRouter);

export default app;
