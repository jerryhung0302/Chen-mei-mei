import { Heart, Home, LayoutGrid, ShoppingBag, SlidersHorizontal, Search, User, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type AppView = 'home' | 'catalog' | 'craft' | 'detail' | 'admin';

interface NavbarProps {
  currentView: AppView;
  cartCount: number;
  favoriteCount: number;
  favoritesOpen: boolean;
  onNavigate: (view: AppView) => void;
  onOpenCart: () => void;
  onToggleFavorites: () => void;
  onFocusSearch: () => void;
  hideMobileBottomNav?: boolean;
}

export function Navbar({
  currentView,
  cartCount,
  favoriteCount,
  favoritesOpen,
  onNavigate,
  onOpenCart,
  onToggleFavorites,
  onFocusSearch,
  hideMobileBottomNav = false
}: NavbarProps) {
  const { user, memberProfile, isRegistered, openMemberModal } = useAuth();

  const navItems: { id: AppView; label: string }[] = [
    { id: 'home', label: '首頁精選' },
    { id: 'catalog', label: '全部商品' },
    { id: 'craft', label: '品牌工藝' },
    { id: 'admin', label: '後台管理' }
  ];

  const handleOpenMember = () => {
    if (user && !isRegistered) {
      openMemberModal('register');
    } else {
      openMemberModal('profile');
    }
  };

  return (
    <>
      {/* Desktop & Mobile Top Bar (<= 52px on mobile, 64px on desktop) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-[52px] md:h-16 flex items-center justify-between gap-2 md:gap-6">
          {/* Zone 1: Brand Logo & Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="text-base md:text-lg font-semibold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 min-h-[44px] flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 rounded"
          >
            <img
              src="/assets/aistudio/FB_IMG_1794753729819_545d87ba.jpg"
              alt="質物選研 ZHIWU Logo"
              className="w-8 h-8 md:w-9 md:h-9 rounded-full object-cover border border-zinc-200 shrink-0"
            />
            <span>
              質物選研<span className="hidden sm:inline"> ZHIWU</span>
            </span>
          </button>

          {/* Zone 2: Desktop 4 Single-line Nav Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
            {navItems.map((item) => {
              const isActive =
                currentView === item.id || (currentView === 'detail' && item.id === 'catalog');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`whitespace-nowrap shrink-0 py-1.5 transition-colors border-b-2 ${
                    isActive
                      ? 'text-zinc-900 border-emerald-900'
                      : 'border-transparent hover:text-zinc-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Search (mobile), Member, Favorites List Trigger, and Cart */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={onFocusSearch}
              aria-label="搜尋商品"
              className="md:hidden min-h-[44px] min-w-[40px] flex items-center justify-center text-zinc-700 hover:text-zinc-900 rounded-lg"
            >
              <Search className="w-4.5 h-4.5" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={handleOpenMember}
              aria-label={
                !user
                  ? '會員註冊／登入'
                  : !isRegistered
                    ? '完成會員註冊'
                    : `會員中心：${memberProfile?.displayName || ''}`
              }
              className={`min-h-[44px] md:min-h-[40px] px-2.5 md:px-3 py-2 rounded-lg border text-xs md:text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                user && !isRegistered
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : isRegistered
                    ? 'border-emerald-900/30 bg-emerald-50/70 text-emerald-950 hover:border-emerald-900/50'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900'
              }`}
            >
              {isRegistered && memberProfile?.photoUrl ? (
                <img
                  src={memberProfile.photoUrl}
                  alt={memberProfile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-4 h-4 rounded-full object-cover shrink-0"
                />
              ) : isRegistered ? (
                <UserCheck className="w-4 h-4 text-emerald-900 shrink-0" strokeWidth={1.85} />
              ) : (
                <User className="w-4 h-4 shrink-0" strokeWidth={1.85} />
              )}
              <span className="hidden sm:inline max-w-[110px] truncate">
                {!user
                  ? '註冊／登入'
                  : !isRegistered
                    ? '完成註冊'
                    : memberProfile?.displayName || '會員中心'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleFavorites}
              aria-expanded={favoritesOpen}
              aria-label={`收藏列表 (${favoriteCount})`}
              className={`min-h-[44px] md:min-h-[40px] px-2.5 md:px-3 py-2 rounded-lg border text-xs md:text-sm font-medium transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 ${
                favoritesOpen
                  ? 'border-rose-300 bg-rose-50 text-rose-800'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-zinc-900'
              }`}
            >
              <Heart
                className={`w-4 h-4 ${
                  favoriteCount > 0 ? 'fill-rose-600 text-rose-600' : 'text-zinc-600'
                }`}
                strokeWidth={1.85}
              />
              <span className="hidden sm:inline">收藏</span>
              <span className="tabular-nums font-semibold">({favoriteCount})</span>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              className="min-h-[44px] md:min-h-[40px] px-2.5 md:px-4 py-2 bg-emerald-950 text-white text-xs md:text-sm font-medium rounded-lg hover:bg-emerald-900 active:scale-[0.98] transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span className="hidden xs:inline sm:inline">購物車</span>
              <span className="tabular-nums font-semibold">({cartCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Tab Bar (56px height, thumb-zone ergonomics) */}
      {!hideMobileBottomNav && (
        <nav
          aria-label="行動版主導覽列"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-zinc-200 pb-safe"
        >
          <div className="grid grid-cols-4 h-14 items-center">
            <button
              type="button"
              onClick={() => onNavigate('home')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                currentView === 'home' ? 'text-emerald-950 font-semibold' : 'text-zinc-500'
              }`}
            >
              <Home className="w-5 h-5" strokeWidth={currentView === 'home' ? 2.2 : 1.75} />
              <span className="text-[11px] leading-none whitespace-nowrap">首頁</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                currentView === 'catalog' || currentView === 'detail'
                  ? 'text-emerald-950 font-semibold'
                  : 'text-zinc-500'
              }`}
            >
              <LayoutGrid
                className="w-5 h-5"
                strokeWidth={currentView === 'catalog' || currentView === 'detail' ? 2.2 : 1.75}
              />
              <span className="text-[11px] leading-none whitespace-nowrap">全部商品</span>
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              className="min-h-[44px] relative flex flex-col items-center justify-center gap-0.5 text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              <div className="relative">
                <ShoppingBag className="w-5 h-5" strokeWidth={1.75} />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-950 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-none whitespace-nowrap">購物車</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                currentView === 'admin' ? 'text-emerald-950 font-semibold' : 'text-zinc-500'
              }`}
            >
              <SlidersHorizontal
                className="w-5 h-5"
                strokeWidth={currentView === 'admin' ? 2.2 : 1.75}
              />
              <span className="text-[11px] leading-none whitespace-nowrap">後台管理</span>
            </button>
          </div>
        </nav>
      )}
    </>
  );
}
