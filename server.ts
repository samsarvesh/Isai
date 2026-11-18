import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result?.code) {
          next();
          return;
        }
        const noopTransport =
          'const transport = normalizeModuleRunnerTransport({ async connect() {}, async disconnect() {}, send() {} });';
        const patchedCode = result.code.replace(
          /const transport = normalizeModuleRunnerTransport\([\s\S]*?\)\(\)\);/,
          noopTransport
        );
        res
          .status(200)
          .set('Content-Type', 'application/javascript; charset=utf-8')
          .set('Cache-Control', 'no-store')
          .send(patchedCode);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ISAI server listening on http://localhost:${PORT}`);
  });
}

void createServer();
