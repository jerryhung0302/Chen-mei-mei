import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  XCircle
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import type {
  AdminRecord,
  AdminRequest,
  MemberDirectory,
  MemberPrivateInfo,
  MemberStatus,
  MemberTier
} from '../types';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  OperationType,
  db,
  formatFirestoreTimestamp,
  handleFirestoreError
} from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

interface AdminMembersPanelProps {
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function AdminMembersPanel({ onNotify }: AdminMembersPanelProps) {
  const { user, isAdmin } = useAuth();
  const [members, setMembers] = useState<MemberDirectory[]>([]);
  const [privateMap, setPrivateMap] = useState<Record<string, MemberPrivateInfo>>({});
  const [admins, setAdmins] = useState<Record<string, AdminRecord>>({});
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isAdmin) return;

    setLoading(true);
    const unsubMembers = onSnapshot(
      collection(db, 'members'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as MemberDirectory);
        setMembers(list);
        setLoading(false);

        // Fetch isolated PII per member cleanly via allowed getDoc
        void Promise.all(
          list.map(async (m) => {
            try {
              const infoSnap = await getDoc(doc(db, 'members', m.uid, 'private', 'info'));
              if (infoSnap.exists()) {
                return [m.uid, infoSnap.data() as MemberPrivateInfo] as const;
              }
            } catch {
              // ignore individual doc errors
            }
            return null;
          })
        ).then((entries) => {
          const next: Record<string, MemberPrivateInfo> = {};
          for (const entry of entries) {
            if (entry) next[entry[0]] = entry[1];
          }
          setPrivateMap(next);
        });
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'members');
      }
    );

    const unsubAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => {
        const map: Record<string, AdminRecord> = {};
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as AdminRecord;
        });
        setAdmins(map);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'admins');
      }
    );

    const unsubRequests = onSnapshot(
      collection(db, 'admin_requests'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AdminRequest);
        setRequests(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'admin_requests');
      }
    );

    return () => {
      unsubMembers();
      unsubAdmins();
      unsubRequests();
    };
  }, [user, isAdmin]);

  const handleApproveRequest = async (req: AdminRequest) => {
    if (!user) return;
    setBusyUid(req.uid);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'admins', req.uid), {
        uid: req.uid,
        displayName: req.displayName.slice(0, 50),
        grantedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      batch.update(doc(db, 'admin_requests', req.uid), {
        status: 'approved',
        reviewedBy: user.uid,
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      onNotify('success', `已核准「${req.displayName}」成為後台管理員`);
    } catch (error) {
      onNotify('error', '核准管理員權限失敗');
      handleFirestoreError(error, OperationType.WRITE, `admin_requests/${req.uid}`);
    } finally {
      setBusyUid(null);
    }
  };

  const handleRejectRequest = async (req: AdminRequest) => {
    if (!user) return;
    setBusyUid(req.uid);
    try {
      await updateDoc(doc(db, 'admin_requests', req.uid), {
        status: 'rejected',
        reviewedBy: user.uid,
        updatedAt: serverTimestamp()
      });
      onNotify('success', `已駁回「${req.displayName}」的管理員申請`);
    } catch (error) {
      onNotify('error', '駁回申請失敗');
      handleFirestoreError(error, OperationType.UPDATE, `admin_requests/${req.uid}`);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleTier = async (member: MemberDirectory) => {
    const nextTier: MemberTier = member.memberTier === 'VIP會員' ? '一般會員' : 'VIP會員';
    setBusyUid(member.uid);
    try {
      await updateDoc(doc(db, 'members', member.uid), {
        memberTier: nextTier,
        updatedAt: serverTimestamp()
      });
      onNotify('success', `已將「${member.displayName}」調整為 ${nextTier}`);
    } catch (error) {
      onNotify('error', '更新會員等級失敗');
      handleFirestoreError(error, OperationType.UPDATE, `members/${member.uid}`);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleStatus = async (member: MemberDirectory) => {
    const nextStatus: MemberStatus = member.status === 'active' ? 'suspended' : 'active';
    setBusyUid(member.uid);
    try {
      await updateDoc(doc(db, 'members', member.uid), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      onNotify(
        'success',
        `已${nextStatus === 'active' ? '重新啟用' : '停用'}會員「${member.displayName}」`
      );
    } catch (error) {
      onNotify('error', '更新會員狀態失敗');
      handleFirestoreError(error, OperationType.UPDATE, `members/${member.uid}`);
    } finally {
      setBusyUid(null);
    }
  };

  const handleToggleAdminRole = async (member: MemberDirectory) => {
    if (!user) return;
    const isCurrentlyAdmin = Boolean(admins[member.uid]);
    setBusyUid(member.uid);
    try {
      if (isCurrentlyAdmin) {
        await deleteDoc(doc(db, 'admins', member.uid));
        onNotify('success', `已移除「${member.displayName}」的後台管理員權限`);
      } else {
        await setDoc(doc(db, 'admins', member.uid), {
          uid: member.uid,
          displayName: member.displayName.slice(0, 50),
          grantedBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        onNotify('success', `已授權「${member.displayName}」為後台管理員`);
      }
    } catch (error) {
      onNotify('error', '調整管理員權限失敗');
      handleFirestoreError(error, OperationType.WRITE, `admins/${member.uid}`);
    } finally {
      setBusyUid(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Pending Admin Requests */}
      {pendingRequests.length > 0 && (
        <section className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <ShieldAlert className="w-4 h-4 text-amber-700" />
            <span>待審核的後台管理員權限申請（{pendingRequests.length} 筆）</span>
          </div>

          <div className="space-y-2.5">
            {pendingRequests.map((req) => (
              <div
                key={req.uid}
                className="bg-white rounded-xl border border-amber-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-zinc-900">
                    {req.displayName}
                    {privateMap[req.uid]?.email && (
                      <span className="ml-2 text-xs font-normal text-zinc-500">
                        ({privateMap[req.uid].email})
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-600">申請原因：{req.reason}</p>
                  <p className="text-[11px] text-zinc-400">
                    申請時間：{formatFirestoreTimestamp(req.createdAt)}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyUid === req.uid}
                    onClick={() => handleApproveRequest(req)}
                    className="min-h-[40px] px-3.5 rounded-lg bg-emerald-950 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>核准開通</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyUid === req.uid}
                    onClick={() => handleRejectRequest(req)}
                    className="min-h-[40px] px-3 rounded-lg border border-zinc-300 bg-white text-zinc-700 text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>駁回</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Registered Members Directory */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              全站已註冊會員名冊 ({members.length})
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              系統預設最高管理員：{BOOTSTRAP_ADMIN_EMAIL}，您可於此管理會員等級、停用帳號與授予後台管理權限。
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center bg-white rounded-2xl border border-zinc-200 text-xs text-zinc-500">
            載入會員名冊中...
          </div>
        ) : members.length === 0 ? (
          <div className="py-14 text-center bg-white rounded-2xl border border-zinc-200 space-y-2">
            <Users className="w-9 h-9 text-zinc-300 mx-auto" strokeWidth={1.5} />
            <p className="text-sm font-medium text-zinc-800">目前尚無其他註冊會員</p>
            <p className="text-xs text-zinc-500">
              使用者於前台或後台完成 Google 驗證與會員註冊後，將會自動顯示於此名冊。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {members.map((member) => {
              const pii = privateMap[member.uid];
              const isGrantedAdmin = Boolean(admins[member.uid]);
              const isBootstrap = pii?.email === BOOTSTRAP_ADMIN_EMAIL;
              const isBusy = busyUid === member.uid;

              return (
                <div
                  key={member.uid}
                  className="bg-white rounded-2xl border border-zinc-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {member.photoUrl ? (
                      <img
                        src={member.photoUrl}
                        alt={member.displayName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-zinc-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-100 text-zinc-600 flex items-center justify-center shrink-0">
                        <UserCheck className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-zinc-900">{member.displayName}</span>
                        <span className="text-xs text-zinc-500">· {member.memberTier}</span>
                        <span
                          className={`text-xs font-medium ${
                            member.status === 'active' ? 'text-emerald-900' : 'text-red-600'
                          }`}
                        >
                          · {member.status === 'active' ? '正常啟用' : '已停用'}
                        </span>
                        {(isGrantedAdmin || isBootstrap) && (
                          <span className="text-xs font-semibold text-emerald-950 inline-flex items-center gap-1">
                            · <ShieldCheck className="w-3.5 h-3.5" /> 後台管理員
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-zinc-600 space-y-0.5">
                        {pii ? (
                          <>
                            <p className="truncate">
                              信箱：{pii.email} · 手機：{pii.phone}
                            </p>
                            {pii.defaultAddress && (
                              <p className="truncate text-zinc-500">常用地址：{pii.defaultAddress}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-zinc-400">UID：{member.uid}</p>
                        )}
                        <p className="text-[11px] text-zinc-400">
                          註冊時間：{formatFirestoreTimestamp(member.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleTier(member)}
                      className="min-h-[38px] px-3 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      切換為 {member.memberTier === 'VIP會員' ? '一般會員' : 'VIP會員'}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy || isBootstrap}
                      onClick={() => handleToggleStatus(member)}
                      className="min-h-[38px] px-3 rounded-lg border border-zinc-300 bg-white text-xs font-medium text-zinc-800 hover:bg-zinc-50 inline-flex items-center gap-1 disabled:opacity-40"
                    >
                      {member.status === 'active' ? (
                        <>
                          <UserX className="w-3.5 h-3.5 text-red-600" />
                          <span>停用帳號</span>
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-800" />
                          <span>恢復啟用</span>
                        </>
                      )}
                    </button>

                    {!isBootstrap && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleAdminRole(member)}
                        className={`min-h-[38px] px-3 rounded-lg text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50 ${
                          isGrantedAdmin
                            ? 'border border-red-200 bg-red-50 text-red-700'
                            : 'bg-emerald-950 text-white hover:bg-emerald-900'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{isGrantedAdmin ? '移除管理員' : '設為管理員'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
