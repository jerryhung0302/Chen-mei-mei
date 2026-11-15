import { useRef, useState } from 'react';
import {
  Check,
  Edit3,
  Eye,
  Film,
  ImagePlus,
  Link2,
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
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const openNewEditor = () => {
    setForm(EMPTY_FORM);
    setImageUrlInput('');
    setVideoUrlInput('');
    setActiveTab('editor');
  };

  const openEditEditor = (product: Product) => {
    setForm(productToForm(product));
    setImageUrlInput('');
    setVideoUrlInput(product.videoUrl);
    setActiveTab('editor');
  };

  // Upload images via fetch FormData
  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '圖片上傳失敗');
        uploadedUrls.push(data.url);
      }
      setForm((prev) => ({ ...prev, images: [...prev.images, ...uploadedUrls] }));
      showToast('success', `成功上傳 ${uploadedUrls.length} 張商品圖片`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '圖片上傳失敗');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Upload video with real XHR progress bar
  const handleVideoFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    setVideoUploadProgress(0);
    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
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
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setForm((prev) => ({ ...prev, videoUrl: data.url }));
          setVideoUrlInput(data.url);
          showToast('success', '商品影片上傳完成');
        } else {
          showToast('error', data.error || '影片上傳失敗');
        }
      } catch {
        showToast('error', '影片上傳回應格式錯誤');
      }
    };
    xhr.onerror = () => {
      setVideoUploadProgress(null);
      showToast('error', '網路連線異常，影片上傳失敗');
    };
    xhr.send(fd);
  };

  const handleAddImageUrl = () => {
    const trimmed = imageUrlInput.trim();
    if (!trimmed) return;
    setForm((prev) => ({ ...prev, images: [...prev.images, trimmed] }));
    setImageUrlInput('');
  };

  const handleApplyVideoUrl = () => {
    setForm((prev) => ({ ...prev, videoUrl: videoUrlInput.trim() }));
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
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');

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

            {/* Section 2: Product Images Upload (圖片上稿) */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-4">
              <div className="border-b border-zinc-100 pb-3">
                <h2 className="text-base font-semibold text-zinc-900">2. 商品圖片上稿（支援多圖上傳）</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  可從手機相簿或電腦直接上傳圖片，亦可貼上外部圖片網址；第一張圖片將作為前台列表封面。
                </p>
              </div>

              {/* File Picker Upload Zone */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleImageFiles(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingImage}
                  onClick={() => imageInputRef.current?.click()}
                  className="min-h-[48px] px-5 py-3 rounded-xl border-2 border-dashed border-zinc-300 hover:border-emerald-900 bg-zinc-50 hover:bg-emerald-950/5 text-sm font-medium text-zinc-800 flex items-center justify-center gap-2 transition-colors flex-1"
                >
                  <ImagePlus className="w-4 h-4 text-emerald-900" />
                  <span>{uploadingImage ? '圖片上傳處理中...' : '選擇或拍攝商品圖片（可多選）'}</span>
                </button>
              </div>

              {/* URL Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    value={imageUrlInput}
                    onChange={(e) => setImageUrlInput(e.target.value)}
                    placeholder="或貼上圖片網址 https://..."
                    className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddImageUrl}
                  className="min-h-[44px] px-4 rounded-xl bg-zinc-900 text-white text-xs sm:text-sm font-medium shrink-0 whitespace-nowrap"
                >
                  加入圖片
                </button>
              </div>

              {/* Uploaded Images Preview Grid */}
              {form.images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {form.images.map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      className="group relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-100"
                    >
                      <div className="aspect-[4/3]">
                        <MediaImage
                          src={url}
                          alt={`商品圖 ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-2 bg-white border-t border-zinc-100 flex items-center justify-between gap-1">
                        {idx === 0 ? (
                          <span className="text-[11px] font-semibold text-emerald-900">
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
                  ))}
                </div>
              )}
            </section>

            {/* Section 3: Product Video Upload (影片上稿) */}
            <section className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-4">
              <div className="border-b border-zinc-100 pb-3">
                <h2 className="text-base font-semibold text-zinc-900">3. 商品影片上稿（MP4 / WebM / YouTube）</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  上傳實拍商品介紹短片（最大支援 100MB），或貼上 YouTube / MP4 影片連結。
                </p>
              </div>

              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => handleVideoFile(e.target.files)}
                className="hidden"
              />

              <button
                type="button"
                disabled={videoUploadProgress !== null}
                onClick={() => videoInputRef.current?.click()}
                className="w-full min-h-[52px] px-5 py-3 rounded-xl border-2 border-dashed border-zinc-300 hover:border-emerald-900 bg-zinc-50 hover:bg-emerald-950/5 text-sm font-medium text-zinc-800 flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="w-4 h-4 text-emerald-900" />
                <span>
                  {videoUploadProgress !== null
                    ? `影片上傳中 ${videoUploadProgress}%...`
                    : '上傳商品介紹影片檔（MP4 / WebM / MOV）'}
                </span>
              </button>

              {videoUploadProgress !== null && (
                <div className="w-full h-2 rounded-full bg-zinc-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-900 transition-all duration-150"
                    style={{ width: `${videoUploadProgress}%` }}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Video className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={videoUrlInput}
                    onChange={(e) => setVideoUrlInput(e.target.value)}
                    placeholder="或輸入影片網址（MP4 / YouTube 連結）"
                    className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyVideoUrl}
                  className="min-h-[44px] px-4 rounded-xl bg-zinc-900 text-white text-xs sm:text-sm font-medium shrink-0 whitespace-nowrap"
                >
                  套用連結
                </button>
              </div>

              {form.videoUrl && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs text-zinc-600">
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-900">
                      <Film className="w-3.5 h-3.5" />
                      目前商品影片預覽
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, videoUrl: '' }));
                        setVideoUrlInput('');
                      }}
                      className="text-red-600 hover:underline font-medium"
                    >
                      移除影片
                    </button>
                  </div>
                  <div className="aspect-[16/9] rounded-xl overflow-hidden bg-zinc-950 border border-zinc-200">
                    <VideoPlayer
                      url={form.videoUrl}
                      poster={form.images[0]}
                      title={form.name || '商品預覽影片'}
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

          {/* Right Live Mobile Preview Column */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-3">
            <div className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="font-semibold text-zinc-900">前台卡片即時預覽</span>
                <span>行動版顯示比例</span>
              </div>

              <div className="rounded-xl border border-zinc-200 overflow-hidden bg-white">
                <div className="aspect-[4/3] bg-zinc-100">
                  <MediaImage
                    src={form.images[0]}
                    alt={form.name || '商品名稱預覽'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{form.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>{Number(form.stock) > 0 ? '現貨供應' : '補貨中'}</span>
                    {form.videoUrl && (
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
    </div>
  );
}
