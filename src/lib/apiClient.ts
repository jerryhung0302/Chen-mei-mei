import { SEED_PRODUCTS } from '../data/seedProducts';
import type { Order, OrderStatus, Product } from '../types';

const LOCAL_PRODUCTS_KEY = 'zhiwu_local_products_v1';
const LOCAL_ORDERS_KEY = 'zhiwu_local_orders_v1';

export class BackendUnavailableError extends Error {
  status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = 'BackendUnavailableError';
    this.status = status;
  }
}

export function sortHotelFirst(items: Product[]): Product[] {
  return [...items].sort((a, b) => {
    const aPri = a.category === '旅館住宿' ? 0 : 1;
    const bPri = b.category === '旅館住宿' ? 0 : 1;
    return aPri - bPri;
  });
}

export async function parseApiJson<T>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  const looksLikeHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html');

  if (res.status === 404 || res.status === 405 || looksLikeHtml) {
    throw new BackendUnavailableError(
      `${fallbackError}（後端服務目前未啟用，HTTP ${res.status}）`,
      res.status
    );
  }

  let parsed: unknown = null;
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      if (!res.ok) {
        throw new Error(`${fallbackError}（HTTP ${res.status}）`);
      }
      throw new Error(`${fallbackError}（伺服器回傳格式異常）`);
    }
  }

  if (!res.ok) {
    const errMsg =
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `${fallbackError}（HTTP ${res.status}）`;
    throw new Error(errMsg);
  }

  if (parsed === null) {
    throw new Error(`${fallbackError}（伺服器未回傳資料，HTTP ${res.status}）`);
  }

  return parsed as T;
}

export function getLocalProducts(): Product[] {
  try {
    const raw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Product[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return sortHotelFirst(parsed);
      }
    }
  } catch {
    // ignore storage errors
  }
  return sortHotelFirst(SEED_PRODUCTS);
}

export function setLocalProducts(products: Product[]): void {
  try {
    localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(sortHotelFirst(products)));
  } catch {
    // ignore storage quota errors
  }
}

export function getLocalOrders(): Order[] {
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Order[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

export function setLocalOrders(orders: Order[]): void {
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));
  } catch {
    // ignore storage quota errors
  }
}

export function updateLocalOrderStatus(orderId: string, status: OrderStatus): Order[] {
  const orders = getLocalOrders().map((o) => (o.id === orderId ? { ...o, status } : o));
  setLocalOrders(orders);
  return orders;
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('無法讀取圖片檔案'));
    reader.readAsDataURL(file);
  });
}

export async function optimizeImageFile(
  file: File,
  options: { maxDim?: number; maxBytes?: number; quality?: number } = {}
): Promise<File> {
  const maxDim = options.maxDim ?? 1920;
  const maxBytes = options.maxBytes ?? 1.2 * 1024 * 1024;
  const quality = options.quality ?? 0.88;

  const compressible = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!compressible.includes(file.type.toLowerCase()) || file.size <= maxBytes) {
    return file;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image decode failed'));
        el.src = objectUrl;
      });

      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const outputMime =
        file.type === 'image/png' && maxDim > 1200 ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outputMime, outputMime === 'image/jpeg' ? quality : undefined)
      );
      if (!blob || (file.size <= maxBytes && blob.size >= file.size)) {
        return file;
      }

      const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload';
      const ext = outputMime === 'image/png' ? '.png' : '.jpg';
      return new File([blob], `${baseName}${ext}`, { type: outputMime });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return file;
  }
}
