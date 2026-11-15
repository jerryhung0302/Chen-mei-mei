import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit3,
  Eye,
  Film,
  ImagePlus,
  Link2,
  Maximize2,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
  Video,
  X
} from 'lucide-react';
import type { Order, OrderStatus, Product, ProductCategory, ProductSpec } from '../types';
import { MediaImage } from './MediaImage';
import { VideoPlayer } from './VideoPlayer';

interface AdminDashboardProps {
  products: Product[];
  orders: Order[];
  onRefresh: () => Promise<void>;
  onPreviewProduct: (product: Product) => void;
}

type AdminTab = 'list' | 'editor' | 'orders';

const CATEGORIES: Exclude<ProductCategory, '全部'>[] = [
  '旅館住宿',
  '居家燈飾',
  '器皿生活',
  '香氛保養',
  '聲學配件'
];

interface ProductFormState {
  id?: string;
  name: string;
  subtitle: string;
  category: Exclude<ProductCategory, '全部'>;
  price: string;
  stock: string;
  published: boolean;
  featured: boolean;
  images: string[];
  videoUrl: string;
  description: string;
  highlights: string[];
  variantsText: string;
  specs: ProductSpec[];
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  subtitle: '',
  category: '旅館住宿',
  price: '1280',
  stock: '20',
  published: true,
  featured: false,
  images: [],
  videoUrl: '',
  description: '',
  highlights: [''],
  variantsText: '標準款式',
  specs: [
    { label: '材質', value: '' },
    { label: '尺寸', value: '' }
  ]
};

function productToForm(p: Product): ProductFormState {
  return {
    id: p.id,
    name: p.name,
    subtitle: p.subtitle,
    category: p.category,
    price: String(p.price),
    stock: String(p.stock),
    published: p.published,
    featured: p.featured,
    images: [...p.images],
    videoUrl: p.videoUrl,
    description: p.description,
    highlights: p.highlights.length > 0 ? [...p.highlights] : [''],
    variantsText: p.variants.join(', '),
    specs: p.specs.length > 0 ? p.specs.map((s) => ({ ...s })) : [{ label: '材質', value: '' }]
  };
}

interface UploadResult {
  url: string;
  type: 'image' | 'video';
  originalName?: string;
  size?: number;
}

async function parseJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!res.ok) {
        throw new Error(`${fallbackError}（HTTP ${res.status}）`);
      }
      throw new Error(`${fallbackError}（伺服器回傳格式異常）`);
    }
  }

  if (!res.ok) {
    const errMsg =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error?: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `${fallbackError}（HTTP ${res.status}）`;
    throw new Error(errMsg);
  }

  if (!parsed) {
    throw new Error(`${fallbackError}（伺服器回傳空白回應，HTTP ${res.status}）`);
  }

  return parsed as T;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('無法讀取圖片檔案'));
    reader.readAsDataURL(file);
  });
}

