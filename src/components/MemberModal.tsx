import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  Package,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatFirestoreTimestamp } from '../lib/firebase';

interface MemberModalProps {
  onNavigateAdmin: () => void;
}

export function MemberModal({ onNavigateAdmin }: MemberModalProps) {
  const {
    user,
    memberProfile,
    memberLoading,
    isRegistered,
    isAdmin,
    memberOrders,
    authError,
    memberModalOpen,
    memberModalTab,
    openMemberModal,
    closeMemberModal,
    clearAuthError,
    signInWithGoogle,
    logout,
    registerMember,
    updateMemberProfile
  } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    if (!memberModalOpen) return;
    setFormError('');
    setFormSuccess('');
    if (memberProfile) {
      setDisplayName(memberProfile.displayName);
      setPhone(memberProfile.phone);
      setDefaultAddress(memberProfile.defaultAddress);
      setAgreedTerms(memberProfile.agreedTerms);
    } else if (user) {
      setDisplayName(user.displayName || '');
      setPhone('');
      setDefaultAddress('');
      setAgreedTerms(true);
    }
  }, [memberModalOpen, memberProfile, user]);

  if (!memberModalOpen) return null;

  const handleGoogleSignIn = async () => {
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      await registerMember({
        displayName,
        phone,
        defaultAddress,
        agreedTerms
      });
      setFormSuccess('會員註冊成功！歡迎加入質物選研會員。');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '註冊失敗，請檢查輸入資料');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);
    try {
      await updateMemberProfile({
        displayName,
        phone,
        defaultAddress
      });
      setFormSuccess('會員資料已更新並同步儲存');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '更新失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  const activeTab = !isRegistered ? 'register' : memberModalTab === 'orders' ? 'orders' : 'profile';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs"
        onClick={closeMemberModal}
      />

      <div className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-200">
        {/* Mobile grab handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-300" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/assets/aistudio/FB_IMG_1794753729819_545d87ba.jpg"
              alt="質物選研 ZHIWU Logo"
              className="w-8 h-8 rounded-full object-cover border border-zinc-200 shrink-0"
            />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-zinc-900 truncate">
                {!user
                  ? '會員註冊與登入'
                  : !isRegistered
                    ? '完成會員註冊資料'
                    : '質物選研 · 會員中心'}
              </h2>
              <p className="text-xs text-zinc-500 truncate">
                {user ? user.email : '登入後可同步收藏、快速結帳與查詢訂單'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeMemberModal}
            aria-label="關閉會員視窗"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 pb-safe">
          {(authError || formError) && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{formError || authError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-800" />
              <span className="flex-1">{formSuccess}</span>
            </div>
          )}

          {/* STATE 1: Not signed in */}
          {!user && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5 text-xs text-zinc-600 leading-relaxed">
                <p className="text-sm font-semibold text-zinc-900">註冊成為質物選研會員</p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>結帳自動帶入收件姓名、手機與常用配送地址</li>
                  <li>跨裝置雲端同步商品收藏與歷史訂單進度</li>
                  <li>管理團隊成員可於登入後申請或驗證後台權限</li>
                </ul>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={handleGoogleSignIn}
                className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>{submitting ? '驗證視窗開啟中...' : '使用 Google 帳號登入／註冊'}</span>
              </button>
            </div>
          )}

          {/* STATE 2: Signed in, loading member profile */}
          {user && memberLoading && (
            <div className="py-12 text-center text-xs text-zinc-500">
              正在讀取會員資料...
            </div>
          )}

          {/* STATE 3: Signed in, needs to complete registration */}
          {user && !memberLoading && !isRegistered && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">已驗證 Google 帳號</p>
                  <p className="text-sm font-medium text-zinc-900 truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearAuthError();
                    void logout();
                  }}
                  className="text-xs font-medium text-zinc-600 hover:text-zinc-900 underline underline-offset-4 shrink-0"
                >
                  更換帳號
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  會員姓名／稱呼 *
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：陳宇軒"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  聯絡手機號碼 *
                </label>
                <input
                  type="tel"
                  required
                  minLength={8}
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="例如：0912-345-678"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  常用收件地址／超商門市（選填）
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={defaultAddress}
                  onChange={(e) => setDefaultAddress(e.target.value)}
                  placeholder="例如：台北市大安區仁愛路四段..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-zinc-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-emerald-950 rounded shrink-0"
                />
                <span>
                  我已閱讀並同意《質物選研會員服務條款》與個人資料隱私保護政策
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {submitting ? '會員註冊送出中...' : '確認送出並完成註冊'}
              </button>
            </form>
          )}

          {/* STATE 4: Registered Member Center */}
          {user && !memberLoading && isRegistered && memberProfile && (
            <div className="space-y-5">
              {/* Tabs */}
              <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => openMemberModal('profile')}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'profile'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  會員基本資料
                </button>
                <button
                  type="button"
                  onClick={() => openMemberModal('orders')}
                  className={`flex-1 min-h-[40px] px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'orders'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  我的訂單 ({memberOrders.length})
                </button>
              </div>

              {activeTab === 'profile' && (
                <div className="space-y-4">
                  {/* Account Summary Card */}
                  <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {memberProfile.photoUrl ? (
                        <img
                          src={memberProfile.photoUrl}
                          alt={memberProfile.displayName}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover border border-zinc-200 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-emerald-950 text-white flex items-center justify-center shrink-0">
                          <UserCheck className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">
                          {memberProfile.displayName}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {memberProfile.memberTier} ·{' '}
                          {memberProfile.status === 'active' ? '帳號正常啟用' : '帳號已停用'}
                          {isAdmin ? ' · 後台管理員' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  {memberProfile.status === 'suspended' && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      您的會員帳號目前處於停用狀態，無法修改資料或建立雲端訂單，如有疑問請聯繫客服。
                    </div>
                  )}

                  <form onSubmit={handleUpdateSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        會員姓名／稱呼 *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={50}
                        disabled={memberProfile.status !== 'active'}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900 disabled:bg-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        聯絡手機號碼 *
                      </label>
                      <input
                        type="tel"
                        required
                        minLength={8}
                        maxLength={20}
                        disabled={memberProfile.status !== 'active'}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900 disabled:bg-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        常用收件地址／超商門市
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        disabled={memberProfile.status !== 'active'}
                        value={defaultAddress}
                        onChange={(e) => setDefaultAddress(e.target.value)}
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900 disabled:bg-zinc-100"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || memberProfile.status !== 'active'}
                      className="w-full min-h-[46px] rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {submitting ? '儲存變更中...' : '儲存會員資料'}
                    </button>
                  </form>

                  <div className="pt-3 border-t border-zinc-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          closeMemberModal();
                          onNavigateAdmin();
                        }}
                        className="min-h-[44px] px-4 rounded-xl border border-emerald-900/30 bg-emerald-50 text-emerald-950 text-xs font-semibold flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>進入後台管理系統</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        void logout();
                        closeMemberModal();
                      }}
                      className="min-h-[44px] px-4 rounded-xl border border-zinc-300 bg-white text-zinc-700 hover:text-zinc-900 text-xs font-medium flex items-center justify-center gap-1.5 sm:ml-auto"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>登出帳號</span>
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'orders' && (
                <div className="space-y-3">
                  {memberOrders.length === 0 ? (
                    <div className="py-12 text-center bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                      <Package className="w-8 h-8 text-zinc-300 mx-auto" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-zinc-800">尚無會員訂單紀錄</p>
                      <p className="text-xs text-zinc-500">完成結帳後，您的訂單明細與出貨進度將顯示於此處</p>
                    </div>
                  ) : (
                    memberOrders.map((order) => (
                      <div
                        key={order.orderId}
                        className="p-4 rounded-xl border border-zinc-200 bg-white space-y-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-2">
                          <div>
                            <span className="font-semibold text-zinc-900 tabular-nums">
                              #{order.orderId}
                            </span>
                            <span className="text-zinc-400 mx-1.5">·</span>
                            <span className="text-zinc-500">
                              {formatFirestoreTimestamp(order.createdAt)}
                            </span>
                          </div>
                          <span className="font-semibold text-emerald-950">{order.status}</span>
                        </div>
                        <div className="space-y-1 text-zinc-600">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between gap-2">
                              <span className="truncate">
                                {item.name}（{item.variant}）× {item.quantity}
                              </span>
                              <span className="tabular-nums shrink-0">
                                NT$ {(item.price * item.quantity).toLocaleString('zh-TW')}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-zinc-900 font-semibold">
                          <span className="text-zinc-500 font-normal">
                            {order.shippingMethod} · {order.paymentMethod}
                          </span>
                          <span className="tabular-nums text-sm">
                            NT$ {order.total.toLocaleString('zh-TW')}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
