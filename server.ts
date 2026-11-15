import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import type { Order, Product } from './src/types.ts';

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

const SEED_PRODUCTS: Product[] = [
  {
    id: 'prod-ceramic-lamp',
    name: '月岩霧面無線陶瓷桌燈',
    subtitle: '鶯歌高溫窯燒素坯 × 三段式暖光觸控調光',
    category: '居家燈飾',
    price: 3680,
    stock: 18,
    published: true,
    featured: true,
    images: [
      '/src/assets/images/product_ceramic_lamp_1794751852253.jpg',
      '/src/assets/images/hero_living_object_1794751851954.jpg'
    ],
    videoUrl: '/media/lamp-showcase.mp4',
    description:
      '結合台灣鶯歌在地陶藝工坊與現代極簡光學結構，燈身採用未上釉霧面石器陶土手工塑型，保留礦物顆粒的溫潤觸感。\n\n內建高演色性 2700K 柔光 LED 光源與 Type-C 快充鋰電池，滿電可連續照明達 36 小時。無論置於床頭、書桌或餐桌一隅，皆能以無眩光漫射光線柔化夜晚空間輪廓。',
    highlights: [
      '三段式觸控調光（20% / 55% / 100%）記憶最後亮度',
      '高演色性 Ra≥95 護眼暖黃光，無頻閃藍光危害',
      '無線可攜設計，單次充電續航最長 36 小時',
      '霧面礦物陶瓷底座，防滑矽膠墊保護桌面'
    ],
    variants: ['月岩白（標準款）', '暖沙灰（限定色）'],
    specs: [
      { label: '材質', value: '天然石器陶瓷、磨砂壓克力漫射罩' },
      { label: '尺寸', value: '直徑 18.5 cm × 高 26 cm' },
      { label: '重量', value: '1.15 kg' },
      { label: '電池規格', value: '5000mAh / USB-C 充電（附編織線）' },
      { label: '產地與保固', value: '台灣設計製造 · 原廠一年保固' }
    ],
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-11-01T10:30:00.000Z'
  },
  {
    id: 'prod-wireless-speaker',
    name: '原聲鋁合金編織藍牙音響',
    subtitle: 'CNC 航太鋁頂蓋 × 360° 全向聲場美學',
    category: '聲學配件',
    price: 6490,
    stock: 9,
    published: true,
    featured: true,
    images: [
      '/src/assets/images/product_wireless_speaker_1794751853239.jpg',
      '/src/assets/images/hero_living_object_1794751851954.jpg'
    ],
    videoUrl: '/media/speaker-showcase.mp4',
    description:
      '為當代居家空間打造的桌上型無線聲學雕塑。上蓋採用整塊實心鋁合金經 CNC 精密切削與陽極髮絲紋處理，帶來如精密音響旋鈕般的阻尼手感。\n\n機身包覆透聲性極佳的炭灰羊毛混紡織布，內部搭載 3.5 吋長衝程低音單體與雙高音導波器，呈現自然耐聽、細節豐富的中高頻人聲與飽滿低頻下潛。',
    highlights: [
      '支援藍牙 5.3 與 AirPlay 2 / AUX 有線雙模輸入',
      '雙機串聯立體聲配對（TWS Stereo Pairing）',
      '獨立鋁合金阻尼音量旋鈕與一鍵靜音設計',
      '台灣氣候防潮塗層處理，適應高濕度室內環境'
    ],
    variants: ['極簡銀 × 炭灰織布', '霧墨黑 × 深岩灰'],
    specs: [
      { label: '材質', value: '陽極氧化鋁合金、丹麥聲學羊毛織布' },
      { label: '尺寸', value: '直徑 13.8 cm × 高 21.4 cm' },
      { label: '輸出功率', value: '45W RMS（D 類數位擴大晶片）' },
      { label: '連線介面', value: 'Bluetooth 5.3 / Wi-Fi / 3.5mm AUX' },
      { label: '產地與保固', value: '台灣研發 · 原廠兩年保固' }
    ],
    createdAt: '2026-10-24T11:00:00.000Z',
    updatedAt: '2026-11-03T14:20:00.000Z'
  },
  {
    id: 'prod-glass-carafe',
    name: '煙嵐手工吹製手沖玻璃壺',
    subtitle: '耐高溫硼矽酸玻璃 × 北美黑胡桃木隔熱領圈',
    category: '器皿生活',
    price: 1850,
    stock: 24,
    published: true,
    featured: true,
    images: [
      '/src/assets/images/product_glass_carafe_1794751853126.jpg'
    ],
    videoUrl: '',
    description:
      '由資深玻璃職人逐一人工吹製而成的煙灰色高硼矽玻璃手沖分享壺，耐溫差可達 150°C，可直接承接滾沸熱水沖煮。\n\n壺頸搭配可拆式北美黑胡桃實木隔熱套環與黃銅鉚釘皮革繫繩，既有效隔絕手部燙傷風險，亦在清洗時可輕鬆取下保養。V 型鷹嘴壺口設計讓斷水俐落不滴漏。',
    highlights: [
      '3.3 高硼矽耐熱玻璃，可直火外外加熱與洗碗機清洗（需拆木環）',
      '600ml 黃金容量，適合 1 至 4 人份手沖咖啡或冷泡茶',
      '胡桃木防燙領圈搭配黃銅五金件，歷久彌新'
    ],
    variants: ['600ml（黑胡桃木環）', '400ml 獨享版'],
    specs: [
      { label: '材質', value: '煙灰高硼矽玻璃、北美黑胡桃木、黃銅' },
      { label: '容量', value: '600 ml（刻度標示至 500 ml）' },
      { label: '尺寸', value: '壺底直徑 11.5 cm × 高 16.5 cm' },
      { label: '耐熱範圍', value: '-20°C 至 150°C' }
    ],
    createdAt: '2026-10-28T08:15:00.000Z',
    updatedAt: '2026-11-05T16:45:00.000Z'
  },
  {
    id: 'prod-botanical-mist',
    name: '雪松尤加利森林複方空間組',
    subtitle: '台灣冷杉 × 雪松精油空間噴霧與修護精華油',
    category: '香氛保養',
    price: 2280,
    stock: 15,
    published: true,
    featured: false,
    images: [
      '/src/assets/images/product_botanical_mist_1794751853704.jpg'
    ],
    videoUrl: '',
    description:
      '萃取自高海拔針葉林與天然植物冷壓精華，將雨後森林的清冽氣息帶入日常起居。\n\n組合內含 120ml 深橄欖色避光玻璃空間噴霧（大西洋雪松、藍膠尤加利、台灣肖楠木）與 30ml 植物角鯊烷指緣護膚精華油，不含人工定香劑、鄰苯二甲酸酯與合成色素，讓空間與肌膚同步回歸純淨平衡。',
    highlights: [
      '100% 天然複方精油調香，無合成香精與化學定香劑',
      '深色避光玻璃瓶器，完整封存植物活性成分',
      '空間噴霧可用於織品、枕巾與玄關空氣淨化'
    ],
    variants: ['雙瓶禮盒組（120ml+30ml）', '單購空間噴霧 120ml'],
    specs: [
      { label: '主調香材', value: '大西洋雪松、尤加利、台灣肖楠、佛手柑' },
      { label: '容量', value: '空間噴霧 120 ml + 精華油 30 ml' },
      { label: '保存期限', value: '未開封 24 個月（開封後建議 6 個月內使用）' },
      { label: '產地', value: '台灣 GMP 認證植萃實驗室' }
    ],
    createdAt: '2026-11-02T12:00:00.000Z',
    updatedAt: '2026-11-08T09:10:00.000Z'
  },
  {
    id: 'prod-hotel-mountain-suite',
    name: '雲嵐山居檜木溫泉雙人套房',
    subtitle: '烏來山景私人檜木湯池 × 含晨間手作朝食與茶席體驗',
    category: '旅館住宿',
    price: 8800,
    stock: 8,
    published: true,
    featured: true,
    images: [
      '/src/assets/images/product_hotel_mountain_suite_1794753357149.jpg'
    ],
    videoUrl: '/media/hotel-mountain-showcase.mp4',
    description:
      '隱身於新北烏來翠綠山嵐間的靜謐建築宿旅，全室以台灣檜木與天然灰泥牆面構築，推開落地窗即可將層巒雲霧盡收眼底。\n\n房內配置獨立雙人檜木溫泉湯池，引流天然碳酸氫鈉美人湯泉；床組選用台灣織造有機亞麻寢具與獨立筒舒眠床墊。入住即享隔日主廚季節朝食兩客與午後高山烏龍茶席體驗。',
    highlights: [
      '獨立景觀台灣檜木溫泉池，24 小時引流天然碳酸氫鈉泉',
      '18 坪挑高木質空間搭配全景山嵐落地窗與露台茶几',
      '房內備有質物選研同款陶瓷桌燈、藍牙音響與森林複方香氛',
      '含雙人季節朝食，購買後立即寄發電子住宿預約憑證'
    ],
    variants: ['平日一泊二食住宿券', '假日通用一泊一食住宿券'],
    specs: [
      { label: '旅宿地點', value: '新北市烏來區環山路（附免費專屬車位）' },
      { label: '房型坪數', value: '18 坪（含景觀陽台與獨立湯屋）' },
      { label: '床型配置', value: '加大雙人床 Queen Size × 1' },
      { label: '入住／退房', value: '15:00 入住 ／ 隔日 12:00 延遲退房' },
      { label: '憑證效期', value: '購買日起一年內可預約使用，未預約可全額退費' }
    ],
    createdAt: '2026-11-10T08:00:00.000Z',
    updatedAt: '2026-11-15T06:00:00.000Z'
  },
  {
    id: 'prod-hotel-ocean-villa',
    name: '東岸海霧石砌海景 Villa 宿旅',
    subtitle: '花蓮七星潭面海陽台 × 專屬海潮聲景與手沖咖啡吧',
    category: '旅館住宿',
    price: 9600,
    stock: 6,
    published: true,
    featured: true,
    images: [
      '/src/assets/images/product_hotel_ocean_villa_1794753357607.jpg'
    ],
    videoUrl: '',
    description:
      '座落於花蓮海岸線第一排的極簡旅宿空間，以大片天然洞石地磚、實木低矮臥榻與透光亞麻紗簾，框出太平洋隨晨昏變幻的湛藍海色。\n\n房內專屬手沖咖啡吧提供台灣阿里山與衣索比亞單品濾掛及手沖玻璃壺組，讓旅人清晨於面海陽台伴隨浪濤聲醒來，享受不被打擾的慢節奏東岸假期。',
    highlights: [
      '180 度無遮蔽太平洋海景陽台與專屬戶外休閒籐椅',
      '全室洞石恒溫地坪搭配有機亞麻床組與實木閱讀桌',
      '免費提供單車漫遊租借與花蓮車站專車接駁預約',
      '含雙人海景早午餐與房內手沖咖啡吧無限享用'
    ],
    variants: ['雙人海景房平日券', '雙人海景房連住兩晚專案'],
    specs: [
      { label: '旅宿地點', value: '花蓮縣新城鄉七星潭海岸旁' },
      { label: '房型坪數', value: '20 坪（含獨立面海露台）' },
      { label: '床型配置', value: '特大雙人床 King Size × 1' },
      { label: '入住／退房', value: '15:30 入住 ／ 隔日 11:30 退房' },
      { label: '憑證效期', value: '購買日起一年內彈性預約，附電子發票' }
    ],
    createdAt: '2026-11-12T08:00:00.000Z',
    updatedAt: '2026-11-15T06:05:00.000Z'
  }
];

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
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '';
    const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.heic']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogg', '.ogv']);

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
  app.use(express.json({ limit: '10mb' }));

  // Serve uploaded files and static assets cleanly in both dev and production
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/media', express.static(path.join(ROOT_DIR, 'public', 'media')));
  app.use('/src/assets/images', express.static(path.join(ROOT_DIR, 'src', 'assets', 'images')));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Upload endpoint (supports images and videos)
  app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '未選擇任何檔案' });
      return;
    }
    const ext = path.extname(req.file.originalname).toLowerCase();
    const kind = req.file.mimetype.startsWith('video/') || VIDEO_EXTS.has(ext) ? 'video' : 'image';
    res.json({
      url: `/uploads/${req.file.filename}`,
      type: kind,
      originalName: req.file.originalname,
      size: req.file.size
    });
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
    res.json(store.orders);
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
      status: '待出貨',
      createdAt: new Date().toISOString()
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
