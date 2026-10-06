import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './src/server/api.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createExpressApp() {
  const app = express();

  app.use(express.json());

  // Health checks for Cloud Run, Vercel, and Kubernetes probes
  app.get(['/healthz', '/health', '/_health', '/api/health'], (_req, res) => {
    res.status(200).send('OK');
  });

  // Mount API endpoints under /api
  app.use('/api', apiRouter);

  return app;
}

async function startServer() {
  const app = createExpressApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Vite development middleware mode vs production static serving
  const isDev =
    process.env.NODE_ENV === 'development' ||
    (process.env.NODE_ENV !== 'production' && !process.env.PORT && !process.env.K_SERVICE);

  const distPath = path.resolve(__dirname, 'dist');
  const indexPath = path.resolve(distPath, 'index.html');

  if (isDev && !fs.existsSync(indexPath)) {
    try {
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR !== 'true',
          watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.warn('Vite middleware initialization warning:', viteErr);
    }
  } else {
    // Production static file serving
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }

    app.get('*', (_req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>inspiro - Synchronized JEE Classroom</title>
  </head>
  <body class="bg-[#0b0f17] text-white">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`);
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`JEE LiveSync Server running at http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown handling for Cloud Run / Container termination
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing HTTP server gracefully...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  });

  return server;
}

// Only start when executed directly
if (process.env.VERCEL !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
