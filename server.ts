import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const isProd = process.env.NODE_ENV === 'production';

function cleanTrackQuery(raw: string): string {
  return raw
    .replace(/\.(mp3|flac|m4a|wav|aac|ogg|opus)$/i, '')
    .replace(/\b(pagalnew|pagalworld|masstamilan|kuttyweb|starmusiq|tamiltunes|isaimini|pendujatt|djpunjab|mr-jatt|songs\.pk|320\s*kbps|128\s*kbps|kbps|official\s*(music\s*)?video|lyrical\s*video|full\s*song|audio\s*song|hd)\b/gi, ' ')
    .replace(/[\[\(][^\]\)]*(pagal|mass|kutty|kbps|official|video|lyric|from|feat\.?|ft\.?)[^\]\)]*[\]\)]/gi, ' ')
    .replace(/[-–—_|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0B80-\u0BFF\u0900-\u097F\u0C00-\u0C7F\u0D00-\u0D7F]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

interface ItunesTrackItem {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
}

function scoreCandidate(
  item: ItunesTrackItem,
  titleTokens: string[],
  artistTokens: string[]
): number {
  const trackText = `${item.trackName || ''} ${item.collectionName || ''}`.toLowerCase();
  const artistText = (item.artistName || '').toLowerCase();

  let titleMatches = 0;
  for (const tok of titleTokens) {
    if (trackText.includes(tok)) titleMatches++;
  }
  if (titleTokens.length > 0 && titleMatches === 0) return -1;

  let artistMatches = 0;
  for (const tok of artistTokens) {
    if (artistText.includes(tok) || trackText.includes(tok)) artistMatches++;
  }

  const titleRatio = titleTokens.length > 0 ? titleMatches / titleTokens.length : 0;
  const artistRatio = artistTokens.length > 0 ? artistMatches / artistTokens.length : 0;
  return titleRatio * 65 + artistRatio * 35;
}

async function searchItunesHdArtwork(
  cleanTitle: string,
  cleanArtist: string,
  country: 'IN' | 'US'
): Promise<string | null> {
  const term = [cleanTitle, cleanArtist].filter(Boolean).join(' ').slice(0, 120);
  if (!term) return null;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${country}&media=music&entity=song&limit=8`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ISAI-MusicPlayer/1.0' },
  });
  if (!resp.ok) return null;

  const data = (await resp.json()) as { results?: ItunesTrackItem[] };
  const results = data.results || [];
  if (results.length === 0) return null;

  const titleTokens = tokenize(cleanTitle);
  const artistTokens = tokenize(cleanArtist);

  let bestUrl: string | null = null;
  let bestScore = -1;

  for (const item of results) {
    if (!item.artworkUrl100) continue;
    const score = scoreCandidate(item, titleTokens, artistTokens);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = item.artworkUrl100;
    }
  }

  // Require at least a clear title match so we never attach an unrelated song's cover
  if (!bestUrl || bestScore < 32) return null;

  return bestUrl.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, '/1400x1400bb.jpg');
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/hd-artwork', async (req, res) => {
    try {
      const rawTitle = typeof req.query.title === 'string' ? req.query.title : '';
      const rawArtist = typeof req.query.artist === 'string' ? req.query.artist : '';
      const cleanTitle = cleanTrackQuery(rawTitle);
      const cleanArtist =
        rawArtist && !/^unknown artist$/i.test(rawArtist.trim()) ? cleanTrackQuery(rawArtist) : '';

      if (!cleanTitle) {
        res.status(400).json({ error: 'Missing track title' });
        return;
      }

      let hdUrl = await searchItunesHdArtwork(cleanTitle, cleanArtist, 'IN');
      if (!hdUrl && cleanArtist) {
        hdUrl = await searchItunesHdArtwork(cleanTitle, '', 'IN');
      }
      if (!hdUrl) {
        hdUrl = await searchItunesHdArtwork(cleanTitle, cleanArtist, 'US');
      }

      if (!hdUrl) {
        res.status(404).json({ error: 'No HD artwork match found' });
        return;
      }

      const parsed = new URL(hdUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.mzstatic.com')) {
        res.status(400).json({ error: 'Invalid artwork origin' });
        return;
      }

      const imgResp = await fetch(hdUrl);
      if (!imgResp.ok) {
        res.status(502).json({ error: 'Failed to fetch HD artwork image' });
        return;
      }

      const arrayBuf = await imgResp.arrayBuffer();
      const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
      res
        .status(200)
        .set('Content-Type', contentType)
        .set('Cache-Control', 'public, max-age=604800')
        .send(Buffer.from(arrayBuf));
    } catch {
      res.status(500).json({ error: 'HD artwork lookup failed' });
    }
  });

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
