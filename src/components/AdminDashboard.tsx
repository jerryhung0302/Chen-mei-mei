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
  Lock,
  Maximize2,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Video,
  X
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import type {
  MemberOrderRecord,
  Order,
  OrderStatus,
  Product,
  ProductCategory,
  ProductSpec
} from '../types';
import {
  BackendUnavailableError,
  fileToDataUrl,
  getLocalProducts,
  optimizeImageFile,
  parseApiJson,
  setLocalProducts,
  updateLocalOrderStatus
} from '../lib/apiClient';
import {
  OperationType,
  db,
  formatFirestoreTimestamp,
  handleFirestoreError
} from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { AdminMembersPanel } from './AdminMembersPanel';
import { MediaImage } from './MediaImage';
import { VideoPlayer } from './VideoPlayer';

interface AdminDashboardProps {
  products: Product[];
  orders: Order[];
  onRefresh: () => Promise<void>;
  onPreviewProduct: (product: Product) => void;
  onBackToStore?: () => void;
}

type AdminTab = 'list' | 'editor' | 'orders' | 'members';

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
  localMode?: boolean;
}

export function AdminDashboard({
  products,
  orders,
  onRefresh,
  onPreviewProduct,
  onBackToStore
}: AdminDashboardProps) {
  const {
    authReady,
    user,
    memberProfile,
    memberLoading,
    isRegistered,
    isAdmin,
    adminRequest,
    authError,
    openMemberModal,
    signInWithGoogle,
    submitAdminRequest
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('list');
  const [cloudOrders, setCloudOrders] = useState<MemberOrderRecord[]>([]);
  const [requestReason, setRequestReason] = useState('');
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestMsg, setRequestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
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

  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setCloudOrders([]);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'member_orders'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MemberOrderRecord);
        setCloudOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'member_orders');
      }
    );
    return () => unsub();
  }, [authReady, user, isAdmin]);

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

  // Upload a single image via /api/upload -> /api/upload-base64 -> compact Data URL fallback if /api/* is 404 (static preview)
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
      return await parseApiJson<UploadResult>(res, '圖片上傳失敗');
    } catch {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) {
        throw new Error('無法讀取圖片檔案，請改用 JPG 或 PNG 圖檔');
      }

      try {
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
        return await parseApiJson<UploadResult>(fallbackRes, '圖片上傳失敗');
      } catch (base64Err) {
        if (base64Err instanceof BackendUnavailableError) {
          // Static hosting / Shared static preview without Node backend:
          // Compress into a compact Data URL so preview and saving still work seamlessly.
          const compactFile = await optimizeImageFile(rawFile, {
            maxDim: 1080,
            maxBytes: 180 * 1024,
            quality: 0.82
          });
          const compactDataUrl = await fileToDataUrl(compactFile);
          return {
            url: compactDataUrl || dataUrl,
            type: 'image',
            originalName: rawFile.name,
            size: compactFile.size,
            localMode: true
          };
        }
        throw base64Err;
      }
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
      let usedLocalMode = false;
      const nextMeta: Record<
        string,
        { status: 'loading' | 'verified' | 'error'; name?: string; size?: number }
      > = {};

      for (const file of selectedFiles) {
        const data = await uploadSingleImage(file);
        if (data.localMode) usedLocalMode = true;
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
      showToast(
        'success',
        usedLocalMode
          ? `已載入 ${uploadedUrls.length} 張商品圖片（靜態預覽模式已自動最佳化保存）`
          : `已上傳 ${uploadedUrls.length} 張商品圖片，可於下方與右側即時預覽`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '圖片上傳失敗，請檢查圖片格式或稍後再試';
      setImageSectionError(message);
      showToast('error', message);
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const uploadChunkXhr = (
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    filename: string,
    chunkBlob: Blob,
    onProgress: (loadedBytes: number) => void
  ): Promise<{ status: number; data: UploadResult | null; errorText?: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.withCredentials = true;
      const params = new URLSearchParams({
        uploadId,
        chunkIndex: String(chunkIndex),
        totalChunks: String(totalChunks),
        filename
      });
      xhr.open('POST', `/api/upload-chunk?${params.toString()}`, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
      xhr.onload = () => {
        const raw = xhr.responseText?.trim() || '';
        let parsed: Record<string, unknown> | null = null;
        if (raw && !raw.startsWith('<')) {
          try {
            parsed = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            parsed = null;
          }
        }
        resolve({
          status: xhr.status,
          data: parsed && typeof parsed.url === 'string' ? (parsed as unknown as UploadResult) : null,
          errorText: typeof parsed?.error === 'string' ? parsed.error : undefined
        });
      };
      xhr.onerror = () => reject(new Error('網路連線異常，影片上傳失敗'));
      xhr.send(chunkBlob);
    });
  };

  // Upload video using 2MB chunks (avoids proxy 400/413 limits) + real progress bar + local/server preview
  const handleVideoFile = async (files: FileList | null) => {
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

    const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per request
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const uploadId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      let uploadedResult: UploadResult | null = null;

      for (let i = 0; i < totalChunks; i += 1) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const chunkBlob = file.slice(start, end);

        const res = await uploadChunkXhr(uploadId, i, totalChunks, file.name, chunkBlob, (loaded) => {
          const overall = Math.min(99, Math.round(((start + loaded) / Math.max(1, file.size)) * 100));
          setVideoUploadProgress(overall);
        });

        if (res.status < 200 || res.status >= 300) {
          if (res.status === 404 || res.status === 405) {
            throw new BackendUnavailableError(
              res.errorText || `目前預覽環境尚未啟用影片上傳服務（HTTP ${res.status}）`,
              res.status
            );
          }
          throw new Error(res.errorText || `影片上傳失敗（HTTP ${res.status}）`);
        }

        if (res.data?.url) {
          uploadedResult = res.data;
        }
      }

      if (!uploadedResult?.url) {
        throw new Error('伺服器未回傳影片網址，請重新上傳');
      }

      setVideoUploadProgress(null);
      if (videoInputRef.current) videoInputRef.current.value = '';
      URL.revokeObjectURL(blobUrl);
      setLocalVideoPreviewUrl('');
      setForm((prev) => ({ ...prev, videoUrl: uploadedResult!.url }));
      setVideoUrlInput(uploadedResult.url);
      setVideoMeta({
        status: 'loading',
        name: uploadedResult.originalName || file.name,
        size: uploadedResult.size || file.size
      });
      setPreviewGalleryIndex('video');
      showToast('success', '商品影片已上傳並完成相容性處理，請確認下方預覽播放');
    } catch (err) {
      setVideoUploadProgress(null);
      if (videoInputRef.current) videoInputRef.current.value = '';

      if (err instanceof BackendUnavailableError) {
        // Keep local blob preview playable while clearly explaining static preview limitation
        setVideoMeta((prev) => ({ ...prev, status: 'verified' }));
        const msg =
          '目前為靜態／舊版預覽環境（HTTP 404），無法儲存大型影片至伺服器；您可先於下方試看本地預覽，或改貼 YouTube／MP4 網址。';
        setVideoSectionError(msg);
        showToast('error', msg);
        return;
      }

      // Upload failed, but keep local video preview usable so codec error isn't falsely displayed
      setVideoMeta((prev) => ({ ...prev, status: 'verified' }));
      const msg = err instanceof Error ? err.message : '影片上傳失敗，請稍後再試';
      setVideoSectionError(msg);
      showToast('error', msg);
    }
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
      try {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        });
        await parseApiJson<Product>(res, '儲存商品失敗');
      } catch (err) {
        if (err instanceof BackendUnavailableError) {
          const current = getLocalProducts();
          const now = new Date().toISOString();
          if (form.id) {
            setLocalProducts(
              current.map((p) =>
                p.id === form.id ? { ...p, ...payload, updatedAt: now } : p
              )
            );
          } else {
            const newProd: Product = {
              id: `prod-${Date.now()}`,
              ...payload,
              variants: payload.variants.length > 0 ? payload.variants : ['標準款式'],
              createdAt: now,
              updatedAt: now
            };
            setLocalProducts([newProd, ...current]);
          }
        } else {
          throw err;
        }
      }

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
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ published: !product.published })
        });
        await parseApiJson<Product>(res, '狀態切換失敗');
      } catch (err) {
        if (err instanceof BackendUnavailableError) {
          setLocalProducts(
            getLocalProducts().map((p) =>
              p.id === product.id ? { ...p, published: !p.published } : p
            )
          );
        } else {
          throw err;
        }
      }
      await onRefresh();
      showToast('success', product.published ? '已將商品下架為草稿' : '已將商品上架至前台');
    } catch {
      showToast('error', '切換商品狀態失敗');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      try {
        const res = await fetch(`/api/products/${id}`, {
          method: 'DELETE',
          credentials: 'same-origin'
        });
        await parseApiJson<{ ok: boolean }>(res, '刪除失敗');
      } catch (err) {
        if (err instanceof BackendUnavailableError) {
          setLocalProducts(getLocalProducts().filter((p) => p.id !== id));
        } else {
          throw err;
        }
      }
      setConfirmDeleteId(null);
      await onRefresh();
      showToast('success', '商品已刪除');
    } catch {
      showToast('error', '刪除商品失敗');
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const isCloudOrder = cloudOrders.some((co) => co.orderId === orderId);
      if (isCloudOrder) {
        try {
          await updateDoc(doc(db, 'member_orders', orderId), {
            status,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `member_orders/${orderId}`);
        }
      }

      if (orders.some((o) => o.id === orderId)) {
        try {
          const res = await fetch(`/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ status })
          });
          await parseApiJson<Order>(res, '訂單狀態更新失敗');
        } catch (err) {
          if (err instanceof BackendUnavailableError) {
            updateLocalOrderStatus(orderId, status);
          } else if (!isCloudOrder) {
            throw err;
          }
        }
      }
      await onRefresh();
      showToast('success', `訂單 #${orderId} 狀態已更新為「${status}」`);
    } catch {
      showToast('error', '更新訂單狀態失敗');
    }
  };

  const mergedOrders: Order[] = (() => {
    const map = new Map<string, Order>();
    for (const co of cloudOrders) {
      map.set(co.orderId, {
        id: co.orderId,
        customerName: co.customerName,
        phone: co.phone,
        shippingMethod: co.shippingMethod,
        paymentMethod: co.paymentMethod,
        address: co.address,
        note: co.note,
        items: co.items,
        subtotal: co.subtotal,
        shippingFee: co.shippingFee,
        total: co.total,
        status: co.status,
        createdAt: formatFirestoreTimestamp(co.createdAt),
        memberUid: co.uid
      });
    }
    for (const o of orders) {
      if (!map.has(o.id)) {
        map.set(o.id, o);
      }
    }
    return Array.from(map.values());
  })();

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

  const handleRequestAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestMsg(null);
    setRequestBusy(true);
    try {
      await submitAdminRequest(requestReason);
      setRequestMsg({ type: 'success', text: '已送出後台管理員權限申請，請靜候現任管理員審核。' });
      setRequestReason('');
    } catch (err) {
      setRequestMsg({
        type: 'error',
        text: err instanceof Error ? err.message : '申請送出失敗，請稍後再試'
      });
    } finally {
      setRequestBusy(false);
    }
  };

  if (!authReady || (user && memberLoading)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center text-sm text-zinc-500">
        正在驗證後台會員與管理員權限...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 sm:py-16 pb-24">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 space-y-5 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-950 text-white flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-zinc-900">後台管理系統 · 會員驗證登入</h1>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              為確保商店商品上稿、媒體上傳與顧客訂單資料安全，進入後台前請先登入並完成會員驗證。
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 text-left">
              {authError}
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="w-full min-h-[48px] px-5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>使用 Google 帳號登入／註冊</span>
            </button>
            {onBackToStore && (
              <button
                type="button"
                onClick={onBackToStore}
                className="w-full min-h-[44px] px-5 rounded-xl border border-zinc-300 bg-white text-zinc-700 text-sm font-medium"
              >
                返回前台商店
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin && !isRegistered) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 sm:py-16 pb-24">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 space-y-5 text-center shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center mx-auto">
            <UserPlus className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold text-zinc-900">請先完成全站會員註冊</h1>
            <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
              您已登入（{user.email}），請先填寫會員註冊資料，完成後即可在前台快速結帳或申請後台管理員權限。
            </p>
          </div>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => openMemberModal('register')}
              className="w-full min-h-[48px] px-5 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors"
            >
              填寫會員註冊資料
            </button>
            {onBackToStore && (
              <button
                type="button"
                onClick={onBackToStore}
                className="w-full min-h-[44px] px-5 rounded-xl border border-zinc-300 bg-white text-zinc-700 text-sm font-medium"
              >
                返回前台商店
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 sm:py-16 pb-24">
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 space-y-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-zinc-100 text-zinc-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">後台管理員權限驗證</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                目前登入會員：{memberProfile?.displayName}（{user.email}）· {memberProfile?.memberTier}
              </p>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
            此帳號已完成全站會員註冊，但目前為一般前台會員權限，尚未具備後台商品上稿與訂單管理權限。如需協作管理後台，請填寫下方申請送交管理員核准。
          </p>

          {requestMsg && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                requestMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {requestMsg.text}
            </div>
          )}

          {adminRequest?.status === 'pending' ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1">
              <p className="font-semibold">管理員權限申請審核中</p>
              <p>申請說明：{adminRequest.reason}</p>
              <p className="text-amber-800/80">
                送出時間：{formatFirestoreTimestamp(adminRequest.createdAt)}
              </p>
            </div>
          ) : (
            <form onSubmit={handleRequestAdminSubmit} className="space-y-3">
              {adminRequest?.status === 'rejected' && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  先前申請未獲核准，您可補充說明後重新提出申請。
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  申請原因／職務說明 *
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={300}
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="例如：門市營運人員，協助商品圖片與影片上稿更新"
                  className="w-full p-3 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>
              <button
                type="submit"
                disabled={requestBusy}
                className="w-full min-h-[46px] rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {requestBusy ? '申請送出中...' : '申請開通後台管理員權限'}
              </button>
            </form>
          )}

          {onBackToStore && (
            <button
              type="button"
              onClick={onBackToStore}
              className="w-full min-h-[44px] rounded-xl border border-zinc-300 bg-white text-zinc-700 text-sm font-medium"
            >
              返回前台商店瀏覽
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-16 space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">後台商品上稿與管理</h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            管理商品名稱、多圖上傳、商品影片上稿、訂單出貨狀態與全站會員名冊，變更將即時同步至前台商店。
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

      {/* Prompt bootstrap admin to complete optional member profile if not registered yet */}
      {!isRegistered && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <span>
            您目前以預設管理員帳號（{user.email}）進入後台，建議同步完成會員資料註冊以參與前台結帳與名冊管理。
          </span>
          <button
            type="button"
            onClick={() => openMemberModal('register')}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-amber-900 text-white font-medium shrink-0 self-start sm:self-auto"
          >
            補齊會員資料
          </button>
        </div>
      )}

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
      <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl w-full sm:w-fit overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`flex-1 sm:flex-none min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
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
          className={`flex-1 sm:flex-none min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
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
          className={`flex-1 sm:flex-none min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          訂單管理 ({mergedOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={`flex-1 sm:flex-none min-h-[40px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
            activeTab === 'members'
              ? 'bg-white text-zinc-900 shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>會員管理</span>
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
                accept="video/*,.mp4,.mov,.m4v,.webm"
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
                      {videoMeta.status === 'uploading' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700">
                          <Film className="w-4 h-4" />
                          本地即時預覽（分段上傳至伺服器中）
                        </span>
                      ) : videoMeta.status === 'error' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                          <AlertCircle className="w-4 h-4" />
                          瀏覽器無法解碼此影片（請改用 H.264 MP4 或 WebM 格式）
                        </span>
                      ) : videoMeta.status === 'verified' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-900">
                          <CheckCircle2 className="w-4 h-4" />
                          {localVideoPreviewUrl && !form.videoUrl
                            ? '本地試播正常（尚未儲存至伺服器）'
                            : '影片上傳成功 · 可正常播放'}
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
          {mergedOrders.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-zinc-200">
              <p className="text-sm font-medium text-zinc-800">目前尚無顧客訂單</p>
              <p className="text-xs text-zinc-500 mt-1">顧客於前台完成結帳後，訂單紀錄將即時顯示於此處。</p>
            </div>
          ) : (
            <div className="space-y-3">
              {mergedOrders.map((order) => (
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
                        <span>
                          {order.createdAt.includes('T')
                            ? new Date(order.createdAt).toLocaleString('zh-TW')
                            : order.createdAt}
                        </span>
                        {order.memberUid && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-900 font-medium">會員訂單</span>
                          </>
                        )}
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

      {/* TAB 4: MEMBER & RBAC MANAGEMENT */}
      {activeTab === 'members' && <AdminMembersPanel onNotify={showToast} />}

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
