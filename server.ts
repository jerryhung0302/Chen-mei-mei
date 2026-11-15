import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import multer from 'multer';
import type { Order, Product } from './src/types.ts';
import { SEED_PRODUCTS } from './src/data/seedProducts.ts';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

interface StoreData {
  products: Product[];
  orders: Order[];
}

function loadStore(): StoreData {
  if (!fs.existsSync(STORE_PATH)) {
    const initial: StoreData = { products: SEED_PRODUCTS, orders: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as StoreData;
    return {
      products: Array.isArray(parsed.products) ? parsed.products : SEED_PRODUCTS,
      orders: Array.isArray(parsed.orders) ? parsed.orders : []
    };
  } catch {
    const fallback: StoreData = { products: SEED_PRODUCTS, orders: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(fallback, null, 2), 'utf-8');
    return fallback;
  }
}

function saveStore(data: StoreData): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.heic']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogg', '.ogv', '.avi', '.mkv']);
const CHUNKS_DIR = path.join(UPLOADS_DIR, '.chunks');

async function normalizeUploadedVideo(inputPath: string, origExt: string): Promise<string> {
  const parsed = path.parse(inputPath);
  const ext = origExt.toLowerCase();

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,pix_fmt',
      '-of',
      'json',
      inputPath
    ]);
    const info = JSON.parse(stdout) as {
      streams?: Array<{ codec_name?: string; pix_fmt?: string }>;
    };
    const vStream = info.streams?.[0];
    const codec = (vStream?.codec_name || '').toLowerCase();
    const pixFmt = (vStream?.pix_fmt || '').toLowerCase();

    const isBrowserMp4Ready =
      (ext === '.mp4' || ext === '.m4v') && codec === 'h264' && (!pixFmt || pixFmt === 'yuv420p');
    const isBrowserWebm = ext === '.webm' && (codec === 'vp8' || codec === 'vp9' || codec === 'av1');

    if (isBrowserWebm) {
      return path.basename(inputPath);
    }

    const outName = `${parsed.name}-ready.mp4`;
    const outPath = path.join(parsed.dir, outName);

    if (isBrowserMp4Ready) {
      // Zero re-encode: just move moov atom to start so browser plays immediately
      await execFileAsync('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-i',
        inputPath,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        outPath
      ]);
    } else {
      // Transcode non-H.264 / MOV / 10-bit videos to browser-compatible H.264 + AAC MP4
      await execFileAsync('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outPath
      ]);
    }

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      fs.unlinkSync(inputPath);
      return outName;
    }
  } catch {
    // If ffmpeg/ffprobe fails or is unavailable, keep original uploaded file
  }
  return path.basename(inputPath);
}

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB max for video/image upload
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = file.mimetype.startsWith('image/') || IMAGE_EXTS.has(ext);
    const isVideo = file.mimetype.startsWith('video/') || VIDEO_EXTS.has(ext);
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(new Error('僅支援圖片或影片格式檔案上傳'));
    }
  }
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  // Serve uploaded files and static assets cleanly in both dev and production
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/media', express.static(path.join(ROOT_DIR, 'public', 'media')));
  app.use('/src/assets/images', express.static(path.join(ROOT_DIR, 'src', 'assets', 'images')));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Upload endpoint (supports images and videos via multipart/form-data)
  app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '未選擇任何檔案' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const kind = req.file.mimetype.startsWith('video/') || VIDEO_EXTS.has(ext) ? 'video' : 'image';
    let finalFilename = req.file.filename;
    let finalSize = req.file.size;

    if (kind === 'video') {
      const fullPath = path.join(UPLOADS_DIR, req.file.filename);
      finalFilename = await normalizeUploadedVideo(fullPath, ext);
      try {
        finalSize = fs.statSync(path.join(UPLOADS_DIR, finalFilename)).size;
      } catch {
        // keep original size
      }
    }

    res.json({
      url: `/uploads/${finalFilename}`,
      type: kind,
      originalName: req.file.originalname,
      size: finalSize
    });
  });

  // Chunked binary upload endpoint for large videos (stays under proxy body limits)
  app.post(
    '/api/upload-chunk',
    express.raw({ type: 'application/octet-stream', limit: '8mb' }),
    async (req, res) => {
      try {
        const uploadId = String(req.query.uploadId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const chunkIndex = Number(req.query.chunkIndex);
        const totalChunks = Number(req.query.totalChunks);
        const originalName = String(req.query.filename || 'video.mp4');

        if (
          !uploadId ||
          !Number.isInteger(chunkIndex) ||
          !Number.isInteger(totalChunks) ||
          chunkIndex < 0 ||
          totalChunks < 1 ||
          chunkIndex >= totalChunks ||
          !Buffer.isBuffer(req.body) ||
          req.body.length === 0
        ) {
          res.status(400).json({ error: '分段上傳參數無效' });
          return;
        }

        const sessionDir = path.join(CHUNKS_DIR, uploadId);
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(path.join(sessionDir, `${chunkIndex}.part`), req.body);

        if (chunkIndex < totalChunks - 1) {
          res.json({ ok: true, completed: false, chunkIndex });
          return;
        }

        const ext = path.extname(originalName).toLowerCase() || '.mp4';
        const isVideo = VIDEO_EXTS.has(ext);
        const baseFileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
        const assembledPath = path.join(UPLOADS_DIR, baseFileName);
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });

        const writeStream = fs.createWriteStream(assembledPath);
        for (let i = 0; i < totalChunks; i += 1) {
          const partPath = path.join(sessionDir, `${i}.part`);
          if (!fs.existsSync(partPath)) {
            writeStream.close();
            fs.rmSync(sessionDir, { recursive: true, force: true });
            res.status(400).json({ error: `缺少影片分段 ${i + 1}，請重新上傳` });
            return;
          }
          const buf = fs.readFileSync(partPath);
          await new Promise<void>((resolve, reject) => {
            writeStream.write(buf, (err) => (err ? reject(err) : resolve()));
          });
        }
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', () => resolve());
          writeStream.on('error', reject);
          writeStream.end();
        });

        fs.rmSync(sessionDir, { recursive: true, force: true });

        let finalFilename = baseFileName;
        if (isVideo) {
          finalFilename = await normalizeUploadedVideo(assembledPath, ext);
        }
        const finalSize = fs.statSync(path.join(UPLOADS_DIR, finalFilename)).size;

        res.json({
          ok: true,
          completed: true,
          url: `/uploads/${finalFilename}`,
          type: isVideo ? 'video' : 'image',
          originalName,
          size: finalSize
        });
      } catch (err) {
        res.status(500).json({
          error: err instanceof Error ? `分段影片合併失敗：${err.message}` : '分段影片合併失敗'
        });
      }
    }
  );

  // Fallback JSON base64 upload endpoint (resilient if multipart is interrupted by proxy)
  app.post('/api/upload-base64', (req, res) => {
    try {
      const { filename, mimeType, dataBase64 } = req.body as {
        filename?: string;
        mimeType?: string;
        dataBase64?: string;
      };
      if (!dataBase64 || typeof dataBase64 !== 'string') {
        res.status(400).json({ error: '未收到圖片資料' });
        return;
      }

      const dataUrlMatch = dataBase64.match(/^data:([^;]+);base64,(.+)$/);
      const resolvedMime = (dataUrlMatch?.[1] || mimeType || 'image/jpeg').toLowerCase();
      const rawBase64 = dataUrlMatch?.[2] || dataBase64;
      const buffer = Buffer.from(rawBase64, 'base64');

      if (buffer.length === 0) {
        res.status(400).json({ error: '圖片資料為空' });
        return;
      }

      let ext = path.extname(filename || '').toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        if (resolvedMime.includes('png')) ext = '.png';
        else if (resolvedMime.includes('webp')) ext = '.webp';
        else if (resolvedMime.includes('gif')) ext = '.gif';
        else if (resolvedMime.includes('svg')) ext = '.svg';
        else ext = '.jpg';
      }

      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, uniqueName), buffer);

      res.json({
        url: `/uploads/${uniqueName}`,
        type: 'image',
        originalName: filename || uniqueName,
        size: buffer.length
      });
    } catch {
      res.status(400).json({ error: '圖片解碼儲存失敗，請改用其他圖檔格式重試' });
    }
  });

  // Products CRUD
  app.get('/api/products', (req, res) => {
    const store = loadStore();
    const publishedOnly = req.query.publishedOnly === 'true';
    const items = (
      publishedOnly ? store.products.filter((p) => p.published) : [...store.products]
    ).sort((a, b) => {
      const aPri = a.category === '旅館住宿' ? 0 : 1;
      const bPri = b.category === '旅館住宿' ? 0 : 1;
      return aPri - bPri;
    });
    res.json(items);
  });

  app.post('/api/products', (req, res) => {
    const body = req.body as Partial<Product>;
    if (!body.name || !body.name.trim()) {
      res.status(400).json({ error: '請填寫商品名稱' });
      return;
    }
    const store = loadStore();
    const now = new Date().toISOString();
    const newProduct: Product = {
      id: `prod-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name: body.name.trim(),
      subtitle: (body.subtitle || '').trim(),
      category: body.category || '器皿生活',
      price: Math.max(0, Number(body.price) || 0),
      stock: Math.max(0, Number(body.stock) || 0),
      published: body.published !== undefined ? Boolean(body.published) : true,
      featured: Boolean(body.featured),
      images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
      videoUrl: (body.videoUrl || '').trim(),
      description: (body.description || '').trim(),
      highlights: Array.isArray(body.highlights) ? body.highlights.filter(Boolean) : [],
      variants:
        Array.isArray(body.variants) && body.variants.filter(Boolean).length > 0
          ? body.variants.filter(Boolean)
          : ['標準款式'],
      specs: Array.isArray(body.specs)
        ? body.specs.filter((s) => s.label && s.value)
        : [],
      createdAt: now,
      updatedAt: now
    };
    store.products.unshift(newProduct);
    saveStore(store);
    res.status(201).json(newProduct);
  });

  app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const body = req.body as Partial<Product>;
    const store = loadStore();
    const index = store.products.findIndex((p) => p.id === id);
    if (index === -1) {
      res.status(404).json({ error: '找不到此商品' });
      return;
    }
    const existing = store.products[index];
    const updated: Product = {
      ...existing,
      name: body.name !== undefined ? body.name.trim() : existing.name,
      subtitle: body.subtitle !== undefined ? body.subtitle.trim() : existing.subtitle,
      category: body.category ?? existing.category,
      price: body.price !== undefined ? Math.max(0, Number(body.price) || 0) : existing.price,
      stock: body.stock !== undefined ? Math.max(0, Number(body.stock) || 0) : existing.stock,
      published: body.published !== undefined ? Boolean(body.published) : existing.published,
      featured: body.featured !== undefined ? Boolean(body.featured) : existing.featured,
      images: Array.isArray(body.images) ? body.images.filter(Boolean) : existing.images,
      videoUrl: body.videoUrl !== undefined ? body.videoUrl.trim() : existing.videoUrl,
      description: body.description !== undefined ? body.description.trim() : existing.description,
      highlights: Array.isArray(body.highlights)
        ? body.highlights.filter(Boolean)
        : existing.highlights,
      variants:
        Array.isArray(body.variants) && body.variants.filter(Boolean).length > 0
          ? body.variants.filter(Boolean)
          : existing.variants,
      specs: Array.isArray(body.specs)
        ? body.specs.filter((s) => s.label && s.value)
        : existing.specs,
      updatedAt: new Date().toISOString()
    };
    store.products[index] = updated;
    saveStore(store);
    res.json(updated);
  });

  app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const store = loadStore();
    const nextProducts = store.products.filter((p) => p.id !== id);
    if (nextProducts.length === store.products.length) {
      res.status(404).json({ error: '找不到此商品' });
      return;
    }
    store.products = nextProducts;
    saveStore(store);
    res.json({ ok: true });
  });

  // Orders endpoints
  app.get('/api/orders', (_req, res) => {
    const store = loadStore();
    const normalized = store.orders.map((o) => ({
      ...o,
      status: ((o.status as string) === '待出貨' ? '待處理' : o.status) as Order['status']
    }));
    res.json(normalized);
  });

  app.post('/api/orders', (req, res) => {
    const body = req.body as Partial<Order>;
    if (!body.customerName || !body.phone || !body.address || !Array.isArray(body.items) || body.items.length === 0) {
      res.status(400).json({ error: '請完整填寫收件人資訊與商品項目' });
      return;
    }
    const store = loadStore();
    const subtotal = body.items.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity),
      0
    );
    const shippingFee = subtotal >= 2000 ? 0 : 120;
    const newOrder: Order = {
      id: `ZW-${Date.now().toString().slice(-6)}`,
      customerName: body.customerName.trim(),
      phone: body.phone.trim(),
      shippingMethod: body.shippingMethod || '宅配到府',
      paymentMethod: body.paymentMethod || '貨到付款',
      address: body.address.trim(),
      note: (body.note || '').trim(),
      items: body.items,
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      status: '待處理',
      createdAt: new Date().toISOString(),
      ...(typeof body.memberUid === 'string' && body.memberUid ? { memberUid: body.memberUid } : {})
    };
    store.orders.unshift(newOrder);
    saveStore(store);
    res.status(201).json(newOrder);
  });

  app.patch('/api/orders/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body as { status?: Order['status'] };
    const store = loadStore();
    const index = store.orders.findIndex((o) => o.id === id);
    if (index === -1) {
      res.status(404).json({ error: '找不到此訂單' });
      return;
    }
    if (status) {
      store.orders[index].status = status;
      saveStore(store);
    }
    res.json(store.orders[index]);
  });

  // Global upload error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(400).json({ error: err.message || '系統處理錯誤' });
    }
  );

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