async function optimizeImageFile(file: File): Promise<File> {
  const compressible = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!compressible.includes(file.type.toLowerCase()) || file.size <= 1.2 * 1024 * 1024) {
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

      const maxDim = 1920;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outputMime, outputMime === 'image/jpeg' ? 0.88 : undefined)
      );
      if (!blob || blob.size >= file.size) {
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

export function AdminDashboard({
  products,
  orders,
  onRefresh,
  onPreviewProduct
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);

  const [imageUrlInput, setImageUrlInput] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number | null>(null);
  const [localVideoPreviewUrl, setLocalVideoPreviewUrl] = useState<string>('');
  const [imageMeta, setImageMeta] = useState<
    Record<string, { status: 'loading' | 'verified' | 'error'; name?: string; size?: number }>
  >({});
  const [videoMeta, setVideoMeta] = useState<{
    status: 'idle' | 'uploading' | 'loading' | 'verified' | 'error';
    name?: string;
    size?: number;
    duration?: number;
  }>({ status: 'idle' });
  const [dragImageOver, setDragImageOver] = useState(false);
  const [dragVideoOver, setDragVideoOver] = useState(false);
  const [previewGalleryIndex, setPreviewGalleryIndex] = useState<'video' | number>(0);
  const [lightboxMedia, setLightboxMedia] = useState<
    | { kind: 'image'; url: string; title: string }
    | { kind: 'video'; url: string; poster?: string; title: string }
    | { kind: 'product'; product: Product }
    | null
  >(null);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [imageSectionError, setImageSectionError] = useState('');
  const [videoSectionError, setVideoSectionError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageUrlInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoUrlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (localVideoPreviewUrl) URL.revokeObjectURL(localVideoPreviewUrl);
    };
  }, [localVideoPreviewUrl]);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || !Number.isFinite(seconds)) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const openNewEditor = () => {
    setForm(EMPTY_FORM);
    setImageUrlInput('');
    setVideoUrlInput('');
    setImageSectionError('');
    setVideoSectionError('');
    setImageMeta({});
    setVideoMeta({ status: 'idle' });
    setPreviewGalleryIndex(0);
    setActiveTab('editor');
  };

  const openEditEditor = (product: Product) => {
    setForm(productToForm(product));
    setImageUrlInput('');
    setVideoUrlInput(product.videoUrl);
    setImageSectionError('');
    setVideoSectionError('');
    const nextImgMeta: Record<string, { status: 'loading' | 'verified' | 'error' }> = {};
    product.images.forEach((url) => {
      nextImgMeta[url] = { status: 'loading' };
    });
    setImageMeta(nextImgMeta);
    setVideoMeta(product.videoUrl ? { status: 'loading' } : { status: 'idle' });
    setPreviewGalleryIndex(product.images.length > 0 ? 0 : product.videoUrl ? 'video' : 0);
    setActiveTab('editor');
  };

  // Upload a single image reliably via multipart first, then automatic JSON base64 fallback
  const uploadSingleImage = async (rawFile: File): Promise<UploadResult> => {
    const file = await optimizeImageFile(rawFile);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
        credentials: 'same-origin'
      });
      return await parseJsonResponse<UploadResult>(res, '圖片上傳失敗');
    } catch (multipartErr) {
      // Fallback to base64 JSON upload if multipart body was dropped or returned empty response
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) {
        throw multipartErr;
      }
      const fallbackRes = await fetch('/api/upload-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          dataBase64: dataUrl
        })
      });
      return await parseJsonResponse<UploadResult>(fallbackRes, '圖片上傳失敗');
    }
  };

  // Upload images and verify immediate preview load
  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    setUploadingImage(true);
    setImageSectionError('');
    try {
      const uploadedUrls: string[] = [];
      const nextMeta: Record<
        string,
        { status: 'loading' | 'verified' | 'error'; name?: string; size?: number }
      > = {};

      for (const file of selectedFiles) {
        const data = await uploadSingleImage(file);
        uploadedUrls.push(data.url);
        nextMeta[data.url] = {
          status: 'loading',
          name: data.originalName || file.name,
          size: data.size || file.size
        };
      }

      setImageMeta((prev) => ({ ...prev, ...nextMeta }));
      const firstNewIndex = form.images.length;
      setForm((prev) => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
      setPreviewGalleryIndex(firstNewIndex);
      showToast('success', `已上傳 ${uploadedUrls.length} 張商品圖片，可於下方與右側即時預覽`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '圖片上傳失敗，請檢查圖片格式或稍後再試';
      setImageSectionError(message);
      showToast('error', message);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Upload video with real XHR progress bar + immediate local & server preview
  const handleVideoFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (localVideoPreviewUrl) {
      URL.revokeObjectURL(localVideoPreviewUrl);
    }
    const blobUrl = URL.createObjectURL(file);
    setLocalVideoPreviewUrl(blobUrl);
    setVideoSectionError('');
    setVideoUploadProgress(0);
    setVideoMeta({ status: 'uploading', name: file.name, size: file.size });
    setPreviewGalleryIndex('video');

    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.open('POST', '/api/upload', true);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setVideoUploadProgress(percent);
      }
    };
    xhr.onload = () => {
      setVideoUploadProgress(null);
      if (videoInputRef.current) videoInputRef.current.value = '';
      try {
        const raw = xhr.responseText?.trim();
        const data = raw ? JSON.parse(raw) : null;
        if (xhr.status >= 200 && xhr.status < 300 && data?.url) {
          URL.revokeObjectURL(blobUrl);
          setLocalVideoPreviewUrl('');
          setForm((prev) => ({ ...prev, videoUrl: data.url }));
          setVideoUrlInput(data.url);
          setVideoMeta({
            status: 'loading',
            name: data.originalName || file.name,
            size: data.size || file.size
          });
          setPreviewGalleryIndex('video');
          showToast('success', '商品影片已上傳至伺服器，請確認下方預覽播放');
        } else {
          const msg = data?.error || `影片上傳失敗（HTTP ${xhr.status}）`;
          setVideoMeta({ status: 'error', name: file.name, size: file.size });
          setVideoSectionError(msg);
          showToast('error', msg);
        }
      } catch {
        const msg = `影片上傳失敗（伺服器回應格式異常，HTTP ${xhr.status}）`;
        setVideoMeta({ status: 'error', name: file.name, size: file.size });
        setVideoSectionError(msg);
        showToast('error', msg);
      }
    };
    xhr.onerror = () => {
      setVideoUploadProgress(null);
      const msg = '網路連線異常，影片上傳失敗';
      setVideoMeta({ status: 'error', name: file.name, size: file.size });
      setVideoSectionError(msg);
      showToast('error', msg);
    };
    xhr.send(fd);
  };

  const handleAddImageUrl = () => {
    const trimmed = imageUrlInput.trim();
    if (!trimmed) {
      const msg = '請先貼上圖片網址，或點擊上方「點擊或拖曳商品圖片至此上傳」從裝置選取圖片';
      setImageSectionError(msg);
      showToast('error', msg);
      imageUrlInputRef.current?.focus();
      return;
    }

    const isValid =
      /^https?:\/\/.+/i.test(trimmed) ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('data:image/') ||
      trimmed.startsWith('blob:');
    if (!isValid) {
      const msg = '圖片網址請以 https://、http:// 或 / 開頭';
      setImageSectionError(msg);
      showToast('error', msg);
      imageUrlInputRef.current?.focus();
      return;
    }

    setImageSectionError('');
    setImageMeta((prev) => ({ ...prev, [trimmed]: { status: 'loading' } }));
    const nextIdx = form.images.length;
    setForm((prev) => ({ ...prev, images: [...prev.images, trimmed] }));
    setPreviewGalleryIndex(nextIdx);
    setImageUrlInput('');
    showToast('success', '已加入圖片網址，可於下方縮圖確認預覽');
  };

  const handleApplyVideoUrl = () => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) {
      const msg = '請先輸入影片網址（MP4 / YouTube 連結），或點擊上方上傳影片檔';
      setVideoSectionError(msg);
      showToast('error', msg);
      videoUrlInputRef.current?.focus();
      return;
    }
    setVideoSectionError('');
    setForm((prev) => ({ ...prev, videoUrl: trimmed }));
    setVideoMeta({ status: 'loading' });
    setPreviewGalleryIndex('video');
    showToast('success', '已套用商品影片連結');
  };

  const setAsCoverImage = (idx: number) => {
    setForm((prev) => {
      const copy = [...prev.images];
      const [picked] = copy.splice(idx, 1);
      return { ...prev, images: [picked, ...copy] };
    });
  };

  const removeImage = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx)
    }));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('error', '請輸入商品名稱');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        subtitle: form.subtitle.trim(),
        category: form.category,
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
        published: form.published,
        featured: form.featured,
        images: form.images,
        videoUrl: form.videoUrl.trim(),
        description: form.description.trim(),
        highlights: form.highlights.map((h) => h.trim()).filter(Boolean),
        variants: form.variantsText
          .split(/[,，]/)
          .map((v) => v.trim())
          .filter(Boolean),
        specs: form.specs.filter((s) => s.label.trim() && s.value.trim())
      };

      const url = form.id ? `/api/products/${form.id}` : '/api/products';
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
      await parseJsonResponse<Product>(res, '儲存商品失敗');

      await onRefresh();
      showToast('success', form.id ? '商品資料已更新並同步至前台' : '新商品已成功發佈');
      setActiveTab('list');
      setForm(EMPTY_FORM);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '儲存商品時發生錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublished = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !product.published })
      });
      if (!res.ok) throw new Error('狀態切換失敗');
      await onRefresh();
      showToast('success', product.published ? '已將商品下架為草稿' : '已將商品上架至前台');
    } catch {
      showToast('error', '切換商品狀態失敗');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      setConfirmDeleteId(null);
      await onRefresh();
      showToast('success', '商品已刪除');
    } catch {
      showToast('error', '刪除商品失敗');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('訂單狀態更新失敗');
      await onRefresh();
      showToast('success', `訂單 #${orderId} 狀態已更新為「${status}」`);
    } catch {
      showToast('error', '更新訂單狀態失敗');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesQuery =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.includes(searchQuery);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'published' && p.published) ||
      (statusFilter === 'draft' && !p.published);
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-16 space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">後台商品上稿與管理</h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            管理商品名稱、多圖上傳、商品影片上稿與訂單出貨狀態，變更將即時同步至前台商店。
          </p>
        </div>

        <button
          type="button"
          onClick={openNewEditor}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 shrink-0 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>新增商品上稿</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-xl border text-sm font-medium flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 text-current opacity-60 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`flex-1 sm:flex-none min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'list'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          商品列表 ({products.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          className={`flex-1 sm:flex-none min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'editor'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          {form.id ? '編輯商品上稿' : '新增商品上稿'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`flex-1 sm:flex-none min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          訂單管理 ({orders.length})
        </button>
      </div>

      {/* TAB 1: PRODUCT LIST */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋商品名稱或分類..."
                className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl self-start sm:self-auto">
              {(
                [
                  { id: 'all', label: '全部' },
                  { id: 'published', label: '已上架' },
                  { id: 'draft', label: '草稿' }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusFilter(opt.id)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    statusFilter === opt.id
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-zinc-200">
              <Package className="w-10 h-10 text-zinc-300 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm font-medium text-zinc-800">沒有符合條件的商品</p>
              <button
                type="button"
                onClick={openNewEditor}
                className="mt-3 text-xs font-medium text-emerald-900 underline underline-offset-4"
              >
                立即新增一筆商品上稿
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Card List (< md) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white rounded-xl border border-zinc-200 p-3.5 space-y-3"
                  >
                    <div className="flex gap-3">
                      <div className="w-20 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0">
                        <MediaImage
                          src={product.images[0]}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{product.category}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              product.published
                                ? 'text-emerald-900 font-medium'
                                : 'text-zinc-500'
                            }
                          >
                            {product.published ? '上架中' : '草稿'}
                          </span>
                          {product.videoUrl && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-zinc-700 font-medium">含影片</span>
                            </>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-zinc-900 truncate mt-0.5">
                          {product.name}
                        </h3>
                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600 tabular-nums">
                          <span className="font-semibold text-zinc-900">
                            NT$ {product.price.toLocaleString('zh-TW')}
                          </span>
                          <span>庫存 {product.stock}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => openEditEditor(product)}
                        className="flex-1 min-h-[40px] rounded-lg border border-zinc-300 text-xs font-medium text-zinc-800 flex items-center justify-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>編輯</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePublished(product)}
                        className="flex-1 min-h-[40px] rounded-lg border border-zinc-300 text-xs font-medium text-zinc-800"
                      >
                        {product.published ? '下架' : '上架'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLightboxMedia({ kind: 'product', product })}
                        aria-label="後台媒體預覽"
                        className="min-h-[40px] px-2.5 rounded-lg border border-zinc-300 text-xs font-medium text-zinc-700 flex items-center gap-1"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>媒體</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPreviewProduct(product)}
                        aria-label="前台檢視"
                        className="min-h-[40px] min-w-[40px] rounded-lg border border-zinc-300 flex items-center justify-center text-zinc-700"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {confirmDeleteId === product.id ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id)}
                          className="min-h-[40px] px-3 rounded-lg bg-red-600 text-white text-xs font-medium"
                        >
                          確認刪除
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(product.id)}
                          aria-label="刪除商品"
                          className="min-h-[40px] min-w-[40px] rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= md) */}
              <div className="hidden md:block bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                      <th className="py-3.5 px-4">商品名稱與媒體</th>
                      <th className="py-3.5 px-4">分類</th>
                      <th className="py-3.5 px-4">售價</th>
                      <th className="py-3.5 px-4">庫存</th>
                      <th className="py-3.5 px-4">狀態</th>
                      <th className="py-3.5 px-4 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-zinc-50/70 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3.5">
                            <div className="w-16 h-12 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/70">
                              <MediaImage
                                src={product.images[0]}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-zinc-900 truncate max-w-xs">
                                {product.name}
                              </p>
                              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                                <span>{product.images.length} 張圖片</span>
                                <span aria-hidden="true">·</span>
                                <span>{product.videoUrl ? '已附介紹影片' : '無影片'}</span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-zinc-600">{product.category}</td>
                        <td className="py-3.5 px-4 font-semibold text-zinc-900 tabular-nums">
                          NT$ {product.price.toLocaleString('zh-TW')}
                        </td>
                        <td className="py-3.5 px-4 tabular-nums text-zinc-700">{product.stock}</td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => handleTogglePublished(product)}
                            className={`text-xs font-medium underline-offset-4 hover:underline ${
                              product.published ? 'text-emerald-900' : 'text-zinc-500'
                            }`}
                          >
                            {product.published ? '上架中' : '草稿（未公開）'}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setLightboxMedia({ kind: 'product', product })}
                              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-400 text-xs font-medium text-zinc-700"
                            >
                              媒體預覽
                            </button>
                            <button
                              type="button"
                              onClick={() => onPreviewProduct(product)}
                              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-400 text-xs font-medium text-zinc-700"
                            >
                              前台檢視
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditEditor(product)}
                              className="px-2.5 py-1.5 rounded-lg border border-zinc-300 hover:bg-zinc-100 text-xs font-medium text-zinc-900"
                            >
                              編輯
                            </button>
                            {confirmDeleteId === product.id ? (
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(product.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium"
                              >
                                確認刪除
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(product.id)}
                                aria-label="刪除商品"
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: PRODUCT PUBLISHING EDITOR (商品上稿：名稱、圖片、影片、介紹) */}
      {activeTab === 'editor' && (
        <form onSubmit={handleSaveProduct} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Main Editor Form */}
          <div className="lg:col-span-8 space-y-6">
            {/* Section 1: Basic Info & Product Name */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <h2 className="text-base font-semibold text-zinc-900">1. 基本資訊與商品名稱</h2>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-700 cursor-pointer min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))}
                    className="w-4 h-4 accent-emerald-950 rounded"
                  />
                  <span>立即上架至前台</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    商品名稱 *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：月岩霧面無線陶瓷桌燈"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    商品副標題（一句話特色摘要）
                  </label>
                  <input
                    type="text"
                    value={form.subtitle}
                    onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
                    placeholder="例如：鶯歌高溫窯燒素坯 × 三段式暖光觸控調光"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    商品分類
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        category: e.target.value as Exclude<ProductCategory, '全部'>
                      }))
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      售價 (NT$) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={form.price}
                      onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      庫存數量
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={form.stock}
                      onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-900"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    款式規格選項（以逗號分隔）
                  </label>
                  <input
                    type="text"
                    value={form.variantsText}
                    onChange={(e) => setForm((prev) => ({ ...prev, variantsText: e.target.value }))}
                    placeholder="例如：月岩白（標準款）, 暖沙灰（限定色）"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  />
                </div>
              </div>
            </section>

            {/* Section 2: Product Images Upload (圖片上稿與即時驗證預覽) */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-4">
              <div className="border-b border-zinc-100 pb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    2. 商品圖片上稿（上傳後即時預覽）
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    支援拖曳或點擊多圖上傳，上傳後立即於下方顯示縮圖與伺服器讀取狀態確認。
                  </p>
                </div>
                {form.images.length > 0 && (
                  <span className="text-xs font-medium text-emerald-900 tabular-nums shrink-0">
                    已載入 {form.images.length} 張
                  </span>
                )}
              </div>

              {/* File Picker + Drag & Drop Upload Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragImageOver(true);
                }}
                onDragLeave={() => setDragImageOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragImageOver(false);
                  handleImageFiles(e.dataTransfer.files);
                }}
                className="flex flex-col sm:flex-row gap-3"
              >
                <input
                  id="admin-image-file-input"
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingImage}
                  onChange={(e) => handleImageFiles(e.target.files)}
                  className="sr-only"
                />
                <label
                  htmlFor="admin-image-file-input"
                  className={`min-h-[56px] px-5 py-3 rounded-xl border-2 border-dashed text-sm font-medium text-zinc-900 flex items-center justify-center gap-2 transition-colors flex-1 ${
                    uploadingImage ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                  } ${
                    dragImageOver
                      ? 'border-emerald-900 bg-emerald-950/10'
                      : 'border-zinc-400 hover:border-emerald-900 bg-zinc-50 hover:bg-emerald-950/5'
                  }`}
                >
                  <ImagePlus className="w-4 h-4 text-emerald-900 shrink-0" />
                  <span>
                    {uploadingImage
                      ? '圖片上傳與驗證中...'
                      : '點擊或拖曳商品圖片至此上傳（可多選）'}
                  </span>
                </label>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={imageUrlInputRef}
                      type="text"
                      inputMode="url"
                      value={imageUrlInput}
                      onChange={(e) => {
                        setImageUrlInput(e.target.value);
                        if (imageSectionError) setImageSectionError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddImageUrl();
                        }
                      }}
                      placeholder="或貼上圖片網址 https://..."
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-zinc-400 bg-white text-zinc-900 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="min-h-[44px] px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs sm:text-sm font-medium shrink-0 whitespace-nowrap"
                  >
                    加入圖片
                  </button>
                </div>

                {imageSectionError && (
                  <p role="alert" className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{imageSectionError}</span>
                  </p>
                )}
              </div>

              {/* Uploaded Images Preview Grid with live server-load verification */}
              {form.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  {form.images.map((url, idx) => {
                    const meta = imageMeta[url];
                    const status = meta?.status || 'loading';
                    return (
                      <div
                        key={`${url}-${idx}`}
                        className="group relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 flex flex-col"
                      >
                        <div className="relative aspect-[4/3] bg-zinc-100">
                          <img
                            src={url}
                            alt={meta?.name || `商品預覽圖 ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            onLoad={() =>
                              setImageMeta((prev) => ({
                                ...prev,
                                [url]: { ...prev[url], status: 'verified' }
                              }))
                            }
                            onError={() =>
                              setImageMeta((prev) => ({
                                ...prev,
                                [url]: { ...prev[url], status: 'error' }
                              }))
                            }
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxMedia({
                                kind: 'image',
                                url,
                                title: meta?.name || `${form.name || '商品'} - 圖片 ${idx + 1}`
                              })
                            }
                            aria-label="放大預覽圖片"
                            className="absolute bottom-2 right-2 min-h-[34px] px-2.5 rounded-lg bg-zinc-900/80 hover:bg-zinc-900 text-white text-[11px] font-medium flex items-center gap-1 backdrop-blur-xs"
                          >
                            <Maximize2 className="w-3 h-3" />
                            <span>放大</span>
                          </button>
                        </div>

                        <div className="p-2.5 bg-white border-t border-zinc-100 space-y-1.5">
                          <div className="flex items-center justify-between gap-1 text-[11px]">
                            {status === 'verified' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-900 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                上傳成功
                              </span>
                            ) : status === 'error' ? (
                              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                                <AlertCircle className="w-3.5 h-3.5" />
                                無法讀取
                              </span>
                            ) : (
                              <span className="text-zinc-500">預覽載入中...</span>
                            )}
                            {meta?.size && (
                              <span className="text-zinc-400 tabular-nums">
                                {formatBytes(meta.size)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-100">
                            {idx === 0 ? (
                              <span className="text-[11px] font-semibold text-zinc-900">
                                封面主圖
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAsCoverImage(idx)}
                                className="text-[11px] text-zinc-600 hover:text-zinc-900 underline"
                              >
                                設為封面
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              aria-label="移除圖片"
                              className="p-1 text-zinc-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 3: Product Video Upload (影片上稿與即時播放驗證) */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-4">
              <div className="border-b border-zinc-100 pb-3">
                <h2 className="text-base font-semibold text-zinc-900">
                  3. 商品影片上稿（上傳後即時播放確認）
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  上傳實拍商品介紹短片（MP4 / WebM / MOV，最大 100MB），完成後可直接於下方播放器試播檢查。
                </p>
              </div>

              <input
                id="admin-video-file-input"
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                disabled={videoUploadProgress !== null}
                onChange={(e) => handleVideoFile(e.target.files)}
                className="sr-only"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragVideoOver(true);
                }}
                onDragLeave={() => setDragVideoOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragVideoOver(false);
                  handleVideoFile(e.dataTransfer.files);
                }}
              >
                <label
                  htmlFor="admin-video-file-input"
                  className={`w-full min-h-[56px] px-5 py-3 rounded-xl border-2 border-dashed text-sm font-medium text-zinc-900 flex items-center justify-center gap-2 transition-colors ${
                    videoUploadProgress !== null ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                  } ${
                    dragVideoOver
                      ? 'border-emerald-900 bg-emerald-950/10'
                      : 'border-zinc-400 hover:border-emerald-900 bg-zinc-50 hover:bg-emerald-950/5'
                  }`}
                >
                  <Upload className="w-4 h-4 text-emerald-900 shrink-0" />
                  <span>
                    {videoUploadProgress !== null
                      ? `影片上傳至伺服器中 ${videoUploadProgress}%...`
                      : '點擊或拖曳影片檔至此上傳（MP4 / WebM / MOV）'}
                  </span>
                </label>
              </div>

              {videoUploadProgress !== null && (
                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
                    <div
                      className="h-full bg-emerald-900 transition-all duration-150"
                      style={{ width: `${videoUploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-500 tabular-nums">
                    正在上傳：{videoMeta.name}（{videoUploadProgress}%）
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Video className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={videoUrlInputRef}
                      type="text"
                      value={videoUrlInput}
                      onChange={(e) => {
                        setVideoUrlInput(e.target.value);
                        if (videoSectionError) setVideoSectionError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyVideoUrl();
                        }
                      }}
                      placeholder="或輸入影片網址（MP4 / YouTube 連結）"
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-zinc-400 bg-white text-zinc-900 placeholder:text-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyVideoUrl}
                    className="min-h-[44px] px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs sm:text-sm font-medium shrink-0 whitespace-nowrap"
                  >
                    套用連結
                  </button>
                </div>

                {videoSectionError && (
                  <p role="alert" className="text-xs font-medium text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{videoSectionError}</span>
                  </p>
                )}
              </div>

              {(localVideoPreviewUrl || form.videoUrl) && (
                <div className="space-y-2.5 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {videoMeta.status === 'verified' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-900">
                          <CheckCircle2 className="w-4 h-4" />
                          影片上傳成功 · 可正常播放
                        </span>
                      ) : videoMeta.status === 'uploading' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
                          <Film className="w-4 h-4" />
                          本地即時預覽（上傳中）
                        </span>
                      ) : videoMeta.status === 'error' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                          <AlertCircle className="w-4 h-4" />
                          影片載入異常（請改用 H.264 MP4 或 WebM 格式）
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
                          <Film className="w-4 h-4" />
                          讀取伺服器影片中...
                        </span>
                      )}

                      {videoMeta.duration && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300">·</span>
                          <span className="text-zinc-500 tabular-nums">
                            片長 {formatDuration(videoMeta.duration)}
                          </span>
                        </>
                      )}
                      {videoMeta.size && (
                        <>
                          <span aria-hidden="true" className="text-zinc-300">·</span>
                          <span className="text-zinc-500 tabular-nums">
                            {formatBytes(videoMeta.size)}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setLightboxMedia({
                            kind: 'video',
                            url: localVideoPreviewUrl || form.videoUrl,
                            poster: form.images[0],
                            title: videoMeta.name || form.name || '商品影片預覽'
                          })
                        }
                        className="text-zinc-700 hover:text-zinc-900 font-medium inline-flex items-center gap-1"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>放大播放</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (localVideoPreviewUrl) {
                            URL.revokeObjectURL(localVideoPreviewUrl);
                            setLocalVideoPreviewUrl('');
                          }
                          setForm((prev) => ({ ...prev, videoUrl: '' }));
                          setVideoUrlInput('');
                          setVideoMeta({ status: 'idle' });
                        }}
                        className="text-red-600 hover:underline font-medium"
                      >
                        移除影片
                      </button>
                    </div>
                  </div>

                  <div className="aspect-[16/9] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200">
                    <VideoPlayer
                      url={localVideoPreviewUrl || form.videoUrl}
                      poster={form.images[0]}
                      title={form.name || '商品預覽影片'}
                      fit="contain"
                      onReady={(duration) =>
                        setVideoMeta((prev) => ({
                          ...prev,
                          status: prev.status === 'uploading' ? 'uploading' : 'verified',
                          duration
                        }))
                      }
                      onError={() =>
                        setVideoMeta((prev) => ({ ...prev, status: 'error' }))
                      }
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Section 4: Product Introduction & Specs (商品介紹文案與規格) */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-5">
              <div className="border-b border-zinc-100 pb-3">
                <h2 className="text-base font-semibold text-zinc-900">4. 前台商品介紹與規格明細</h2>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  商品詳細介紹文案
                </label>
                <textarea
                  rows={5}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="詳細描述商品的設計靈感、材質工藝、使用情境與保養建議..."
                  className="w-full p-3.5 rounded-xl border border-zinc-300 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              {/* Highlights */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700">設計亮點條列</label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({ ...prev, highlights: [...prev.highlights, ''] }))
                    }
                    className="text-xs font-medium text-emerald-900 hover:underline"
                  >
                    + 新增亮點
                  </button>
                </div>
                <div className="space-y-2">
                  {form.highlights.map((item, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) => {
                          const next = [...form.highlights];
                          next[idx] = e.target.value;
                          setForm((prev) => ({ ...prev, highlights: next }));
                        }}
                        placeholder={`亮點 ${idx + 1}（例如：三段式觸控調光設計）`}
                        className="flex-1 min-h-[42px] px-3 rounded-xl border border-zinc-300 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            highlights: prev.highlights.filter((_, i) => i !== idx)
                          }))
                        }
                        aria-label="刪除亮點"
                        className="min-h-[42px] min-w-[42px] flex items-center justify-center text-zinc-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Specs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700">商品規格參數表</label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        specs: [...prev.specs, { label: '', value: '' }]
                      }))
                    }
                    className="text-xs font-medium text-emerald-900 hover:underline"
                  >
                    + 新增規格欄位
                  </button>
                </div>
                <div className="space-y-2">
                  {form.specs.map((spec, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2">
                      <input
                        type="text"
                        value={spec.label}
                        onChange={(e) => {
                          const next = [...form.specs];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setForm((prev) => ({ ...prev, specs: next }));
                        }}
                        placeholder="項目（如：材質）"
                        className="col-span-4 min-h-[42px] px-3 rounded-xl border border-zinc-300 text-sm"
                      />
                      <input
                        type="text"
                        value={spec.value}
                        onChange={(e) => {
                          const next = [...form.specs];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setForm((prev) => ({ ...prev, specs: next }));
                        }}
                        placeholder="內容（如：天然石器陶瓷）"
                        className="col-span-7 min-h-[42px] px-3 rounded-xl border border-zinc-300 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            specs: prev.specs.filter((_, i) => i !== idx)
                          }))
                        }
                        aria-label="刪除規格"
                        className="col-span-1 min-h-[42px] flex items-center justify-center text-zinc-400 hover:text-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Submit Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="min-h-[48px] px-6 rounded-xl border border-zinc-300 bg-white text-zinc-800 text-sm font-medium"
              >
                取消返回
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[48px] px-8 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{saving ? '儲存發佈中...' : form.id ? '儲存商品變更' : '發佈商品至前台'}</span>
              </button>
            </div>
          </div>

          {/* Right Live Interactive Media & Card Preview Column */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold text-zinc-900">後台即時圖影預覽</span>
                <span>
                  {form.images.length} 圖 · {localVideoPreviewUrl || form.videoUrl ? '含影片' : '無影片'}
                </span>
              </div>

              {/* Interactive Stage */}
              <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
                <div className="aspect-[4/3] bg-zinc-100">
                  {previewGalleryIndex === 'video' && (localVideoPreviewUrl || form.videoUrl) ? (
                    <VideoPlayer
                      url={localVideoPreviewUrl || form.videoUrl}
                      poster={form.images[0]}
                      title={form.name || '商品影片即時預覽'}
                      fit="contain"
                    />
                  ) : (
                    <MediaImage
                      src={
                        form.images[typeof previewGalleryIndex === 'number' ? previewGalleryIndex : 0] ||
                        form.images[0]
                      }
                      alt={form.name || '商品名稱預覽'}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                {/* Switcher thumbnails inside preview */}
                {(form.images.length > 0 || localVideoPreviewUrl || form.videoUrl) && (
                  <div className="p-2.5 border-t border-zinc-100 bg-zinc-50 flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {form.images.map((url, idx) => (
                      <button
                        key={`${url}-preview-${idx}`}
                        type="button"
                        onClick={() => setPreviewGalleryIndex(idx)}
                        className={`w-12 h-10 rounded-lg overflow-hidden border-2 shrink-0 ${
                          previewGalleryIndex === idx
                            ? 'border-emerald-950'
                            : 'border-zinc-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <MediaImage src={url} alt={`縮圖 ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                    {(localVideoPreviewUrl || form.videoUrl) && (
                      <button
                        type="button"
                        onClick={() => setPreviewGalleryIndex('video')}
                        className={`h-10 px-2.5 rounded-lg border-2 shrink-0 bg-zinc-900 text-white text-[11px] font-medium flex items-center gap-1 ${
                          previewGalleryIndex === 'video'
                            ? 'border-emerald-800'
                            : 'border-zinc-700 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>影片</span>
                      </button>
                    )}
                  </div>
                )}

                <div className="p-3.5 space-y-1.5 border-t border-zinc-100">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{form.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{Number(form.stock) > 0 ? '現貨供應' : '補貨中'}</span>
                    {(localVideoPreviewUrl || form.videoUrl) && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-900 font-medium">商品影片</span>
                      </>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-900 line-clamp-1">
                    {form.name || '請輸入商品名稱'}
                  </h3>
                  <p className="text-xs text-zinc-500 line-clamp-1">
                    {form.subtitle || '商品副標題將顯示於此'}
                  </p>
                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                      NT$ {(Number(form.price) || 0).toLocaleString('zh-TW')}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-md bg-zinc-100 text-zinc-700 font-medium">
                      加入
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </form>
      )}

      {/* TAB 3: ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-zinc-200">
              <p className="text-sm font-medium text-zinc-800">目前尚無顧客訂單</p>
              <p className="text-xs text-zinc-500 mt-1">顧客於前台完成結帳後，訂單紀錄將即時顯示於此處。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-zinc-200 p-4 sm:p-5 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-semibold text-zinc-900 tabular-nums">
                          #{order.id}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(order.createdAt).toLocaleString('zh-TW')}</span>
                      </div>
                      <p className="text-sm font-medium text-zinc-900 mt-1">
                        {order.customerName}（{order.phone}）— {order.shippingMethod} /{' '}
                        {order.paymentMethod}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">{order.address}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-base font-semibold text-zinc-900 tabular-nums">
                        NT$ {order.total.toLocaleString('zh-TW')}
                      </span>
                      <select
                        value={order.status}
                        onChange={(e) =>
                          handleUpdateOrderStatus(order.id, e.target.value as OrderStatus)
                        }
                        className="min-h-[40px] px-3 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800"
                      >
                        <option value="待出貨">待出貨</option>
                        <option value="已出貨">已出貨</option>
                        <option value="已完成">已完成</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-zinc-600">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {item.name}（{item.variant}）× {item.quantity}
                        </span>
                        <span className="tabular-nums">
                          NT$ {(item.price * item.quantity).toLocaleString('zh-TW')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Media Lightbox / Verification Modal */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl bg-white rounded-2xl overflow-hidden shadow-2xl border border-zinc-200">
            <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-900 truncate">
                {lightboxMedia.kind === 'product'
                  ? `${lightboxMedia.product.name} — 已上傳媒體檢查`
                  : lightboxMedia.title}
              </h3>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                aria-label="關閉預覽"
                className="min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 bg-zinc-950 max-h-[75vh] overflow-y-auto">
              {lightboxMedia.kind === 'image' && (
                <img
                  src={lightboxMedia.url}
                  alt={lightboxMedia.title}
                  referrerPolicy="no-referrer"
                  className="max-h-[65vh] w-auto mx-auto rounded-lg object-contain"
                />
              )}

              {lightboxMedia.kind === 'video' && (
                <div className="aspect-[16/9] w-full rounded-lg overflow-hidden">
                  <VideoPlayer
                    url={lightboxMedia.url}
                    poster={lightboxMedia.poster}
                    title={lightboxMedia.title}
                    fit="contain"
                  />
                </div>
              )}

              {lightboxMedia.kind === 'product' && (
                <div className="space-y-4">
                  {lightboxMedia.product.videoUrl && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-zinc-300">商品介紹影片</p>
                      <div className="aspect-[16/9] rounded-lg overflow-hidden">
                        <VideoPlayer
                          url={lightboxMedia.product.videoUrl}
                          poster={lightboxMedia.product.images[0]}
                          title={lightboxMedia.product.name}
                          fit="contain"
                        />
                      </div>
                    </div>
                  )}

                  {lightboxMedia.product.images.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-zinc-300">
                        商品圖片（共 {lightboxMedia.product.images.length} 張）
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {lightboxMedia.product.images.map((img, i) => (
                          <div key={i} className="rounded-lg overflow-hidden bg-zinc-900 aspect-[4/3]">
                            <MediaImage
                              src={img}
                              alt={`${lightboxMedia.product.name} 圖片 ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!lightboxMedia.product.videoUrl && lightboxMedia.product.images.length === 0 && (
                    <p className="text-sm text-zinc-400 text-center py-8">此商品尚未上傳任何圖片或影片</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
