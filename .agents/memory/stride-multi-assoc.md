---
name: Stride Multi-Association Architecture
description: Full multi-org/multi-role/invite system — tables, backend routes, mobile screens, JWT context switching
---

## Rule
One user can belong to unlimited orgs with unlimited roles per org. JWT is org+role scoped. Use `switchOrgContext` to re-authenticate without re-login.

## Tables (all in Supabase via ensureTables() in pg.ts)
- `organization_members` (user_id TEXT, organization_id INT, role VARCHAR, UNIQUE) — primary membership
- `operator_profiles` (user_id INT, organization_id INT, active) — extra operator role
- `parent_profiles` (user_id TEXT, organization_id INT, active) — extra parent/member role
- `org_invite_codes` (code VARCHAR(8) UNIQUE, organization_id, role, expires_at, max_uses, used_count, active)
- `child_org_memberships` (member_id INT, organization_id INT, parent_user_id INT, UNIQUE)

## Backend Routes
- `POST /auth/switch-context` — swap JWT for different org+role (no re-login); super_admin bypasses checks
- `POST /invites/generate-code` — admin generates 6-char code (role, expiry, max_uses)
- `GET  /invites/codes` — admin lists active codes
- `DELETE /invites/codes/:id` — admin revokes code
- `POST /invites/join-by-code` — user joins org via code; upserts to org_members + role profiles
- `POST /invites/join-by-org-slug` — user joins org via slug (QR scan); defaults to parent role
- `POST /invites/add-role-to-org` — user self-provisions extra role in an org they're already in
- `GET  /invites/my-orgs` — returns all (orgId, orgName, roles[], primaryRole) for user
- `GET  /members/child-org-memberships/:memberId` — orgs a child is enrolled in
- `POST /members/link-to-org` — link child to additional org
- `DELETE /members/link-to-org/:memberId/:orgId` — unlink child from org

## Mobile
- `AuthContext.switchOrgContext(orgId, role)` — calls POST /auth/switch-context, stores new JWT via setToken(), updates user state, routes
- `AuthContext.refreshAllRoles()` — re-fetches allRoles after joining a new org
- `app/join-org.tsx` — tab UI: code entry (6-char) + QR scan (STRIDE:JOIN:ORG:{orgId}:{slug})
- `app/my-associations.tsx` — lists all orgs with role chips; tap chip to enter that org context
- `app/(admin)/invites.tsx` — admin invite management: generate, copy, show org QR, revoke codes
- `RoleSwitcherRow` — now always shows "My Associations" + "Join an Association" rows regardless of role count
- Org QR payload format: `STRIDE:JOIN:ORG:{orgId}:{slug}`

## Key constraints
- `operator_profiles.profile_type` CHECK constraint ('paid' | 'volunteer') — NOT used in invites.ts (we avoided that column in upserts to avoid the constraint)
- `organization_members` UNIQUE(user_id, organization_id) — safe to upsert
- Admin invite panel accessible at `/(admin)/invites` (hidden from tabs, push-nav from members hub)

**Why:** The data model needed explicit multi-tenancy: one JWT per (user × org × role) context, with `switchOrgContext` as the bridge. invite codes replace the URL-based flow for better mobile UX.
