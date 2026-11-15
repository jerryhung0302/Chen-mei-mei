import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  MapPin,
  Phone,
  Search,
  Truck,
  User
} from 'lucide-react';
import type { Order, OrderStatus } from '../types';
import { MediaImage } from './MediaImage';

interface AdminOrdersViewProps {
  orders: Order[];
  updatingOrderId?: string | null;
  onUpdateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
}

const ORDER_STATUSES: OrderStatus[] = ['待處理', '已出貨', '已完成'];

function normalizeOrderStatus(status: string): OrderStatus {
  if (status === '已出貨') return '已出貨';
  if (status === '已完成') return '已完成';
  return '待處理';
}

function formatOrderDate(value: string): string {
  if (!value) return '—';
  if (value.includes('T')) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('zh-TW');
  }
  return value;
}

export function AdminOrdersView({
  orders,
  updatingOrderId = null,
  onUpdateStatus
}: AdminOrdersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');

  const normalizedOrders = useMemo(
    () =>
      orders.map((o) => ({
        ...o,
        status: normalizeOrderStatus(o.status)
      })),
    [orders]
  );

  const stats = useMemo(() => {
    let pending = 0;
    let shipped = 0;
    let completed = 0;
    let totalRevenue = 0;

    for (const order of normalizedOrders) {
      totalRevenue += Number(order.total) || 0;
      if (order.status === '待處理') pending += 1;
      else if (order.status === '已出貨') shipped += 1;
      else if (order.status === '已完成') completed += 1;
    }

    return {
      total: normalizedOrders.length,
      pending,
      shipped,
      completed,
      totalRevenue
    };
  }, [normalizedOrders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return normalizedOrders.filter((order) => {
      const matchStatus = statusFilter === 'all' || order.status === statusFilter;
      if (!matchStatus) return false;
      if (!q) return true;
      const inItems = order.items.some(
        (item) =>
          item.name.toLowerCase().includes(q) || item.variant.toLowerCase().includes(q)
      );
      return (
        order.id.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.phone.toLowerCase().includes(q) ||
        order.address.toLowerCase().includes(q) ||
        inItems
      );
    });
  }, [normalizedOrders, searchQuery, statusFilter]);

  const getStatusStyle = (status: OrderStatus) => {
    if (status === '已完成') {
      return { text: 'text-emerald-900', dot: 'bg-emerald-700', Icon: CheckCircle2 };
    }
    if (status === '已出貨') {
      return { text: 'text-sky-900', dot: 'bg-sky-600', Icon: Truck };
    }
    return { text: 'text-amber-900', dot: 'bg-amber-600', Icon: Clock };
  };

  return (
    <div className="space-y-6">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-zinc-200 p-4 space-y-1">
          <p className="text-xs text-zinc-500 font-medium">全部訂單總覽</p>
          <p className="text-xl sm:text-2xl font-semibold text-zinc-900 tabular-nums">
            {stats.total} 筆
          </p>
          <p className="text-xs text-zinc-600 tabular-nums">
            累計總額 NT$ {stats.totalRevenue.toLocaleString('zh-TW')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === '待處理' ? 'all' : '待處理')}
          className={`text-left rounded-2xl border p-4 space-y-1 transition-colors ${
            statusFilter === '待處理'
              ? 'bg-amber-50/70 border-amber-300'
              : 'bg-white border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <p className="text-xs text-zinc-500 font-medium">待處理訂單</p>
          <p className="text-xl sm:text-2xl font-semibold text-amber-900 tabular-nums">
            {stats.pending} 筆
          </p>
          <p className="text-xs text-zinc-500">待確認備貨與安排出貨</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === '已出貨' ? 'all' : '已出貨')}
          className={`text-left rounded-2xl border p-4 space-y-1 transition-colors ${
            statusFilter === '已出貨'
              ? 'bg-sky-50/70 border-sky-300'
              : 'bg-white border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <p className="text-xs text-zinc-500 font-medium">已出貨訂單</p>
          <p className="text-xl sm:text-2xl font-semibold text-sky-900 tabular-nums">
            {stats.shipped} 筆
          </p>
          <p className="text-xs text-zinc-500">物流配送或超商取貨中</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === '已完成' ? 'all' : '已完成')}
          className={`text-left rounded-2xl border p-4 space-y-1 transition-colors ${
            statusFilter === '已完成'
              ? 'bg-emerald-50/70 border-emerald-300'
              : 'bg-white border-zinc-200 hover:border-zinc-300'
          }`}
        >
          <p className="text-xs text-zinc-500 font-medium">已完成訂單</p>
          <p className="text-xl sm:text-2xl font-semibold text-emerald-950 tabular-nums">
            {stats.completed} 筆
          </p>
          <p className="text-xs text-zinc-500">顧客已簽收並完成結案</p>
        </button>
      </div>

      {/* Search & Status Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋訂單編號、顧客姓名、手機或商品..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-900"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl overflow-x-auto no-scrollbar self-start sm:self-auto">
          {(
            [
              { id: 'all', label: `全部 (${stats.total})` },
              { id: '待處理', label: `待處理 (${stats.pending})` },
              { id: '已出貨', label: `已出貨 (${stats.shipped})` },
              { id: '已完成', label: `已完成 (${stats.completed})` }
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStatusFilter(opt.id)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
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

      {/* Order Cards */}
      {filteredOrders.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-zinc-200 space-y-2">
          <ClipboardList className="w-10 h-10 text-zinc-300 mx-auto" strokeWidth={1.5} />
          <p className="text-sm font-medium text-zinc-800">
            {normalizedOrders.length === 0 ? '目前尚無顧客下單紀錄' : '找不到符合篩選條件的訂單'}
          </p>
          <p className="text-xs text-zinc-500">
            {normalizedOrders.length === 0
              ? '顧客於前台完成結帳後，商品清單、金額與配送資訊將即時顯示於此。'
              : '請嘗試調整狀態篩選或清空搜尋關鍵字。'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const style = getStatusStyle(order.status);
            const StatusIcon = style.Icon;
            const isUpdating = updatingOrderId === order.id;

            return (
              <article
                key={order.id}
                className="bg-white rounded-2xl border border-zinc-200 overflow-hidden"
              >
                {/* Order Header */}
                <div className="px-4 sm:px-6 py-4 bg-zinc-50/70 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                        訂單 #{order.id}
                      </span>
                      <span className="text-zinc-300" aria-hidden="true">
                        |
                      </span>
                      <span className="text-zinc-500">{formatOrderDate(order.createdAt)}</span>
                      <span className="text-zinc-300" aria-hidden="true">
                        |
                      </span>
                      <span className="text-zinc-600 font-medium">
                        {order.memberUid ? '會員訂單' : '訪客訂單'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${style.text}`}>
                      <StatusIcon className="w-4 h-4" strokeWidth={1.85} />
                      <span>{order.status}</span>
                    </div>

                    <select
                      aria-label={`變更訂單 #${order.id} 狀態`}
                      disabled={isUpdating}
                      value={order.status}
                      onChange={(e) =>
                        void onUpdateStatus(order.id, e.target.value as OrderStatus)
                      }
                      className="min-h-[40px] px-3 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-900 disabled:opacity-50"
                    >
                      {ORDER_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Order Body: Customer Info + Itemized Product List */}
                <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: Customer & Logistics Details */}
                  <div className="lg:col-span-5 space-y-3 text-xs">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      顧客與收件明細
                    </h3>

                    <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-2.5">
                      <div className="flex items-start gap-2.5">
                        <User className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-zinc-500">收件人姓名</p>
                          <p className="text-sm font-medium text-zinc-900">{order.customerName}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <Phone className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-zinc-500">聯絡手機</p>
                          <p className="font-medium text-zinc-900 tabular-nums">{order.phone}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <CreditCard className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-zinc-500">配送與付款方式</p>
                          <p className="font-medium text-zinc-900">
                            {order.shippingMethod} · {order.paymentMethod}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-zinc-500">收件地址／取貨門市</p>
                          <p className="font-medium text-zinc-900 break-words">{order.address}</p>
                        </div>
                      </div>

                      {order.note && (
                        <div className="pt-2 border-t border-zinc-200/80">
                          <p className="text-zinc-500 mb-0.5">顧客備註</p>
                          <p className="text-zinc-800 whitespace-pre-line">{order.note}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Product Items & Financial Summary */}
                  <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        訂購商品清單（共 {order.items.reduce((s, i) => s + i.quantity, 0)} 件）
                      </h3>

                      <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                        {order.items.map((item, idx) => (
                          <li
                            key={`${item.productId}-${item.variant}-${idx}`}
                            className="p-3 bg-white flex items-center gap-3"
                          >
                            <div className="w-12 h-10 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200/70 shrink-0">
                              <MediaImage
                                src={item.image}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-900 truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-zinc-500">
                                規格：{item.variant} · 單價 NT$ {item.price.toLocaleString('zh-TW')} ×{' '}
                                <span className="tabular-nums font-medium text-zinc-700">
                                  {item.quantity}
                                </span>
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-zinc-900 tabular-nums shrink-0">
                              NT$ {(item.price * item.quantity).toLocaleString('zh-TW')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Totals & Quick Progression Actions */}
                    <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200/80 space-y-2 text-xs">
                      <div className="flex justify-between text-zinc-600">
                        <span>商品小計</span>
                        <span className="tabular-nums">
                          NT$ {order.subtotal.toLocaleString('zh-TW')}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-600">
                        <span>運費</span>
                        <span className="tabular-nums">
                          {order.shippingFee === 0
                            ? '免運費'
                            : `NT$ ${order.shippingFee.toLocaleString('zh-TW')}`}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-900">訂單總金額</span>
                        <span className="text-base sm:text-lg font-semibold text-emerald-950 tabular-nums">
                          NT$ {order.total.toLocaleString('zh-TW')}
                        </span>
                      </div>

                      {order.status !== '已完成' && (
                        <div className="pt-2 flex flex-wrap justify-end gap-2">
                          {order.status === '待處理' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => void onUpdateStatus(order.id, '已出貨')}
                              className="min-h-[38px] px-3.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>{isUpdating ? '更新中...' : '標記為已出貨'}</span>
                            </button>
                          )}
                          {order.status === '已出貨' && (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => void onUpdateStatus(order.id, '已完成')}
                              className="min-h-[38px] px-3.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isUpdating ? '更新中...' : '標記為已完成'}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
