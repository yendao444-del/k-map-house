# An Khang Management PWA - Decision Log and Phase Plan

Date: 2026-10-08
Status: Implementation authorized by the active user goal; separate management PWA in progress. Earlier discussion decisions remain the basis, not evidence of completion.

## Confirmed by the user

- Target: the management application at app.phongtroankhang.com.
- Bring all current Electron features into the scope of a mobile PWA migration.
- Discuss small topics one at a time and record agreed decisions in phase documentation before implementation.
- The public animated homepage is deferred while the management PWA is discussed.
- Google Maps/location features are explicitly deferred for now; they are outside the current mobile PWA implementation scope until the property pin is verified.
- Phase 01 is login, ahead of the general users/permissions discussion.
- Existing Electron management accounts must sign in to the PWA with their existing credentials and retain their roles/status.
- PWA authentication connects to the shared backend directly; Electron does not need to be running.
- Login UI direction: preserve the current Electron login visual language and optimize its layout and interactions for mobile screens.
- Room-list UI direction: preserve the Electron desktop room-list hierarchy in a continuous mobile list; do not group rooms by floor.
- The default screen after successful login is the room list.
- Implementation objective: complete the current Electron feature scope as a mobile PWA with approximately 90% visual/workflow similarity; use Electron read-only and review the result before reporting completion.
- Implementation is isolated in `adminpwa/`; the existing tenant portal is not replaced.

## Phase specifications

- [Phase 01 - Mobile login and existing accounts](PWA-MOBILE-PHASE-01-LOGIN.md): PWA implementation in progress; production authentication acceptance remains unverified.
- [Phase 02 - Danh sách phòng mobile](PWA-MOBILE-PHASE-02-ROOMS.md): user confirmed option 2, continuous list without floor grouping; responsive implementation and browser QA in progress.
- [Full-scope implementation status](../adminpwa/IMPLEMENTATION-STATUS.md): feature inventory, authoritative evidence, release gaps and next work.
- Session-persistence preferences remain open; login visual direction is confirmed.

## Decision rules

- Record explicit agreements as confirmed; recommendations remain proposals.
- Full feature scope does not imply identical Electron APIs or simultaneous delivery.
- Do not treat a phase topic or proposed navigation layout as approved UI.
- Record dependencies, acceptance criteria and unresolved questions when each topic is agreed.

## Discussion queue (proposed order, not approved implementation phases)

1. Login using existing Electron accounts (confirmed first phase).
2. Users and permissions: owner, management staff, relationship to tenant portal.
3. Navigation and the initial screen on mobile.
4. Rooms and room details.
5. Tenant profiles, identity images and documents.
6. Contracts, deposits, amendments and move-out.
7. Meter readings and invoice creation.
8. Payments, SePay matching and outstanding balances.
9. Cash flow, wallet, debts and reports.
10. Assets, vehicles, investments and remaining Electron features.
11. Email, notifications, PDF/image export and sharing.
12. Shared data, local-data migration, connectivity and multi-device editing.
13. PWA installation, updates, device support and settings.
14. Acceptance checks, parallel Electron operation, release and rollback.

## Topic 02 - Danh sách phòng

Status: Approved direction; isolated PWA implementation started. Full functional and visual acceptance is not yet complete.

User confirmation recorded on 2026-10-08: option 2, adjusted to match the Electron desktop presentation without floor grouping. Detailed specification: [Phase 02](PWA-MOBILE-PHASE-02-ROOMS.md).

Known Electron behavior:
- The current screen is a table with room name, rent, service fees, deposit, total debt, tenant, move-in date, room status and finance actions.
- It supports search by room and filters for all, occupied, vacant, ending and expiring rooms.
- It supports adding a room and exporting Excel; tapping a room opens a detailed room workflow.
- Room status values include vacant, occupied, maintenance and ending; the list also derives an expiring filter from contract data.

Confirmed decisions:
- Use one continuous room list in the Electron desktop ordering; do not add floor sections or floor headers.
- Keep the familiar AN KHANG HOME visual language: emerald identity, white surfaces, compact status colors and finance emphasis.
- Keep a mobile header with room count, add-room action, search and status filters.
- Keep each row readable and touchable, with room name, occupant count, rent, occupancy status, debt/payment state and a chevron to open details, as shown in the approved image.
- Keep red unpaid states with the debt amount and green `Đã thu đủ` states. `Chưa thu tháng 10` is sample copy; the period must come from the actual invoice data.
- Keep bottom navigation with `Phòng` selected in this screen.
- Approved visual target: `tmp-product-design/rooms-mobile-20261008/electron-like-revision.png`.

