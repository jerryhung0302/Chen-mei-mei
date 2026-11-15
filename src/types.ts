export type ProductCategory = '全部' | '旅館住宿' | '居家燈飾' | '器皿生活' | '香氛保養' | '聲學配件';

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  subtitle: string;
  category: Exclude<ProductCategory, '全部'>;
  price: number;
  stock: number;
  published: boolean;
  featured: boolean;
  images: string[];
  videoUrl: string;
  description: string;
  highlights: string[];
  variants: string[];
  specs: ProductSpec[];
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  variant: string;
  quantity: number;
}

export type ShippingMethod = '宅配到府' | '7-ELEVEN 超商取貨' | '全家店到店';
export type PaymentMethod = '貨到付款' | '信用卡一次付清' | 'LINE Pay';
export type OrderStatus = '待出貨' | '已出貨' | '已完成';

export interface Order {
  id: string;
  customerName: string;
  phone: string;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  address: string;
  note: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  createdAt: string;
  memberUid?: string;
}

export type MemberTier = '一般會員' | 'VIP會員';
export type MemberStatus = 'active' | 'suspended';

export interface MemberDirectory {
  uid: string;
  displayName: string;
  photoUrl: string;
  memberTier: MemberTier;
  status: MemberStatus;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MemberPrivateInfo {
  uid: string;
  email: string;
  phone: string;
  defaultAddress: string;
  agreedTerms: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MemberProfile extends MemberDirectory {
  email: string;
  phone: string;
  defaultAddress: string;
  agreedTerms: boolean;
}

export interface AdminRecord {
  uid: string;
  displayName: string;
  grantedBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type AdminRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AdminRequest {
  uid: string;
  displayName: string;
  reason: string;
  status: AdminRequestStatus;
  reviewedBy: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MemberOrderRecord {
  orderId: string;
  uid: string;
  customerName: string;
  phone: string;
  shippingMethod: ShippingMethod;
  paymentMethod: PaymentMethod;
  address: string;
  note: string;
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  status: OrderStatus;
  createdAt: unknown;
  updatedAt: unknown;
}

