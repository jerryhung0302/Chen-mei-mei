import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Search, ShieldCheck, Sparkles, Truck } from 'lucide-react';
import type { CartItem, Order, Product, ProductCategory } from './types';
import { Navbar, type AppView } from './components/Navbar';
import { ProductCard } from './components/ProductCard';
import { ProductDetailView } from './components/ProductDetailView';
import { CartDrawer } from './components/CartDrawer';
import { FavoritesMenu } from './components/FavoritesMenu';
import { AdminDashboard } from './components/AdminDashboard';
import { MediaImage } from './components/MediaImage';
import {
  BackendUnavailableError,
  getLocalOrders,
  getLocalProducts,
  parseApiJson,
  setLocalOrders,
  setLocalProducts
} from './lib/apiClient';

const HERO_IMAGE = '/src/assets/images/hero_living_object_1794751851954.jpg';
const CATEGORIES: ProductCategory[] = ['全部', '旅館住宿', '居家燈飾', '器皿生活', '香氛保養', '聲學配件'];
const CART_STORAGE_KEY = 'zhiwu_cart_v1';
const FAVORITES_STORAGE_KEY = 'zhiwu_favorites_v1';

export default function App() {
  const [view, setView] = useState<AppView>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [cartToast, setCartToast] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const catalogSectionRef = useRef<HTMLElement>(null);
  const craftSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteIds));
    } catch {
      // ignore storage quota errors
    }
  }, [favoriteIds]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [prodRes, orderRes] = await Promise.all([
        fetch('/api/products', { credentials: 'same-origin' }),
        fetch('/api/orders', { credentials: 'same-origin' })
      ]);

      let prodData: Product[];
      try {
        prodData = await parseApiJson<Product[]>(prodRes, '無法載入商品資料');
        setLocalProducts(prodData);
      } catch (err) {
        if (err instanceof BackendUnavailableError) {
          prodData = getLocalProducts();
        } else {
          throw err;
        }
      }
      setProducts(prodData);

      try {
        const orderData = await parseApiJson<Order[]>(orderRes, '無法載入訂單資料');
        setOrders(orderData);
        setLocalOrders(orderData);
      } catch {
        setOrders(getLocalOrders());
      }

      // Sync currently viewed product if it was edited
      setSelectedProduct((current) => {
        if (!current) return null;
        return prodData.find((p) => p.id === current.id) || null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '資料讀取發生錯誤');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const publishedProducts = products.filter((p) => p.published);

  const filteredProducts = publishedProducts
    .filter((p) => {
      const matchCategory = selectedCategory === '全部' || p.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.category.includes(q);
      return matchCategory && matchQuery;
    })
    .sort((a, b) => {
      const aPri = a.category === '旅館住宿' ? 0 : 1;
      const bPri = b.category === '旅館住宿' ? 0 : 1;
      return aPri - bPri;
    });

  const handleNavigate = (nextView: AppView) => {
    if (nextView === 'craft') {
      setView('home');
      setTimeout(() => {
        craftSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
      return;
    }
    setView(nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFocusSearch = () => {
    if (view !== 'catalog' && view !== 'home') {
      setView('catalog');
    }
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleOpenProduct = (product: Product) => {
    setSelectedProduct(product);
    setView('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddToCart = (
    product: Product,
    variant = product.variants[0] || '標準款式',
    quantity = 1,
    openDrawer = false
  ) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.productId === product.id && item.variant === variant
      );
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.price,
          image: product.images[0] || '',
          variant,
          quantity
        }
      ];
    });

    if (openDrawer) {
      setCartOpen(true);
    } else {
      setCartToast(`已將「${product.name}」加入購物車`);
      setTimeout(() => setCartToast(null), 2400);
    }
  };

  const handleUpdateQty = (productId: string, variant: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.productId === productId && item.variant === variant
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveItem = (productId: string, variant: string) => {
    setCart((prev) =>
      prev.filter((item) => !(item.productId === productId && item.variant === variant))
    );
  };

  const toggleFavorite = (product: Product) => {
    setFavoriteIds((prev) => {
      const exists = prev.includes(product.id);
      if (exists) {
        setCartToast(`已取消收藏「${product.name}」`);
        setTimeout(() => setCartToast(null), 2000);
        return prev.filter((id) => id !== product.id);
      }
      setCartToast(`已收藏「${product.name}」`);
      setTimeout(() => setCartToast(null), 2000);
      return [product.id, ...prev];
    });
  };

  const favoriteProducts = publishedProducts.filter((p) => favoriteIds.includes(p.id));
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900">
      <Navbar
        currentView={view}
        cartCount={cartCount}
        favoriteCount={favoriteProducts.length}
        favoritesOpen={favoritesOpen}
        onNavigate={handleNavigate}
        onOpenCart={() => {
          setFavoritesOpen(false);
          setCartOpen(true);
        }}
        onToggleFavorites={() => {
          setCartOpen(false);
          setFavoritesOpen((prev) => !prev);
        }}
        onFocusSearch={handleFocusSearch}
        hideMobileBottomNav={view === 'detail'}
      />

      {/* Non-intrusive Cart Toast */}
      {cartToast && (
        <div
          role="status"
          className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs sm:text-sm font-medium shadow-lg flex items-center gap-2 whitespace-nowrap"
        >
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{cartToast}</span>
          <button
            type="button"
            onClick={() => {
              setCartToast(null);
              setCartOpen(true);
            }}
            className="ml-1 underline underline-offset-4 text-emerald-300"
          >
            查看
          </button>
        </div>
      )}

      <main className="flex-1">
        {/* STOREFRONT HOME */}
        {view === 'home' && (
          <div className="pb-20 md:pb-0">
            {/* 1. Storefront Hero */}
            <section className="bg-white border-b border-zinc-200/80">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                  <div className="lg:col-span-5 flex flex-col justify-center space-y-5">
                    <p className="text-xs font-medium text-zinc-500 tracking-wide">
                      2026 秋冬器物誌 · 台灣原創生活選品
                    </p>
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-zinc-900 leading-[1.18] tracking-tight text-balance">
                      讓光線、聲響與手澤器物，回到日常生活的恰當比例
                    </h1>
                    <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-xl">
                      質物選研嚴選台灣工藝陶瓷燈飾、手沖玻璃器皿、天然植物芳療與桌上型聲學裝置。每一件作品皆附有完整材質履歷與實拍影音介紹。
                    </p>
                    <div className="flex flex-wrap items-center gap-4 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          catalogSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                        }
                        className="min-h-[48px] px-6 py-3 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors inline-flex items-center gap-2"
                      >
                        <span>瀏覽精選商品</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleNavigate('admin')}
                        className="min-h-[44px] px-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 underline underline-offset-4"
                      >
                        管理後台商品上稿
                      </button>
                    </div>
                  </div>

                  <div className="lg:col-span-7">
                    <div className="aspect-[16/9] lg:h-full lg:min-h-[380px] w-full rounded-2xl overflow-hidden bg-zinc-100 border border-zinc-200/70">
                      <MediaImage
                        src={HERO_IMAGE}
                        alt="質物選研當代居家器物陳列"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Featured Collection Grid */}
            <section ref={catalogSectionRef} className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900">精選商品介紹</h2>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                    點擊任一商品即可查看完整圖文介紹、設計規格與實拍介紹影片
                  </p>
                </div>

                {/* Search Input */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜尋商品名稱..."
                    className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                  />
                </div>
              </div>

              {/* Interactive Category Filter Bar (Scrollable on Mobile) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {CATEGORIES.map((category) => {
                  const active = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-emerald-950 text-white'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>

              {/* Product Grid */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="bg-white rounded-xl border border-zinc-200 overflow-hidden animate-pulse"
                    >
                      <div className="aspect-[4/3] bg-zinc-200" />
                      <div className="p-4 space-y-2.5">
                        <div className="h-3 bg-zinc-200 rounded w-1/2" />
                        <div className="h-4 bg-zinc-200 rounded w-3/4" />
                        <div className="h-4 bg-zinc-200 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : loadError ? (
                <div className="p-8 rounded-2xl bg-white border border-red-200 text-center space-y-3">
                  <p className="text-sm text-red-700 font-medium">{loadError}</p>
                  <button
                    type="button"
                    onClick={fetchData}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-zinc-900 text-white text-xs font-medium"
                  >
                    重新載入
                  </button>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-12 rounded-2xl bg-white border border-zinc-200 text-center space-y-2">
                  <p className="text-sm font-medium text-zinc-800">找不到符合條件的上架商品</p>
                  <p className="text-xs text-zinc-500">
                    您可以切換分類篩選，或前往後台管理系統新增上架商品。
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isFavorite={favoriteIds.includes(product.id)}
                      onSelect={handleOpenProduct}
                      onQuickAdd={(p) => handleAddToCart(p)}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 3. Story / Craftsmanship Section */}
            <section ref={craftSectionRef} className="bg-white border-t border-zinc-200">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
                <div className="max-w-2xl mb-8">
                  <h2 className="text-xl sm:text-2xl font-semibold text-zinc-900">
                    實拍影音履歷與台灣職人共創
                  </h2>
                  <p className="text-sm text-zinc-600 mt-2 leading-relaxed">
                    不同於一般電商僅以靜態修圖呈現，我們堅持在後台商品上稿時附上原物實拍圖片與細節影片，讓每位顧客在下單前都能清楚看見材質紋理、燈光色溫與真實比例。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                    <Sparkles className="w-5 h-5 text-emerald-900" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-zinc-900">01. 在地窯燒與手工工藝</h3>
                    <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                      與鶯歌陶藝、新竹玻璃與台北工業設計團隊深度合作，保留器物手工打磨與溫潤質感。
                    </p>
                  </div>
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                    <Truck className="w-5 h-5 text-emerald-900" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-zinc-900">02. 全台滿兩千免運配送</h3>
                    <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                      支援宅配到府、7-ELEVEN 與全家超商取貨，抗震環保包材妥善守護每件易碎器皿。
                    </p>
                  </div>
                  <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-900" strokeWidth={1.75} />
                    <h3 className="text-sm font-semibold text-zinc-900">03. 七日鑑賞與完整保固</h3>
                    <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed">
                      所有電子與聲學產品均享台灣原廠保固與一對一專人售後檢修諮詢服務。
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* CATALOG VIEW */}
        {view === 'catalog' && (
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24 md:pb-16 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-200 pb-5">
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-zinc-900">全部選品目錄</h1>
                <p className="text-xs sm:text-sm text-zinc-500 mt-1">
                  共 {filteredProducts.length} 件上架商品
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋商品名稱、材質或分類..."
                  className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {CATEGORIES.map((category) => {
                const active = selectedCategory === category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setSelectedCategory(category)}
                    className={`min-h-[40px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-emerald-950 text-white'
                        : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400'
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-12 rounded-2xl bg-white border border-zinc-200 text-center space-y-2">
                <p className="text-sm font-medium text-zinc-800">沒有找到符合搜尋條件的商品</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('全部');
                    setSearchQuery('');
                  }}
                  className="text-xs font-medium text-emerald-900 underline underline-offset-4"
                >
                  重設篩選條件
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isFavorite={favoriteIds.includes(product.id)}
                    onSelect={handleOpenProduct}
                    onQuickAdd={(p) => handleAddToCart(p)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* PRODUCT INTRODUCTION / DETAIL VIEW */}
        {view === 'detail' && selectedProduct && (
          <ProductDetailView
            product={selectedProduct}
            isFavorite={favoriteIds.includes(selectedProduct.id)}
            onBack={() => handleNavigate('catalog')}
            onAddToCart={handleAddToCart}
            onToggleFavorite={toggleFavorite}
          />
        )}

        {/* BACKEND ADMIN CMS */}
        {view === 'admin' && (
          <AdminDashboard
            products={products}
            orders={orders}
            onRefresh={fetchData}
            onPreviewProduct={(product) => handleOpenProduct(product)}
          />
        )}
      </main>

      {/* Clean Quiet Footer */}
      {view !== 'detail' && (
        <footer className="bg-white border-t border-zinc-200 pb-20 md:pb-8 pt-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-3">
              <img
                src="/assets/aistudio/FB_IMG_1794753729819_545d87ba.jpg"
                alt="質物選研 ZHIWU Logo"
                className="w-9 h-9 rounded-full object-cover border border-zinc-200 shrink-0"
              />
              <div>
                <p className="font-semibold text-zinc-900">質物選研 ZHIWU SELECT</p>
                <p className="mt-0.5">台北市大安區仁愛路四段 · 週一至週五 10:00–18:00 客服服務</p>
              </div>
            </div>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => handleNavigate('home')}
                className="hover:text-zinc-900"
              >
                首頁精選
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('catalog')}
                className="hover:text-zinc-900"
              >
                全部商品
              </button>
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className="hover:text-zinc-900"
              >
                後台商品上稿
              </button>
            </div>
          </div>
        </footer>
      )}

      {/* Favorites List Dropdown / Mobile Sheet */}
      <FavoritesMenu
        isOpen={favoritesOpen}
        favorites={favoriteProducts}
        onClose={() => setFavoritesOpen(false)}
        onSelectProduct={handleOpenProduct}
        onAddToCart={(p) => handleAddToCart(p)}
        onRemoveFavorite={toggleFavorite}
      />

      {/* Shopping Cart & Checkout Drawer */}
      <CartDrawer
        isOpen={cartOpen}
        items={cart}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={() => setCart([])}
        onOrderCreated={() => {
          fetchData();
        }}
      />
    </div>
  );
}
