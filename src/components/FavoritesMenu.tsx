import { Heart, ShoppingBag, Trash2, X } from 'lucide-react';
import type { Product } from '../types';
import { MediaImage } from './MediaImage';

interface FavoritesMenuProps {
  isOpen: boolean;
  favorites: Product[];
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onRemoveFavorite: (product: Product) => void;
}

export function FavoritesMenu({
  isOpen,
  favorites,
  onClose,
  onSelectProduct,
  onAddToCart,
  onRemoveFavorite
}: FavoritesMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:bg-black/15 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile Bottom Sheet (< md) & Desktop Navbar Dropdown (>= md) */}
      <div
        role="dialog"
        aria-label="我的收藏列表"
        className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:bottom-auto md:top-[68px] md:right-6 w-full md:w-[380px] bg-white rounded-t-3xl md:rounded-2xl border border-zinc-200 shadow-2xl flex flex-col max-h-[80vh] md:max-h-[70vh] overflow-hidden"
      >
        {/* Mobile grab handle */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-300" />
        </div>

        <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 fill-rose-600 text-rose-600" />
            <h2 className="text-sm font-semibold text-zinc-900">
              收藏列表 <span className="tabular-nums text-zinc-500 font-normal">({favorites.length})</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉收藏列表"
            className="min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 pb-safe">
          {favorites.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Heart className="w-8 h-8 text-zinc-300 mx-auto" strokeWidth={1.5} />
              <p className="text-sm font-medium text-zinc-800">尚未收藏任何商品</p>
              <p className="text-xs text-zinc-500">
                點擊商品卡片或介紹頁的心形按鈕，即可將喜愛的選品存放在此處。
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {favorites.map((product) => {
                const inStock = product.stock > 0;
                return (
                  <li key={product.id} className="py-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectProduct(product);
                        onClose();
                      }}
                      className="w-16 h-14 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200/70 shrink-0"
                    >
                      <MediaImage
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProduct(product);
                          onClose();
                        }}
                        className="text-left w-full"
                      >
                        <p className="text-sm font-semibold text-zinc-900 truncate hover:text-emerald-950">
                          {product.name}
                        </p>
                      </button>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                        <span className="font-semibold text-zinc-900 tabular-nums">
                          NT$ {product.price.toLocaleString('zh-TW')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{inStock ? '現貨' : '補貨中'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={!inStock}
                        onClick={() => onAddToCart(product)}
                        aria-label={`將 ${product.name} 加入購物車`}
                        className="min-h-[40px] min-w-[40px] rounded-lg bg-zinc-100 hover:bg-emerald-950 text-zinc-800 hover:text-white disabled:opacity-40 flex items-center justify-center transition-colors"
                      >
                        <ShoppingBag className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveFavorite(product)}
                        aria-label={`移除收藏 ${product.name}`}
                        className="min-h-[40px] min-w-[40px] rounded-lg text-zinc-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
