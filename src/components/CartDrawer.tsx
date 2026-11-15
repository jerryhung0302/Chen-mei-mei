import { useState } from 'react';
import { CheckCircle2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartItem, Order, PaymentMethod, ShippingMethod } from '../types';
import { MediaImage } from './MediaImage';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (productId: string, variant: string, delta: number) => void;
  onRemoveItem: (productId: string, variant: string) => void;
  onClearCart: () => void;
  onOrderCreated: (order: Order) => void;
}

export function CartDrawer({
  isOpen,
  items,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderCreated
}: CartDrawerProps) {
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>('宅配到府');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('貨到付款');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const freeShippingThreshold = 2000;
  const shippingFee = subtotal === 0 || subtotal >= freeShippingThreshold ? 0 : 120;
  const total = subtotal + shippingFee;
  const remainingForFree = Math.max(0, freeShippingThreshold - subtotal);

  const handleClose = () => {
    if (step === 'success') {
      setStep('cart');
      setConfirmedOrder(null);
    }
    setErrorMsg('');
    onClose();
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !address.trim()) {
      setErrorMsg('請填寫完整的收件人姓名、手機號碼與收件地址／門市');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          phone,
          shippingMethod,
          paymentMethod,
          address,
          note,
          items
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '訂單建立失敗');
      }
      setConfirmedOrder(data as Order);
      onOrderCreated(data as Order);
      onClearCart();
      setStep('success');
      setCustomerName('');
      setPhone('');
      setAddress('');
      setNote('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '訂單送出時發生錯誤');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end items-end sm:items-stretch">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
      />

      {/* Drawer Panel (Bottom sheet on mobile, right panel on desktop) */}
      <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none h-[88vh] sm:h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Mobile grab handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-zinc-300" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">
            {step === 'cart' && `購物車 (${items.reduce((s, i) => s + i.quantity, 0)})`}
            {step === 'checkout' && '填寫配送與付款資訊'}
            {step === 'success' && '訂單已確認成立'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="關閉購物車"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-zinc-500 hover:text-zinc-900 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <ShoppingBag className="w-10 h-10 text-zinc-300 mb-3" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-zinc-800">您的購物車目前是空的</p>
                  <p className="text-xs text-zinc-500 mt-1">探索質物選研的器物、燈飾與日常選品</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Free shipping indicator */}
                  <div className="p-3 rounded-xl bg-zinc-100 text-xs text-zinc-700">
                    {remainingForFree === 0 ? (
                      <span className="font-medium text-emerald-900">
                        已達 NT$ 2,000 免運門檻，本筆訂單享台灣本島免運費
                      </span>
                    ) : (
                      <span>
                        再消費{' '}
                        <strong className="tabular-nums text-zinc-900">
                          NT$ {remainingForFree.toLocaleString('zh-TW')}
                        </strong>{' '}
                        即可享免運優惠
                      </span>
                    )}
                  </div>

                  {/* Cart Items */}
                  <ul className="divide-y divide-zinc-200">
                    {items.map((item) => (
                      <li
                        key={`${item.productId}-${item.variant}`}
                        className="py-4 flex gap-3.5 items-start"
                      >
                        <div className="w-20 h-16 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200/70">
                          <MediaImage
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold text-zinc-900 truncate">
                              {item.name}
                            </h3>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(item.productId, item.variant)}
                              aria-label={`移除 ${item.name}`}
                              className="text-zinc-400 hover:text-red-600 p-1 -mr-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">{item.variant}</p>

                          <div className="mt-2.5 flex items-center justify-between">
                            <div className="inline-flex items-center border border-zinc-200 rounded-lg">
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.productId, item.variant, -1)}
                                aria-label="減少數量"
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-600"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-7 text-center text-xs font-semibold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.productId, item.variant, 1)}
                                aria-label="增加數量"
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-zinc-600"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                              NT$ {(item.price * item.quantity).toLocaleString('zh-TW')}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handleSubmitOrder} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  收件人姓名 *
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="例如：陳宇軒"
                  className="w-full min-h-[44px] px-3.5 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  聯絡手機 *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="例如：0912-345-678"
                  className="w-full min-h-[44px] px-3.5 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  配送方式
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['宅配到府', '7-ELEVEN 超商取貨', '全家店到店'] as ShippingMethod[]).map(
                    (method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setShippingMethod(method)}
                        className={`min-h-[44px] px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                          shippingMethod === method
                            ? 'bg-emerald-950 text-white border-emerald-950'
                            : 'bg-white text-zinc-700 border-zinc-300'
                        }`}
                      >
                        {method === '7-ELEVEN 超商取貨' ? '7-11 取貨' : method}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  付款方式
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['貨到付款', '信用卡一次付清', 'LINE Pay'] as PaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`min-h-[44px] px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        paymentMethod === method
                          ? 'bg-emerald-950 text-white border-emerald-950'
                          : 'bg-white text-zinc-700 border-zinc-300'
                      }`}
                    >
                      {method === '信用卡一次付清' ? '信用卡' : method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  {shippingMethod === '宅配到府' ? '收件地址 *' : '取貨門市名稱／店號 *'}
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={
                    shippingMethod === '宅配到府'
                      ? '台北市大安區忠孝東路四段...'
                      : '請輸入門市名稱或店號'
                  }
                  className="w-full min-h-[44px] px-3.5 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  訂單備註（選填）
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="配送時段或禮物包裝需求"
                  className="w-full p-3 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
                />
              </div>
            </form>
          )}

          {step === 'success' && confirmedOrder && (
            <div className="py-6 space-y-5">
              <div className="flex flex-col items-center text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-900 mb-3" strokeWidth={1.75} />
                <h3 className="text-lg font-semibold text-zinc-900">
                  訂單 #{confirmedOrder.id} 已完成建立
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  我們已收到您的訂單，將盡快為您安排備貨與出貨事宜。
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">收件人</span>
                  <span className="font-medium text-zinc-900">
                    {confirmedOrder.customerName} ({confirmedOrder.phone})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">配送與付款</span>
                  <span className="font-medium text-zinc-900">
                    {confirmedOrder.shippingMethod} · {confirmedOrder.paymentMethod}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500 shrink-0">收件地點</span>
                  <span className="font-medium text-zinc-900 text-right">
                    {confirmedOrder.address}
                  </span>
                </div>
                <div className="pt-2 border-t border-zinc-200 flex justify-between text-sm font-semibold text-zinc-900">
                  <span>應付總計</span>
                  <span className="tabular-nums">
                    NT$ {confirmedOrder.total.toLocaleString('zh-TW')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {items.length > 0 && step !== 'success' && (
          <div className="p-5 border-t border-zinc-200 bg-zinc-50/80 pb-safe space-y-3">
            <div className="space-y-1 text-xs text-zinc-600">
              <div className="flex justify-between">
                <span>商品小計</span>
                <span className="tabular-nums">NT$ {subtotal.toLocaleString('zh-TW')}</span>
              </div>
              <div className="flex justify-between">
                <span>運費</span>
                <span className="tabular-nums">
                  {shippingFee === 0 ? '免運費' : `NT$ ${shippingFee}`}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-zinc-900 pt-1">
                <span>總計金額</span>
                <span className="tabular-nums">NT$ {total.toLocaleString('zh-TW')}</span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="w-full min-h-[48px] rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors"
              >
                前往結帳
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="min-h-[48px] rounded-xl border border-zinc-300 bg-white text-zinc-800 text-sm font-medium"
                >
                  返回
                </button>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={submitting}
                  className="col-span-2 min-h-[48px] rounded-xl bg-emerald-950 hover:bg-emerald-900 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? '訂單送出中...' : '確認送出訂單'}
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div className="p-5 border-t border-zinc-200 pb-safe">
            <button
              type="button"
              onClick={handleClose}
              className="w-full min-h-[48px] rounded-xl bg-emerald-950 text-white text-sm font-medium"
            >
              繼續逛逛選品
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
