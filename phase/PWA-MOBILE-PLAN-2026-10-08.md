# An Khang Management PWA - Decision Log and Phase Plan

Date: 2026-10-08
Status: Discussion; implementation has not been authorized in this planning session.

## Confirmed by the user

- Target: the management application at app.phongtroankhang.com.
- Bring all current Electron features into the scope of a mobile PWA migration.
- Discuss small topics one at a time and record agreed decisions in phase documentation before implementation.
- The public animated homepage is deferred while the management PWA is discussed.
- Phase 01 is login, ahead of the general users/permissions discussion.
- Existing Electron management accounts must sign in to the PWA with their existing credentials and retain their roles/status.
- PWA authentication connects to the shared backend directly; Electron does not need to be running.
- Login UI direction: preserve the current Electron login visual language and optimize its layout and interactions for mobile screens.

## Phase specifications

- [Phase 01 - Mobile login and existing accounts](PWA-MOBILE-PHASE-01-LOGIN.md): confirmed functional goal and documented implementation approach; no application code or production configuration changed.
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

Status: Open; discussion started, no mobile layout decision confirmed yet.

Known Electron behavior:
- The current screen is a table with room name, rent, service fees, deposit, total debt, tenant, move-in date, room status and finance actions.
- It supports search by room and filters for all, occupied, vacant, ending and expiring rooms.
- It supports adding a room and exporting Excel; tapping a room opens a detailed room workflow.
- Room status values include vacant, occupied, maintenance and ending; the list also derives an expiring filter from contract data.

Mobile proposal for discussion:
- Keep the same filters and business information, but replace the wide table with a vertical room list.
- Each room item shows room name, status, tenant name when occupied, amount needing attention and one clear tap target to open room details.
- Keep search and status filters near the top; put add-room and other secondary actions in a compact action menu.
- Preserve the current room detail workflow as the main place for editing, invoices, meters, assets and vehicles.

Pending decisions:
- Should the default list show all rooms grouped by floor, or show rooms needing attention first?
- Which one summary is most important on each room item: current debt, current invoice status or next action?
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
