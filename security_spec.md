# ZHIWU Storefront & Backend Member System Security Specification

## 1. Data Invariants
1. **Verified Identity Mandate**: All reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Atomic Registration & Master Gate**: Creating `/members/{uid}/private/info` MUST occur in the same atomic batch as `/members/{uid}` (`existsAfter(/databases/$(database)/documents/members/$(uid))`), and subsequent updates/reads require the parent member record to exist.
3. **Zero Self-Assigned Privilege Escalation**:
   - On `/members/{uid}` creation, `status` MUST be `'active'` and `memberTier` MUST be `'一般會員'`.
   - Members can NEVER modify their own `status`, `memberTier`, `uid`, or `createdAt`.
   - Only `isAdmin()` (bootstrapped verified admin `jerryhung0302@gmail.com` or existing `/admins/{uid}`) may write `/admins/{uid}`, update member `status`/`memberTier`, or approve `/admin_requests/{uid}`.
4. **Strict PII Isolation**: Email, phone, and default address reside exclusively in `/members/{uid}/private/info` (and order shipping records in `/member_orders/{orderId}`), readable only by `isOwner(uid)` or `isAdmin()`.
5. **Action-Based Updates & Terminal State Locking**:
   - `/admin_requests/{uid}` once `'approved'` or `'rejected'` cannot be modified by non-admins.
   - `/member_orders/{orderId}` once `'已完成'` cannot be modified by non-admins; members cannot change order `status`, `total`, `items`, or `uid`.
6. **Temporal Integrity & Path/Volumetric Bounds**:
   - `createdAt == request.time` on create and `createdAt == existing().createdAt` on update.
   - `updatedAt == request.time` on create and update.
   - Every string length and ID regex (`^[a-zA-Z0-9_\\-]+$`) is enforced verbatim from `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoof**: User with `email: 'jerryhung0302@gmail.com'` and `email_verified: false` tries to read `/admins/someone` or list `/members`. -> `PERMISSION_DENIED`.
2. **Self-Assigned VIP / Suspended Bypass on Registration**: Member creates `/members/{uid}` with `memberTier: 'VIP會員'`. -> `PERMISSION_DENIED`.
3. **Self-Admin Escalation**: Member attempts to create `/admins/{uid}` directly. -> `PERMISSION_DENIED`.
4. **Ghost Field Shadow Write on Profile Update**: Member updates `/members/{uid}` including `isAdmin: true` or `extraField: 'hack'`. -> `PERMISSION_DENIED`.
5. **Cross-User PII Snooping**: Member A attempts `get` on `/members/{memberB}/private/info`. -> `PERMISSION_DENIED`.
6. **Blanket Member Directory Scraping**: Member A runs `list` on `/members` without `where('uid', '==', memberA)`. -> `PERMISSION_DENIED`.
7. **Orphaned Private Info Creation**: Member attempts to create `/members/{uid}/private/info` without creating `/members/{uid}` in the same batch. -> `PERMISSION_DENIED`.
8. **Client-Forged Timestamp**: Member creates `/members/{uid}` with `createdAt: Timestamp.fromDate(new Date('2020-01-01'))`. -> `PERMISSION_DENIED`.
9. **ID Poisoning Attack**: Attacker tries to create `/members/invalid$id..with..chars` or a 500-char document ID. -> `PERMISSION_DENIED`.
10. **Order Price/Status Tampering**: Member creates `/member_orders/{orderId}` with `status: '已完成'` or `total: -100` or `items: []`. -> `PERMISSION_DENIED`.
11. **Terminal State Override**: Member attempts to update `/admin_requests/{uid}` after admin already marked it `status: 'rejected'`. -> `PERMISSION_DENIED`.
12. **Immutable Owner Swap**: Member updates `/member_orders/{orderId}` attempting to alter `uid` or `createdAt`. -> `PERMISSION_DENIED`.