Implementation guardrails:
- The mobile list is a responsive presentation of the existing room data, not a new floor/grouping model.
- No change to room status semantics, invoice/payment calculations or ordering rules is implied by this UI decision.
- The selected image is a visual target for implementation; exact live counts, names and amounts must come from backend data.
- Preserve the distinction between total debt across periods and the current invoice balance; the mock does not redefine accounting rules or settle how multiple unpaid periods are displayed.
- Verify loading, empty, failed-load and filtered-list states, and compare the implemented mobile screen with the approved image in design-qa.md.

Pending decisions:
- Room details and available actions after opening a room.
- Display of multiple unpaid periods and other financial edge cases using existing Electron rules.
- Should Excel export remain in the first mobile screen or move into the action menu?

## Follow-up topic - Users and permissions

Status: Open.

Known context:
- The existing application has admin/user roles; exact permission behavior must be inventoried before reuse.
- A tenant-facing web project already exists separately.

Proposal:
- app.phongtroankhang.com serves the owner and authorized management staff.
- Tenant self-service continues through pay.phongtroankhang.com.
- Check existing accounts and backend permissions before deciding whether to reuse or extend them.

Pending decision:
- Is the management PWA initially used only by the owner, or also by management staff?

Reusing existing management accounts and their current roles/status is confirmed. New roles and broader tenant-portal organization remain open; tenant authentication alone must not grant management access.

## Technical observations (not implementation decisions)

- Electron renderer uses React; core management data access uses Supabase.
- Some functions use Electron IPC, including local investment storage, Gmail, identity reading, file exports and Zalo integration.
- Existing tenant web code includes demo workflows; its production readiness must be assessed per feature.
- Backend processing, offline policy, deployment architecture and feature rollout order remain to be agreed.

## Implementation evidence update — 2026-10-08

This records actual work, not a new approval or full acceptance of every module.

- Management PWA remains isolated in `adminpwa/`; Google Maps stays deferred, tenant portal stays separate and Electron is read/copy-only.
- Investment cloud storage is additive and now applied: versioned snapshots, CAS/request dedupe, atomic portfolio + funding receipts, explicit admin/empty-cloud-only Electron JSON import without duplicate operating posting. Subsequent web edits do not automatically synchronize to Windows JSON; migration/parallel-use behavior needs an explicit acceptance decision.
- NAV edge proxy is deployed as isolated `admin-pwa-market` version 1; no existing backend functions redeployed. Anonymous/invalid-session/origin checks and real published fund NAV reads passed, but successful authenticated HTTP use still needs verification.
- Current local evidence: 86/86 unit tests, build `754141297d636d83`, private-key bundle scan passed, 29 rollback-only investment SQL assertions and 22 bank-reconciliation assertions. No real payment/email/user portfolio import was used for testing.
- Spaceship is the registrar per user information. Public authoritative DNS is Cloudflare (`aurora.ns.cloudflare.com`, `rudy.ns.cloudflare.com`). The scoped `app CNAME ankhanghome-admin-pwa.pages.dev` has now been added in the visible Cloudflare zone; the production domain is active and verified. Root/www/pay records were not changed.
- Continue full mobile/auth/role/workflow acceptance, whole-portfolio trade invariants and tenant email integration after the domain release. Auth has the additive PWA callback `https://app.phongtroankhang.com/**`; do not change root nameservers/pay/www.
- Security/deployment continuation: `admin-pwa-sepay` version 1 ACTIVE, server-side provider re-fetch and append-only provenance guards deployed; rollback test confirms no retained synthetic financial rows. Dedicated frontend preview is online at `https://ankhanghome-admin-pwa.pages.dev` and `https://app.phongtroankhang.com` is active with CSP, service worker and manifest verified. The scoped `app CNAME` is live; root/pay/www remain unchanged.
- Additional safety evidence: restrictive management RLS is applied and verified for active admin/staff versus unknown/anonymous; 22 bank-reconciliation rollback assertions pass; production dependency audit reports 0 vulnerabilities. These checks do not replace a real authorized SePay HTTP transaction test or tenant-device acceptance.
- See `adminpwa/IMPLEMENTATION-STATUS.md`, `design-qa.md`, `DEPLOYMENT.md` and evidence under `adminpwa/qa/` for the distinction between implemented, verified and still pending.
