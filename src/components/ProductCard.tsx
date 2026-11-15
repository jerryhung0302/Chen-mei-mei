import { Heart, Play, Plus } from 'lucide-react';
import type { Product } from '../types';
import { MediaImage } from './MediaImage';

interface ProductCardProps {
  product: Product;
  isFavorite: boolean;
  onSelect: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onToggleFavorite: (product: Product) => void;
}

export function ProductCard({
  product,
  isFavorite,
  onSelect,
  onQuickAdd,
  onToggleFavorite
}: ProductCardProps) {
  const coverImage = product.images[0] || '';
  const hasVideo = Boolean(product.videoUrl);
  const inStock = product.stock > 0;

  return (
    <article className="group bg-white rounded-xl border border-zinc-200/80 overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-zinc-900/5">
      <div className="relative aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
        <button
          type="button"
          onClick={() => onSelect(product)}
          className="w-full h-full block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          <MediaImage
            src={coverImage}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </button>

        <button
          type="button"
          onClick={() => onToggleFavorite(product)}
          aria-label={isFavorite ? `取消收藏 ${product.name}` : `收藏 ${product.name}`}
          aria-pressed={isFavorite}
          className="absolute top-2 right-2 z-10 min-h-[40px] min-w-[40px] rounded-full bg-white/90 backdrop-blur-xs hover:bg-white shadow-xs flex items-center justify-center transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              isFavorite ? 'fill-rose-600 text-rose-600' : 'text-zinc-700'
            }`}
            strokeWidth={1.9}
          />
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          {/* Unboxed metadata with typographic separator (no pill spam) */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-500 mb-1.5">
            <span>{product.category}</span>
            <span aria-hidden="true">·</span>
            <span className={inStock ? 'text-zinc-600' : 'text-red-700 font-medium'}>
              {inStock ? '現貨供應' : '補貨中'}
            </span>
            {hasVideo && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-900 font-medium">
                  <Play className="w-3 h-3 fill-current" />
                  商品影片
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSelect(product)}
            className="text-left w-full focus-visible:outline-none"
          >
            <h3 className="text-base font-semibold text-zinc-900 leading-snug line-clamp-1 group-hover:text-emerald-950 transition-colors">
              {product.name}
            </h3>
            <p className="text-xs sm:text-sm text-zinc-500 mt-1 line-clamp-1">
              {product.subtitle || '台灣設計質感選物'}
            </p>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-zinc-100">
          <span className="text-base font-semibold text-zinc-900 tabular-nums whitespace-nowrap">
            NT$ {product.price.toLocaleString('zh-TW')}
          </span>

          <button
            type="button"
            disabled={!inStock}
            onClick={() => onQuickAdd(product)}
            aria-label={`將 ${product.name} 加入購物車`}
            className="min-h-[40px] sm:min-h-[38px] px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-emerald-950 text-zinc-900 hover:text-white disabled:opacity-40 disabled:pointer-events-none text-xs font-medium transition-colors flex items-center gap-1 shrink-0 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>加入</span>
          </button>
        </div>
      </div>
    </article>
  );
}
