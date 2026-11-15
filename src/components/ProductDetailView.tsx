import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Film,
  Heart,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Truck
} from 'lucide-react';
import type { Product } from '../types';
import { MediaImage } from './MediaImage';
import { VideoPlayer } from './VideoPlayer';

interface ProductDetailViewProps {
  product: Product;
  isFavorite: boolean;
  onBack: () => void;
  onAddToCart: (product: Product, variant: string, quantity: number, openCart?: boolean) => void;
  onToggleFavorite: (product: Product) => void;
}

export function ProductDetailView({
  product,
  isFavorite,
  onBack,
  onAddToCart,
  onToggleFavorite
}: ProductDetailViewProps) {
  const hasVideo = Boolean(product.videoUrl);
  const [activeMedia, setActiveMedia] = useState<'video' | number>(
    product.images.length > 0 ? 0 : hasVideo ? 'video' : 0
  );
  const [selectedVariant, setSelectedVariant] = useState<string>(
    product.variants[0] || '標準款式'
  );
  const [quantity, setQuantity] = useState(1);
  const [addedFeedback, setAddedFeedback] = useState(false);

  const inStock = product.stock > 0;

  const handleAdd = (buyNow = false) => {
    if (!inStock) return;
    onAddToCart(product, selectedVariant, quantity, buyNow);
    if (!buyNow) {
      setAddedFeedback(true);
      setTimeout(() => setAddedFeedback(false), 1800);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-28 lg:pb-16">
      {/* Back navigation & Favorite toggle */}
      <div className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回商品目錄</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(product)}
          aria-pressed={isFavorite}
          className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
            isFavorite
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-900'
          }`}
        >
          <Heart
            className={`w-4 h-4 ${isFavorite ? 'fill-rose-600 text-rose-600' : 'text-zinc-600'}`}
            strokeWidth={1.9}
          />
          <span>{isFavorite ? '已收藏商品' : '加入收藏'}</span>
        </button>
      </div>

      {/* Main Split Grid: Gallery Left, Contiguous Purchase Module Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Media Gallery Column */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 space-y-3">
          {/* Primary Media Stage */}
          <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200/80">
            {activeMedia === 'video' && hasVideo ? (
              <VideoPlayer
                url={product.videoUrl}
                poster={product.images[0]}
                title={`${product.name} 介紹影片`}
                className="w-full h-full"
              />
            ) : (
              <MediaImage
                src={product.images[typeof activeMedia === 'number' ? activeMedia : 0]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* Thumbnail & Video Switcher */}
          <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {product.images.map((imgUrl, idx) => {
              const isSelected = activeMedia === idx;
              return (
                <button
                  key={`${imgUrl}-${idx}`}
                  type="button"
                  onClick={() => setActiveMedia(idx)}
                  aria-label={`檢視商品圖片 ${idx + 1}`}
                  className={`relative w-20 h-16 sm:w-24 sm:h-18 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    isSelected
                      ? 'border-emerald-950 ring-1 ring-emerald-950/20'
                      : 'border-zinc-200 opacity-75 hover:opacity-100'
                  }`}
                >
                  <MediaImage
                    src={imgUrl}
                    alt={`${product.name} 縮圖 ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}

            {hasVideo && (
              <button
                type="button"
                onClick={() => setActiveMedia('video')}
                aria-label="播放商品介紹影片"
                className={`relative w-24 h-16 sm:w-28 sm:h-18 rounded-xl overflow-hidden shrink-0 border-2 flex flex-col items-center justify-center gap-1 bg-zinc-900 text-white transition-all ${
                  activeMedia === 'video'
                    ? 'border-emerald-900 ring-2 ring-emerald-900/30'
                    : 'border-zinc-700 opacity-85 hover:opacity-100'
                }`}
              >
                <Film className="w-4 h-4" />
                <span className="text-[11px] font-medium whitespace-nowrap">商品影片</span>
              </button>
            )}
          </div>
        </div>

        {/* Contiguous Purchase Module + Product Introduction */}
        <div className="lg:col-span-5 space-y-6">
          <div className="border-b border-zinc-200 pb-6">
            {/* Unboxed Metadata */}
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
              <span>{product.category}</span>
              <span aria-hidden="true">·</span>
              <span className={inStock ? 'text-emerald-900 font-medium' : 'text-red-700 font-medium'}>
                {inStock ? `現貨庫存 ${product.stock} 件` : '目前暫無庫存'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-semibold text-zinc-900 tracking-tight text-balance">
              {product.name}
            </h1>
            {product.subtitle && (
              <p className="text-sm sm:text-base text-zinc-600 mt-2 leading-relaxed">
                {product.subtitle}
              </p>
            )}

            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-2xl sm:text-3xl font-semibold text-zinc-900 tabular-nums">
                NT$ {product.price.toLocaleString('zh-TW')}
              </span>
              <span className="text-xs text-zinc-500">含稅價 · 滿 NT$ 2,000 免運</span>
            </div>
          </div>

          {/* Variants Selector */}
          {product.variants.length > 0 && (
            <div className="space-y-2.5">
              <span className="block text-xs font-semibold text-zinc-700">款式規格</span>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const active = selectedVariant === variant;
                  return (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => setSelectedVariant(variant)}
                      className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-emerald-950 text-white border-emerald-950'
                          : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-900'
                      }`}
                    >
                      {variant}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity & Desktop Purchase Actions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700">購買數量</span>
              <div className="inline-flex items-center border border-zinc-300 rounded-lg bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="減少數量"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-600 hover:text-zinc-900"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center text-sm font-semibold tabular-nums text-zinc-900">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))}
                  aria-label="增加數量"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-600 hover:text-zinc-900"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="hidden lg:grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={!inStock}
                onClick={() => handleAdd(false)}
                className="min-h-[48px] px-5 py-3 rounded-xl border border-zinc-900 bg-white hover:bg-zinc-100 text-zinc-900 font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {addedFeedback ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-800" />
                    <span>已加入購物車</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4" />
                    <span>加入購物車</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={!inStock}
                onClick={() => handleAdd(true)}
                className="min-h-[48px] px-5 py-3 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white font-medium text-sm transition-colors disabled:opacity-40"
              >
                立即結帳
              </button>
            </div>
          </div>

          {/* Shipping / Accommodation Assurance */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-zinc-100/80 border border-zinc-200/70 text-xs text-zinc-600">
            <div className="flex items-start gap-2.5">
              <Truck className="w-4 h-4 text-zinc-800 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-zinc-900">
                  {product.category === '旅館住宿' ? '電子住宿憑證即時發送' : '台灣本島快速出貨'}
                </p>
                <p className="mt-0.5 text-zinc-500">
                  {product.category === '旅館住宿'
                    ? '下單完成即核發專屬訂房序號'
                    : '工作日下午三點前下單當日寄出'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-zinc-800 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-zinc-900">
                  {product.category === '旅館住宿' ? '一年期彈性預約入住' : '七日鑑賞與原廠保固'}
                </p>
                <p className="mt-0.5 text-zinc-500">
                  {product.category === '旅館住宿'
                    ? '平假日皆可預約 · 未用可退費'
                    : '開立電子發票 · 安心售後服務'}
                </p>
              </div>
            </div>
          </div>

          {/* Product Introduction (商品介紹) */}
          <section className="pt-4 border-t border-zinc-200 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 mb-3">商品介紹</h2>
              <div className="text-sm sm:text-[15px] text-zinc-700 leading-relaxed whitespace-pre-line space-y-3">
                {product.description || '此商品由質物選研嚴選設計，兼具日常實用與器物美學。'}
              </div>
            </div>

            {product.highlights.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-2.5">設計亮點</h3>
                <ul className="space-y-2">
                  {product.highlights.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-sm text-zinc-700">
                      <Check className="w-4 h-4 text-emerald-900 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.specs.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 mb-2.5">商品規格明細</h3>
                <dl className="divide-y divide-zinc-200 border-y border-zinc-200 text-sm">
                  {product.specs.map((spec, idx) => (
                    <div key={idx} className="py-2.5 grid grid-cols-3 gap-4">
                      <dt className="text-zinc-500 font-medium">{spec.label}</dt>
                      <dd className="col-span-2 text-zinc-900">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Mobile Sticky Bottom Purchase Bar (<= 15% mobile sticky cap, replaces main bottom nav on PDP) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-4 py-2.5 pb-safe">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <span className="block text-[11px] text-zinc-500 leading-tight">小計金額</span>
            <span className="text-base font-semibold text-zinc-900 tabular-nums">
              NT$ {(product.price * quantity).toLocaleString('zh-TW')}
            </span>
          </div>

          <button
            type="button"
            disabled={!inStock}
            onClick={() => handleAdd(false)}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-zinc-900 bg-white text-zinc-900 text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-40 whitespace-nowrap"
          >
            {addedFeedback ? '已加入購物車' : '加入購物車'}
          </button>

          <button
            type="button"
            disabled={!inStock}
            onClick={() => handleAdd(true)}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-950 text-white text-sm font-medium active:scale-[0.98] transition-transform disabled:opacity-40 whitespace-nowrap"
          >
            立即購買
          </button>
        </div>
      </div>
    </div>
  );
}
