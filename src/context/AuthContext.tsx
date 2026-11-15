import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import type {
  AdminRequest,
  MemberDirectory,
  MemberOrderRecord,
  MemberPrivateInfo,
  MemberProfile,
  Order
} from '../types';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  OperationType,
  SAFE_ID_REGEX,
  auth,
  db,
  googleProvider,
  handleFirestoreError
} from '../lib/firebase';

export type MemberModalTab = 'register' | 'profile' | 'orders';

interface RegisterMemberInput {
  displayName: string;
  phone: string;
  defaultAddress: string;
  agreedTerms: boolean;
}

interface UpdateMemberInput {
  displayName: string;
  phone: string;
  defaultAddress: string;
}

interface AuthContextValue {
  authReady: boolean;
  user: User | null;
  memberProfile: MemberProfile | null;
  memberLoading: boolean;
  isRegistered: boolean;
  isAdmin: boolean;
  adminRequest: AdminRequest | null;
  memberOrders: MemberOrderRecord[];
  cloudFavoriteIds: string[];
  authError: string;
  memberModalOpen: boolean;
  memberModalTab: MemberModalTab;
  openMemberModal: (tab?: MemberModalTab) => void;
  closeMemberModal: () => void;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<User | null>;
  logout: () => Promise<void>;
  registerMember: (input: RegisterMemberInput) => Promise<void>;
  updateMemberProfile: (input: UpdateMemberInput) => Promise<void>;
  submitAdminRequest: (reason: string) => Promise<void>;
  syncFavoriteToCloud: (productId: string, isAdding: boolean) => Promise<void>;
  saveMemberOrderToCloud: (order: Order) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [memberDirectory, setMemberDirectory] = useState<MemberDirectory | null>(null);
  const [memberPrivate, setMemberPrivate] = useState<MemberPrivateInfo | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [hasAdminDoc, setHasAdminDoc] = useState(false);
  const [adminRequest, setAdminRequest] = useState<AdminRequest | null>(null);
  const [memberOrders, setMemberOrders] = useState<MemberOrderRecord[]>([]);
  const [cloudFavoriteIds, setCloudFavoriteIds] = useState<string[]>([]);
  const [authError, setAuthError] = useState('');
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberModalTab, setMemberModalTab] = useState<MemberModalTab>('register');

  const openMemberModal = useCallback((tab: MemberModalTab = 'profile') => {
    setAuthError('');
    setMemberModalTab(tab);
    setMemberModalOpen(true);
  }, []);

  const closeMemberModal = useCallback(() => {
    setMemberModalOpen(false);
    setAuthError('');
  }, []);

  const clearAuthError = useCallback(() => setAuthError(''), []);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setMemberDirectory(null);
        setMemberPrivate(null);
        setHasAdminDoc(false);
        setAdminRequest(null);
        setMemberOrders([]);
        setCloudFavoriteIds([]);
        setMemberLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Attach Firestore listeners only when auth is ready and user is authenticated with verified email
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      return;
    }

    const uid = user.uid;
    setMemberLoading(true);

    const memberPath = `members/${uid}`;
    const unsubMember = onSnapshot(
      doc(db, 'members', uid),
      (snap) => {
        if (snap.exists()) {
          setMemberDirectory(snap.data() as MemberDirectory);
        } else {
          setMemberDirectory(null);
        }
        setMemberLoading(false);
      },
      (error) => {
        setMemberLoading(false);
        handleFirestoreError(error, OperationType.GET, memberPath);
      }
    );

    const privatePath = `members/${uid}/private/info`;
    const unsubPrivate = onSnapshot(
      doc(db, 'members', uid, 'private', 'info'),
      (snap) => {
        if (snap.exists()) {
          setMemberPrivate(snap.data() as MemberPrivateInfo);
        } else {
          setMemberPrivate(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, privatePath);
      }
    );

    const adminPath = `admins/${uid}`;
    const unsubAdmin = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => {
        setHasAdminDoc(snap.exists());
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, adminPath);
      }
    );

    const reqPath = `admin_requests/${uid}`;
    const unsubAdminReq = onSnapshot(
      doc(db, 'admin_requests', uid),
      (snap) => {
        setAdminRequest(snap.exists() ? (snap.data() as AdminRequest) : null);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, reqPath);
      }
    );

    const ordersQuery = query(collection(db, 'member_orders'), where('uid', '==', uid));
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MemberOrderRecord);
        list.sort((a, b) => {
          const getMs = (v: unknown) =>
            typeof v === 'object' && v !== null && 'toMillis' in v
              ? (v as { toMillis: () => number }).toMillis()
              : 0;
          return getMs(b.createdAt) - getMs(a.createdAt);
        });
        setMemberOrders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'member_orders');
      }
    );

    const favQuery = query(collection(db, 'members', uid, 'favorites'), where('uid', '==', uid));
    const unsubFavs = onSnapshot(
      favQuery,
      (snap) => {
        setCloudFavoriteIds(snap.docs.map((d) => d.id));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `members/${uid}/favorites`);
      }
    );

    return () => {
      unsubMember();
      unsubPrivate();
      unsubAdmin();
      unsubAdminReq();
      unsubOrders();
      unsubFavs();
    };
  }, [authReady, user]);

  const isBootstrapAdmin =
    Boolean(user?.emailVerified) && user?.email === BOOTSTRAP_ADMIN_EMAIL;
  const isAdmin = Boolean(user?.emailVerified) && (isBootstrapAdmin || hasAdminDoc);
  const isRegistered = Boolean(memberDirectory);

  const memberProfile: MemberProfile | null = useMemo(() => {
    if (!memberDirectory) return null;
    return {
      ...memberDirectory,
      email: memberPrivate?.email || user?.email || '',
      phone: memberPrivate?.phone || '',
      defaultAddress: memberPrivate?.defaultAddress || '',
      agreedTerms: memberPrivate?.agreedTerms ?? true
    };
  }, [memberDirectory, memberPrivate, user?.email]);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    setAuthError('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!cred.user.emailVerified) {
        setAuthError('您的帳號電子郵件尚未完成驗證，請先驗證信箱後再登入。');
        return null;
      }
      // Check immediately if member profile exists to choose the right modal tab
      const snap = await getDoc(doc(db, 'members', cred.user.uid)).catch(() => null);
      if (snap && snap.exists()) {
        setMemberModalTab('profile');
      } else {
        setMemberModalTab('register');
      }
      return cred.user;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('已取消 Google 登入視窗');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('瀏覽器封鎖了登入彈窗，請允許彈出視窗後重試');
      } else {
        setAuthError('登入失敗，請稍後再試或檢查網路連線');
      }
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError('');
    await signOut(auth);
  }, []);

  const registerMember = useCallback(
    async ({ displayName, phone, defaultAddress, agreedTerms }: RegisterMemberInput) => {
      if (!user || !user.emailVerified || !user.email) {
        throw new Error('請先完成 Google 帳號驗證登入');
      }
      const uid = user.uid;
      if (!SAFE_ID_REGEX.test(uid) || uid.length > 128) {
        throw new Error('會員識別碼格式無效');
      }
      const cleanName = displayName.trim().slice(0, 50);
      const cleanPhone = phone.trim().slice(0, 20);
      const cleanAddress = defaultAddress.trim().slice(0, 200);
      const cleanEmail = user.email.trim().slice(0, 120);
      const cleanPhoto = (user.photoURL || '').trim().slice(0, 500);

      if (cleanName.length < 1) {
        throw new Error('請輸入會員姓名或顯示名稱（1–50 字元）');
      }
      if (cleanPhone.length < 8) {
        throw new Error('請輸入有效的聯絡手機號碼（至少 8 碼）');
      }
      if (!agreedTerms) {
        throw new Error('請勾選同意《會員服務條款與隱私權保護政策》');
      }

      const batch = writeBatch(db);
      const memberRef = doc(db, 'members', uid);
      const privateRef = doc(db, 'members', uid, 'private', 'info');

      batch.set(memberRef, {
        uid,
        displayName: cleanName,
        photoUrl: cleanPhoto,
        memberTier: '一般會員',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      batch.set(privateRef, {
        uid,
        email: cleanEmail,
        phone: cleanPhone,
        defaultAddress: cleanAddress,
        agreedTerms: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      try {
        await batch.commit();
        setMemberModalTab('profile');
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `members/${uid}`);
      }
    },
    [user]
  );

  const updateMemberProfile = useCallback(
    async ({ displayName, phone, defaultAddress }: UpdateMemberInput) => {
      if (!user || !user.emailVerified) {
        throw new Error('請先登入會員帳號');
      }
      if (memberDirectory?.status === 'suspended') {
        throw new Error('此會員帳號已被停用，無法修改資料');
      }
      const uid = user.uid;
      const cleanName = displayName.trim().slice(0, 50);
      const cleanPhone = phone.trim().slice(0, 20);
      const cleanAddress = defaultAddress.trim().slice(0, 200);
      const cleanPhoto = (user.photoURL || '').trim().slice(0, 500);

      if (cleanName.length < 1) {
        throw new Error('會員姓名不可空白');
      }
      if (cleanPhone.length < 8) {
        throw new Error('聯絡手機至少需 8 碼');
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'members', uid), {
        displayName: cleanName,
        photoUrl: cleanPhoto,
        updatedAt: serverTimestamp()
      });
      batch.update(doc(db, 'members', uid, 'private', 'info'), {
        phone: cleanPhone,
        defaultAddress: cleanAddress,
        updatedAt: serverTimestamp()
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `members/${uid}`);
      }
    },
    [user, memberDirectory?.status]
  );

  const submitAdminRequest = useCallback(
    async (reason: string) => {
      if (!user || !user.emailVerified || !memberDirectory) {
        throw new Error('請先登入並完成會員註冊後再提出申請');
      }
      if (memberDirectory.status !== 'active') {
        throw new Error('目前帳號狀態無法申請後台權限');
      }
      const uid = user.uid;
      const cleanReason = reason.trim().slice(0, 300);
      const cleanName = memberDirectory.displayName.trim().slice(0, 50);

      if (cleanReason.length < 1) {
        throw new Error('請簡述申請後台管理權限的原因或職務');
      }

      const reqRef = doc(db, 'admin_requests', uid);
      try {
        if (adminRequest && adminRequest.status === 'pending') {
          await updateDoc(reqRef, {
            displayName: cleanName,
            reason: cleanReason,
            updatedAt: serverTimestamp()
          });
        } else {
          await setDoc(reqRef, {
            uid,
            displayName: cleanName,
            reason: cleanReason,
            status: 'pending',
            reviewedBy: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `admin_requests/${uid}`);
      }
    },
    [user, memberDirectory, adminRequest]
  );

  const syncFavoriteToCloud = useCallback(
    async (productId: string, isAdding: boolean) => {
      if (!user || !user.emailVerified || !memberDirectory || memberDirectory.status !== 'active') {
        return;
      }
      if (!SAFE_ID_REGEX.test(productId) || productId.length > 128) return;
      const favRef = doc(db, 'members', user.uid, 'favorites', productId);
      const path = `members/${user.uid}/favorites/${productId}`;
      try {
        if (isAdding) {
          await setDoc(favRef, {
            uid: user.uid,
            productId,
            createdAt: serverTimestamp()
          });
        } else {
          await deleteDoc(favRef);
        }
      } catch (error) {
        handleFirestoreError(error, isAdding ? OperationType.CREATE : OperationType.DELETE, path);
      }
    },
    [user, memberDirectory]
  );

  const saveMemberOrderToCloud = useCallback(
    async (order: Order) => {
      if (!user || !user.emailVerified || !memberDirectory || memberDirectory.status !== 'active') {
        return;
      }
      const cleanOrderId = order.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
      if (!SAFE_ID_REGEX.test(cleanOrderId) || order.items.length === 0) return;

      const subtotal = Math.max(1, Number(order.subtotal) || 0);
      const shippingFee = subtotal >= 2000 ? 0 : 120;
      const total = subtotal + shippingFee;

      const orderRef = doc(db, 'member_orders', cleanOrderId);
      try {
        await setDoc(orderRef, {
          orderId: cleanOrderId,
          uid: user.uid,
          customerName: order.customerName.trim().slice(0, 50),
          phone: order.phone.trim().slice(0, 20),
          shippingMethod: order.shippingMethod,
          paymentMethod: order.paymentMethod,
          address: order.address.trim().slice(0, 200),
          note: (order.note || '').trim().slice(0, 300),
          items: order.items.slice(0, 50),
          subtotal,
          shippingFee,
          total,
          status: '待處理',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `member_orders/${cleanOrderId}`);
      }
    },
    [user, memberDirectory]
  );

  const value: AuthContextValue = {
    authReady,
    user,
    memberProfile,
    memberLoading,
    isRegistered,
    isAdmin,
    adminRequest,
    memberOrders,
    cloudFavoriteIds,
    authError,
    memberModalOpen,
    memberModalTab,
    openMemberModal,
    closeMemberModal,
    clearAuthError,
    signInWithGoogle,
    logout,
    registerMember,
    updateMemberProfile,
    submitAdminRequest,
    syncFavoriteToCloud,
    saveMemberOrderToCloud
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
