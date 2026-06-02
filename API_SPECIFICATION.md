# Stride Platform — API Specification

> **Base URL (development):** `https://<REPLIT_DEV_DOMAIN>/api`
> **Base URL (production):** `https://<DOMAIN>/api`
> **Content-Type:** All requests and responses use `application/json` unless noted otherwise.
> **Architecture:** All endpoints live inside `artifacts/api-server/src/routes/`. No server-side HTML is rendered. Every response is a structured JSON payload with a standard HTTP status code.

---

## Table of Contents

1. [Authentication Scheme](#1-authentication-scheme)
2. [Standard Error Envelope](#2-standard-error-envelope)
3. [System & Health](#3-system--health)
4. [Authentication & Identity](#4-authentication--identity)
5. [Organisation Management](#5-organisation-management)
6. [Member (Child) Management](#6-member-child-management)
7. [Delegates — Authorised Pickups](#7-delegates--authorised-pickups)
8. [Courses & Enrollments](#8-courses--enrollments)
9. [Attendance & Session Management](#9-attendance--session-management)
10. [Disciplines & Operator Profiles](#10-disciplines--operator-profiles)
11. [Availability & Scheduling](#11-availability--scheduling)
12. [Scheduled Courses (Proposals)](#12-scheduled-courses-proposals)
13. [Lessons](#13-lessons)
14. [Private Bookings](#14-private-bookings)
15. [Notifications](#15-notifications)
16. [Documents & Legal Compliance](#16-documents--legal-compliance)
17. [Payments & Checkout](#17-payments--checkout)
18. [Promo Codes](#18-promo-codes)
19. [Blacklist](#19-blacklist)
20. [Stripe Billing (SaaS Subscription)](#20-stripe-billing-saas-subscription)
21. [Finance & Payroll Execution](#21-finance--payroll-execution)
22. [Operator Time Tracking](#22-operator-time-tracking)
23. [Operator Earnings](#23-operator-earnings)
24. [Reimbursements](#24-reimbursements)
25. [Users & Role Management](#25-users--role-management)
26. [Access Check (Member Entry Gate)](#26-access-check-member-entry-gate)
27. [Admin Settings](#27-admin-settings)
28. [Admin Kiosk Management](#28-admin-kiosk-management)
29. [Messages & Communications](#29-messages--communications)
30. [Activity Logs](#30-activity-logs)
31. [Enrollment Requests](#31-enrollment-requests)
32. [Workshop Proposals](#32-workshop-proposals)
33. [Super Admin — Platform Command Center](#33-super-admin--platform-command-center)

---

## 1. Authentication Scheme

All protected endpoints require a **Bearer JWT** in the `Authorization` header.

```
Authorization: Bearer <jwt_token>
```

JWTs are issued by `POST /api/auth/login` and contain the following claims:

| Claim | Type | Description |
|-------|------|-------------|
| `id` | string | User's numeric ID (as string) |
| `email` | string | User's email address |
| `role` | string | One of: `parent`, `operator`, `admin`, `kiosk`, `super_admin` |
| `orgId` | number | The user's tenant organisation ID |
| `name` | string | Display name |

**Role hierarchy (most → least privileged):**
`super_admin` → `admin` → `operator` → `parent` → `kiosk`

Role guards on each endpoint are listed as **`[role1, role2]`** — the request is rejected with `403` if the caller's role is not in the allowed list.

---

## 2. Standard Error Envelope

All error responses follow this shape:

```json
{ "error": "<human-readable message>" }
```

| HTTP Code | Meaning |
|-----------|---------|
| `400` | Bad Request — missing or invalid parameters |
| `401` | Unauthorised — missing or invalid JWT |
| `403` | Forbidden — authenticated but insufficient role |
| `404` | Not Found — resource does not exist in this tenant |
| `409` | Conflict — duplicate resource |
| `500` | Internal Server Error — unexpected backend failure |
| `503` | Service Unavailable — dependency (DB table, Stripe) not ready |

---

## 3. System & Health

### `GET /api/healthz`

Public readiness probe.

**Auth:** None

**Response `200`**
```json
{ "status": "ok" }
```

---

### `GET /api/auth/system-status`

Returns whether the platform is configured for the calling tenant and the trial/subscription state.

**Auth:** None

**Response `200`**
```json
{
  "configured": true,
  "userCount": 12,
  "orgName": "Riverside Dance Academy",
  "trialEndsAt": "2024-09-01T00:00:00.000Z",
  "trialExpired": false,
  "subscriptionStatus": "trialing"
}
```

---

## 4. Authentication & Identity

### `POST /api/auth/login`

Issues a JWT for a verified user.

**Auth:** None

**Request Body**
```json
{
  "email": "jane@example.com",
  "password": "hunter2"
}
```

**Response `200`**
```json
{
  "token": "<jwt>",
  "user": {
    "id": "42",
    "email": "jane@example.com",
    "name": "Jane Smith",
    "role": "parent",
    "orgId": 7,
    "activation_status": "active"
  }
}
```

**Response `401`** — wrong credentials or inactive account.

---

### `POST /api/auth/register`

**Pioneer (first admin) registration.** Creates a new Organisation, provisions a 30-day trial, and fires a `new_tenant_registered` platform event. Only succeeds when no admin exists for the org yet.

**Auth:** None

**Request Body**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "hunter2",
  "association": "Riverside Dance Academy"
}
```

**Response `201`**
```json
{
  "token": "<jwt>",
  "user": { "id": "1", "email": "...", "role": "admin", "orgId": 1 }
}
```

**Response `409`** — admin already exists for this org.

---

### `GET /api/auth/activate/:token`

Validates an email-activation token and marks the user as active.

**Auth:** None

**Path Params:** `token` — activation UUID

**Response `200`**
```json
{ "ok": true, "token": "<jwt>", "user": { ... } }
```

**Response `400`** — invalid or expired token.

---

### `POST /api/auth/invite`

Sends an invitation email to a new member (parent, operator, etc.).

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "email": "parent@example.com",
  "role": "parent",
  "name": "Bob Parent"
}
```

**Response `200`**
```json
{ "ok": true, "inviteToken": "<uuid>" }
```

---

### `GET /api/auth/invite/:token`

Looks up an invitation and returns the prefilled registration context.

**Auth:** None

**Response `200`**
```json
{
  "email": "parent@example.com",
  "role": "parent",
  "orgId": 7,
  "orgName": "Riverside Dance Academy"
}
```

**Response `404`** — invalid or expired token.

---

### `POST /api/org/configure`

White-label configuration step run once after pioneer registration (sets org name, branding, locale).

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "name": "Riverside Dance Academy",
  "currency": "AUD",
  "country": "AU",
  "legal_framework": "ASD",
  "tenant_type": "commercial"
}
```

**Response `200`**
```json
{ "ok": true, "org": { ... } }
```

---

## 5. Organisation Management

### `GET /api/terminology`

Returns the white-label terminology map for the calling tenant (e.g. "Student" vs "Member").

**Auth:** None

**Response `200`**
```json
{
  "member": "Student",
  "members": "Students",
  "operator": "Instructor"
}
```

---

### `GET /api/org`

Returns the full organisation record for the caller's tenant.

**Auth:** Bearer

**Response `200`**
```json
{
  "id": 7,
  "name": "Riverside Dance Academy",
  "currency": "AUD",
  "country": "AU",
  "legal_framework": "ASD",
  "tenant_type": "commercial",
  "stripe_connect_account_id": "acct_xxx",
  "trial_ends_at": "2024-09-01T00:00:00.000Z",
  "subscription_status": "trialing"
}
```

---

### `PATCH /api/org`

Updates the organisation's settings. Only fields provided in the body are mutated.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body** (all optional)
```json
{
  "name": "New Name",
  "currency": "EUR",
  "country": "IT",
  "legal_framework": "SSD"
}
```

**Response `200`** — updated org record.

---

## 6. Member (Child) Management

> "Members" are the enrolled children/students managed by parent accounts.

### `GET /api/members`

Returns members scoped to the authenticated user's organisation. Parents see only their own dependents; admins/operators see all.

**Auth:** Bearer

**Response `200`**
```json
[
  {
    "id": 1,
    "name": "Alice Smith",
    "date_of_birth": "2015-03-10",
    "photo_consent": true,
    "video_consent": false,
    "parent_id": 42,
    "org_id": 7
  }
]
```

---

### `POST /api/members`

Creates a new member (dependent) linked to the authenticated parent.

**Auth:** Bearer

**Request Body**
```json
{
  "name": "Alice Smith",
  "date_of_birth": "2015-03-10",
  "photo_consent": true,
  "video_consent": false
}
```

**Response `201`** — created member record.

---

### `PATCH /api/members/:id`

Updates a member's profile fields.

**Auth:** Bearer

**Path Params:** `id` — member ID

**Request Body** (all optional)
```json
{
  "name": "Alice Jane Smith",
  "photo_consent": false
}
```

**Response `200`** — updated member record.

---

### `DELETE /api/members/:id`

Soft/hard deletes a member from the tenant.

**Auth:** Bearer

**Response `204`** — no content.

---

## 7. Delegates — Authorised Pickups

Delegates are secondary contacts authorised to collect a specific member.

### `GET /api/delegates`

**Auth:** Bearer

**Response `200`**
```json
[
  { "id": 1, "member_id": 1, "name": "Grandma Smith", "phone": "+61400000000", "relationship": "grandmother" }
]
```

---

### `POST /api/delegates`

**Auth:** Bearer

**Request Body**
```json
{
  "member_id": 1,
  "name": "Grandma Smith",
  "phone": "+61400000000",
  "relationship": "grandmother"
}
```

**Response `201`** — created delegate record.

---

### `DELETE /api/delegates/:id`

**Auth:** Bearer

**Response `204`** — no content.

---

## 8. Courses & Enrollments

### `GET /api/courses`

Returns all courses offered by the tenant.

**Auth:** Bearer

**Response `200`**
```json
[
  {
    "id": 1,
    "name": "Ballet Beginners",
    "discipline_id": 3,
    "schedule": "Monday 17:00",
    "max_capacity": 15,
    "enrolled_count": 11
  }
]
```

---

### `GET /api/enrollments`

Returns enrollment records scoped to the caller's role/tenant.

**Auth:** Bearer

**Response `200`** — array of enrollment objects.

---

### `POST /api/enrollments`

Enrolls a member in a course.

**Auth:** Bearer

**Request Body**
```json
{
  "member_id": 1,
  "course_id": 3
}
```

**Response `201`** — enrollment record.

**Response `409`** — already enrolled.

---

## 9. Attendance & Session Management

### `GET /api/students`

Full student list with current-session attendance summary.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`** — array of student objects with `stars` and `attendance_count`.

---

### `GET /api/attendance`

**Query Params:** `?sessionId=<id>` or `?date=<YYYY-MM-DD>`

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`** — array of attendance records.

---

### `POST /api/attendance`

Records a single attendance entry (manual sign-in).

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{
  "member_id": 1,
  "session_id": 42,
  "status": "present"
}
```

**Response `201`** — attendance record.

---

### `PATCH /api/attendance/:id`

Updates attendance status for a specific record.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{ "status": "absent" }
```

**Response `200`** — updated record.

---

### `PATCH /api/students/:id/stars`

Awards or removes a star for a student.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{ "delta": 1 }
```

**Response `200`** — updated student.

---

### `GET /api/sessions/today`

Returns all sessions scheduled for today in the tenant.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`** — array of session objects.

---

### `GET /api/sessions/:sessionId/roster`

Returns the attendance roster for a specific session.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`** — array of `{ member, status }` objects.

---

### `POST /api/sessions/:sessionId/bulk-signout`

Marks all remaining `present` attendees as `signed_out`.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
{ "updated": 8 }
```

---

### `POST /api/attendance/batch`

Batch-upserts multiple attendance records in a single request (used by QR kiosk scan pipeline).

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{
  "session_id": 42,
  "records": [
    { "member_id": 1, "status": "present" },
    { "member_id": 2, "status": "absent" }
  ]
}
```

**Response `200`**
```json
{ "upserted": 2 }
```

---

## 10. Disciplines & Operator Profiles

### `GET /api/disciplines`

Returns all disciplines (dance styles, sports, etc.) defined for the tenant.

**Auth:** Bearer

**Response `200`**
```json
[{ "id": 1, "name": "Ballet", "color": "#FF69B4" }]
```

---

### `POST /api/disciplines`

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{ "name": "Contemporary", "color": "#8B5CF6" }
```

**Response `201`** — created discipline.

---

### `PATCH /api/disciplines/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`** — updated discipline.

---

### `DELETE /api/disciplines/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `204`**

---

### `GET /api/operator-profiles`

Returns operator teaching profiles with discipline associations.

**Auth:** Bearer

**Response `200`** — array of operator profile objects.

---

### `POST /api/operator-profiles`

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "user_id": 10,
  "discipline_ids": [1, 3],
  "bio": "10 years of classical training"
}
```

**Response `201`**

---

### `PATCH /api/operator-profiles/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**

---

### `DELETE /api/operator-profiles/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `204`**

---

## 11. Availability & Scheduling

### `GET /api/availability`

Returns availability slots for the authenticated operator (or all operators for admin).

**Auth:** Bearer

**Query Params:** `?operatorId=<id>` (admin only) · `?weekStart=<YYYY-MM-DD>`

**Response `200`** — array of availability window objects.

---

### `POST /api/availability`

Creates an availability slot for an operator.

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Request Body**
```json
{
  "day_of_week": 1,
  "start_time": "09:00",
  "end_time": "17:00",
  "recurring": true
}
```

**Response `201`**

---

### `PATCH /api/availability/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**

---

### `GET /api/course-availability`

Returns time slots assigned to courses.

**Auth:** Bearer

**Response `200`** — array of course time slots.

---

### `PUT /api/course-availability`

Upserts course availability slot(s).

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Response `200`**

---

### `DELETE /api/course-availability/:id`

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Response `204`**

---

### `GET /api/meeting-availability`

Returns slots available for private parent-operator meetings.

**Auth:** Bearer

**Response `200`** — array of meeting slot objects.

---

## 12. Scheduled Courses (Proposals)

### `GET /api/scheduled-courses`

Returns all course session proposals (pending or confirmed).

**Auth:** Bearer

**Response `200`** — array of scheduled course objects.

---

### `POST /api/scheduled-courses`

Proposes a new course session.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "course_id": 1,
  "scheduled_date": "2024-09-15",
  "start_time": "17:00",
  "operator_id": 10
}
```

**Response `201`**

---

### `POST /api/scheduled-courses/:id/confirm`

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Response `200`** — confirmed session record.

---

### `POST /api/scheduled-courses/:id/decline`

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Request Body**
```json
{ "reason": "Instructor unavailable" }
```

**Response `200`**

---

## 13. Lessons

### `GET /api/lessons`

Returns lessons/classes for the tenant. Admins see all; operators see their own scheduled lessons.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`** — array of lesson objects.

---

## 14. Private Bookings

### `GET /api/private-bookings`

Returns private lesson bookings. Parents see their own; operators see bookings assigned to them; admins see all.

**Auth:** Bearer

**Response `200`**
```json
[
  {
    "id": 1,
    "parent_id": 42,
    "operator_id": 10,
    "member_id": 1,
    "requested_date": "2024-09-10",
    "status": "pending",
    "notes": "Ballet warm-up focus"
  }
]
```

---

### `POST /api/private-bookings`

Creates a private lesson booking request.

**Auth:** Bearer · **Roles:** `[parent]`

**Request Body**
```json
{
  "operator_id": 10,
  "member_id": 1,
  "requested_date": "2024-09-10",
  "start_time": "11:00",
  "notes": "Ballet warm-up focus"
}
```

**Response `201`**

---

### `PATCH /api/private-bookings/:id/confirm`

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Response `200`** — updated booking with `status: "confirmed"`.

---

### `PATCH /api/private-bookings/:id/cancel`

**Auth:** Bearer

**Request Body**
```json
{ "reason": "Family emergency" }
```

**Response `200`**

---

### `POST /api/private-bookings/scan`

QR scan endpoint — confirms a parent's arrival for a private booking.

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Request Body**
```json
{ "qr_payload": "<encoded_qr_string>" }
```

**Response `200`**
```json
{ "ok": true, "booking": { ... }, "member": { ... } }
```

---

## 15. Notifications

### `GET /api/private-notifications`

Returns unread (and recent) notifications for the authenticated user.

**Auth:** Bearer

**Response `200`**
```json
[
  {
    "id": 1,
    "type": "booking_confirmed",
    "title": "Booking Confirmed",
    "body": "Your private lesson on Sep 10 has been confirmed.",
    "read": false,
    "created_at": "2024-09-01T10:00:00.000Z"
  }
]
```

---

### `POST /api/private-notifications/:id/read`

Marks a notification as read.

**Auth:** Bearer

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /api/private-notifications/read-all`

Marks all of the caller's notifications as read.

**Auth:** Bearer

**Response `200`**
```json
{ "ok": true, "updated": 5 }
```

---

## 16. Documents & Legal Compliance

### `GET /api/documents`

Returns the set of documents the caller must sign (terms, media consent, liability waiver, etc.).

**Auth:** Bearer

**Response `200`**
```json
[
  {
    "id": "terms_v3",
    "title": "Terms & Conditions",
    "version": "3",
    "required": true,
    "signed": false
  }
]
```

---

### `POST /api/documents/:id/sign`

Records a simple signature acknowledgement for a document.

**Auth:** Bearer

**Path Params:** `id` — document slug

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /api/documents`

Creates or updates a document definition (admin only).

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "id": "media_consent_v2",
  "title": "Media Consent Form",
  "content": "<full document text>",
  "version": "2",
  "required": true
}
```

**Response `201`**

---

### `POST /api/legal/sign`

High-fidelity audit-trail signature capture. Stores an SVG signature image, document hash, IP address, and device OS. Used for legally binding consent collection.

**Auth:** Bearer

**Request Body**
```json
{
  "document_id": "liability_waiver_v1",
  "document_version": "1",
  "document_content": "<full plaintext of the document>",
  "selected_option": "accept",
  "signature_svg": "<svg>...</svg>",
  "device_os": "iOS 17.4"
}
```

**Response `200`**
```json
{ "ok": true, "hash": "<sha256 of document_content>" }
```

---

### `GET /api/legal/signed-ids`

Returns the list of document IDs the authenticated user has already signed.

**Auth:** Bearer

**Response `200`**
```json
{ "ids": ["terms_v3", "liability_waiver_v1"] }
```

---

### `GET /api/legal/audit-log`

Full tamper-evident audit log of all signature events in the tenant.

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**
```json
[
  {
    "id": 1,
    "user_id": 42,
    "user_email": "parent@example.com",
    "document_id": "terms_v3",
    "document_version": "3",
    "selected_option": "accept",
    "timestamp": "2024-08-20T14:32:00.000Z",
    "ip_address": "203.0.113.5",
    "device_operating_system": "iOS 17.4",
    "document_text_hash": "<sha256>"
  }
]
```

---

## 17. Payments & Checkout

### `GET /api/payments`

Returns payment history for the caller (parent: own payments; admin: all).

**Auth:** Bearer

**Response `200`** — array of payment records.

---

### `POST /api/payments`

Records a manual payment entry.

**Auth:** Bearer

**Request Body**
```json
{
  "member_id": 1,
  "amount_cents": 15000,
  "currency": "AUD",
  "description": "Term 3 fees",
  "method": "cash"
}
```

**Response `201`**

---

### `POST /api/checkout/stripe/intent`

Creates a Stripe PaymentIntent for a member fee payment.

**Auth:** Bearer

**Request Body**
```json
{
  "amount_cents": 15000,
  "currency": "aud",
  "member_id": 1,
  "description": "Term 3 Ballet fees"
}
```

**Response `200`**
```json
{ "clientSecret": "pi_xxx_secret_xxx" }
```

---

### `POST /api/checkout/paypal/order`

Creates a PayPal order for a fee payment.

**Auth:** Bearer

**Request Body**
```json
{
  "amount_cents": 15000,
  "currency": "AUD",
  "description": "Term 3 Ballet fees"
}
```

**Response `200`**
```json
{ "orderId": "PAYPAL_ORDER_ID" }
```

---

### `POST /api/checkout/paypal/capture`

Captures an approved PayPal order.

**Auth:** Bearer

**Request Body**
```json
{ "orderId": "PAYPAL_ORDER_ID" }
```

**Response `200`**
```json
{ "ok": true, "capture": { ... } }
```

---

### `POST /api/checkout/complete`

Finalises a checkout transaction and records it in the database.

**Auth:** Bearer

**Request Body**
```json
{
  "payment_intent_id": "pi_xxx",
  "member_id": 1,
  "amount_cents": 15000,
  "currency": "aud"
}
```

**Response `200`**
```json
{ "ok": true, "payment": { ... } }
```

---

## 18. Promo Codes

### `GET /api/promo-codes`

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
[
  { "id": 1, "code": "SUMMER25", "discount_pct": 25, "active": true, "uses": 4, "max_uses": 50 }
]
```

---

### `POST /api/promo-codes`

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "code": "SUMMER25",
  "discount_pct": 25,
  "max_uses": 50,
  "expires_at": "2024-12-31T23:59:59Z"
}
```

**Response `201`**

---

### `PATCH /api/promo-codes/:id/toggle`

Activates or deactivates a promo code.

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**
```json
{ "id": 1, "active": false }
```

---

### `DELETE /api/promo-codes/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `204`**

---

## 19. Blacklist

The blacklist prevents specific individuals from accessing the kiosk check-in flow.

### `GET /api/blacklist`

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
[
  { "id": 1, "name": "John Doe", "reason": "Outstanding fees", "added_by": 5 }
]
```

---

### `POST /api/blacklist`

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "name": "John Doe",
  "member_id": 7,
  "reason": "Outstanding fees"
}
```

**Response `201`**

---

### `DELETE /api/blacklist/:id`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `204`**

---

### `POST /api/blacklist/check`

Checks whether a member or parent is on the blacklist (used by QR kiosk pipeline).

**Auth:** Bearer

**Request Body**
```json
{ "member_id": 7 }
```

**Response `200`**
```json
{ "blocked": false }
```
or
```json
{ "blocked": true, "entry": { "reason": "Outstanding fees" } }
```

---

## 20. Stripe Billing (SaaS Subscription)

> The webhook endpoint requires a raw request body for Stripe signature verification and **must not** have `express.json()` applied — this is handled in `app.ts` before the middleware chain.

### `GET /api/billing/status`

Returns the current Stripe subscription state for the tenant.

**Auth:** Bearer · **Roles:** `[admin, super_admin]`

**Response `200`**
```json
{
  "subscription_status": "trialing",
  "trial_ends_at": "2024-09-01T00:00:00.000Z",
  "active_seats": 24,
  "stripe_customer_id": "cus_xxx",
  "stripe_subscription_id": "sub_xxx"
}
```

---

### `POST /api/billing/checkout-session`

Creates a Stripe Checkout Session to initiate a paid subscription.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "seat_count": 30,
  "success_url": "https://app.example.com/billing/success",
  "cancel_url": "https://app.example.com/billing/cancel"
}
```

**Response `200`**
```json
{ "url": "https://checkout.stripe.com/pay/cs_xxx" }
```

---

### `POST /api/billing/sync-seats`

Recalculates active member seats and updates the Stripe subscription quantity accordingly.

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**
```json
{ "ok": true, "seats": 27, "updated": true }
```

---

### `POST /api/billing/webhook`

Stripe webhook receiver. Handles `customer.subscription.updated`, `invoice.payment_succeeded`, `invoice.payment_failed`, etc.

**Auth:** Stripe-Signature header (HMAC-SHA256)

> **Note:** Send raw request body — do **not** JSON-encode. The `Content-Type` should be `application/json` as sent directly by Stripe.

**Response `200`**
```json
{ "received": true }
```

---

## 21. Finance & Payroll Execution

### `POST /api/finance/stripe-onboarding`

Initiates a Stripe Connect onboarding flow so the operator can receive direct payouts.

**Auth:** Bearer

**Request Body**
```json
{
  "operator_id": 10,
  "return_url": "https://app.example.com/finance/connect/return"
}
```

**Response `200`**
```json
{ "url": "https://connect.stripe.com/setup/s/xxx" }
```

---

### `GET /api/finance/stripe-status`

Returns the Stripe Connect account status for an operator.

**Auth:** Bearer

**Query Params:** `?operatorId=<id>`

**Response `200`**
```json
{
  "connected": true,
  "charges_enabled": true,
  "payouts_enabled": true,
  "stripe_connect_id": "acct_xxx"
}
```

---

### `POST /api/finance/execute-payout`

Executes a direct Stripe Transfer to a connected operator account. Records the transfer reference in the database.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "type": "reimbursement",
  "referenceId": "45",
  "recipientId": 10,
  "amountCents": 15000,
  "currency": "eur",
  "recipientName": "Marco Bianchi",
  "ibanPlaceholder": "IT60 X054 2811 1010 0000 0123 456"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `"reimbursement"` or `"invoice"` |
| `referenceId` | Yes | DB row ID of the underlying financial record |
| `recipientId` | Yes | User ID of the operator receiving payment |
| `amountCents` | Yes | Amount in the smallest currency unit |
| `currency` | Yes | ISO currency code (e.g. `"eur"`, `"aud"`) |

**Response `200`**
```json
{
  "success": true,
  "paymentType": "reimbursement",
  "referenceId": "45",
  "amountCents": 15000,
  "paidAt": "2024-09-01T12:00:00.000Z",
  "stripeTransferId": "tr_xxx",
  "record": { ... }
}
```

---

## 22. Operator Time Tracking

### `POST /api/operator-clock/in`

Clocks an operator in for the current session.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{ "session_id": 42 }
```

**Response `201`**
```json
{ "id": 1, "operator_id": 10, "clock_in": "2024-09-01T09:00:00.000Z", "session_id": 42 }
```

---

### `POST /api/operator-clock/out`

Clocks an operator out and records the total session duration.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{ "record_id": 1 }
```

**Response `200`**
```json
{
  "id": 1,
  "clock_in": "2024-09-01T09:00:00.000Z",
  "clock_out": "2024-09-01T11:00:00.000Z",
  "duration_minutes": 120
}
```

---

### `GET /api/operator-clock`

Returns clock-in/out records. Operators see only their own; admins can filter by `?operatorId=<id>` and `?date=<YYYY-MM-DD>`.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`** — array of clock records.

---

### `GET /api/operator-clock/status`

Quick probe — returns whether the authenticated operator is currently clocked in.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
{ "clocked_in": true, "record": { "id": 1, "clock_in": "...", "session_id": 42 } }
```

---

## 23. Operator Earnings

### `GET /api/operator-earnings`

Returns the earnings summary for the operator (hours × rate, tax withholding, net payout).

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Query Params:** `?operatorId=<id>` (admin only) · `?month=<YYYY-MM>`

**Response `200`**
```json
{
  "operator_id": 10,
  "month": "2024-08",
  "gross_cents": 240000,
  "tax_withholding_cents": 48000,
  "net_cents": 192000,
  "hours_worked": 16,
  "sessions": [...]
}
```

---

## 24. Reimbursements

### `GET /api/reimbursements`

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
[
  {
    "id": 1,
    "operator_id": 10,
    "description": "Transport to venue",
    "amount_cents": 2500,
    "status": "pending",
    "receipt_url": "https://..."
  }
]
```

---

### `POST /api/reimbursements`

Submits a new reimbursement request.

**Auth:** Bearer

**Request Body**
```json
{
  "description": "Transport to venue",
  "amount_cents": 2500,
  "receipt_url": "https://storage.example.com/receipt.jpg"
}
```

**Response `201`**

---

### `PATCH /api/reimbursements/:id`

Approves or rejects a reimbursement request.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{ "status": "approved" }
```

**Response `200`** — updated reimbursement record.

---

## 25. Users & Role Management

### `GET /api/users`

Lists all users in the tenant.

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**
```json
[
  {
    "id": 42,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "role": "parent",
    "activation_status": "active",
    "created_at": "2024-08-01T10:00:00.000Z"
  }
]
```

---

### `PATCH /api/users/:id/status`

Activates or deactivates a user account.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{ "activation_status": "inactive" }
```

**Response `200`** — updated user.

---

### `PATCH /api/users/:id/role`

Promotes or demotes a user's role.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{ "role": "operator" }
```

**Response `200`** — updated user.

---

### `PATCH /api/profile`

Updates the authenticated user's own profile.

**Auth:** Bearer

**Request Body** (all optional)
```json
{
  "name": "Jane Smith",
  "phone": "+61400000000",
  "avatar_url": "https://..."
}
```

**Response `200`** — updated user profile.

---

## 26. Access Check (Member Entry Gate)

### `GET /api/access-check/:childId`

Returns whether a member is cleared for entry (fees paid, documents signed, no blacklist entry).

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
{
  "cleared": true,
  "reason": null,
  "member": { "id": 1, "name": "Alice Smith" }
}
```
or
```json
{
  "cleared": false,
  "reason": "outstanding_fees",
  "member": { ... }
}
```

---

### `PATCH /api/access-check/:childId/payment`

Marks a member's outstanding fees as paid, clearing the entry gate.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{ "payment_reference": "CASH_001" }
```

**Response `200`**

---

## 27. Admin Settings

### `GET /api/admin-settings`

Returns the tenant's operational configuration (kiosk mode, emergency contacts, SOS protocol, etc.).

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Response `200`**
```json
{
  "kiosk_mode": "qr_only",
  "sos_phone": "+61400000000",
  "emergency_protocol": "call_then_email",
  "substitution_cascade_minutes": 5,
  "payroll_rate_cents": 4000
}
```

---

### `PUT /api/admin-settings`

Replaces the full admin settings object.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body** — same shape as GET response.

**Response `200`** — updated settings record.

---

## 28. Admin Kiosk Management

### `GET /api/admin/kiosks`

Lists all provisioned kiosk device accounts for the tenant.

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`**
```json
[
  { "id": 99, "name": "Front Door iPad", "email": "kiosk.frontdoor@...", "created_at": "..." }
]
```

---

### `POST /api/admin/create-kiosk`

Provisions a new kiosk device account with a dedicated login credential. The generated email is deterministic from `deviceName`.

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{
  "deviceName": "Front Door iPad",
  "password": "secure-device-pin"
}
```

**Response `201`**
```json
{
  "id": 99,
  "name": "Front Door iPad",
  "email": "kiosk.frontdoor@association-internal.com",
  "generatedEmail": "kiosk.frontdoor@association-internal.com",
  "created_at": "..."
}
```

**Response `409`** — kiosk with this name already exists.

---

### `DELETE /api/admin/revoke-kiosk/:userId`

Permanently revokes a kiosk device account. The device is immediately locked out — this is the remote theft response action.

**Auth:** Bearer · **Roles:** `[admin]`

**Path Params:** `userId` — numeric user ID of the kiosk account

**Response `204`**

**Response `404`** — kiosk account not found in this tenant.

---

## 29. Messages & Communications

### `GET /api/messages`

Returns sent/received messages (broadcast and direct) for the tenant.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Query Params:** `?type=broadcast|direct` · `?limit=<n>`

**Response `200`** — array of message objects.

---

### `POST /api/messages`

Sends a broadcast or direct message to members/parents.

**Auth:** Bearer · **Roles:** `[admin, operator]`

**Request Body**
```json
{
  "type": "broadcast",
  "subject": "Studio closure Monday",
  "body": "The studio will be closed on Monday 2 Sept for maintenance.",
  "target_role": "parent"
}
```

**Response `201`**

---

## 30. Activity Logs

### `POST /api/pdf-logs`

Records a PDF payroll report generation event for audit purposes.

**Auth:** Bearer

**Request Body**
```json
{
  "period": "monthly",
  "month": "2024-08",
  "total_amount": 192000,
  "action": "generated"
}
```

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /api/emergency-logs`

Records an SOS / emergency broadcast event with actor, timestamp, and location context.

**Auth:** Bearer

**Request Body**
```json
{
  "trigger_type": "double_tap_sos",
  "location_label": "Studio B",
  "message": "Medical emergency — calling ambulance"
}
```

**Response `200`**
```json
{ "ok": true }
```

---

## 31. Enrollment Requests

### `GET /api/enrollment-requests`

Returns enrollment requests. Parents see their own pending requests; admins/operators see all within the tenant.

**Auth:** Bearer

**Response `200`**
```json
[
  {
    "id": "uuid",
    "member_id": 1,
    "course_id": 3,
    "status": "pending",
    "notes": "Child has some prior experience",
    "created_at": "..."
  }
]
```

---

### `POST /api/enrollment-requests`

Submits a new enrollment request for a member.

**Auth:** Bearer

**Request Body**
```json
{
  "member_id": 1,
  "course_id": 3,
  "notes": "Child has some prior experience"
}
```

**Response `201`**

---

### `PATCH /api/enrollment-requests/:id`

Approves or rejects an enrollment request.

**Auth:** Bearer · **Roles:** `[operator, admin]`

**Request Body**
```json
{
  "status": "approved",
  "notes": "Welcome to the class!"
}
```

**Response `200`** — updated request record.

---

## 32. Workshop Proposals

### `GET /api/workshop-proposals`

**Auth:** Bearer

**Response `200`** — array of workshop proposal objects.

---

### `POST /api/workshop-proposals`

**Auth:** Bearer

**Request Body**
```json
{
  "title": "Summer Intensive Ballet",
  "description": "5-day intensive for intermediate students",
  "proposed_dates": ["2024-12-16", "2024-12-20"],
  "max_participants": 20
}
```

**Response `201`**

---

### `PUT /api/workshop-proposals/:id/approve`

**Auth:** Bearer · **Roles:** `[admin]`

**Response `200`** — approved proposal.

---

### `PUT /api/workshop-proposals/:id/reject`

**Auth:** Bearer · **Roles:** `[admin]`

**Request Body**
```json
{ "reason": "Conflicting schedule" }
```

**Response `200`**

---

## 33. Super Admin — Platform Command Center

> All Super Admin endpoints require the `super_admin` role. They operate across all tenants using the service-role Supabase client (bypasses tenant RLS). Identity isolation is enforced at both the JWT `role` claim level and the database client level.

### `GET /api/super-admin/metrics`

Returns platform-wide aggregate metrics and the recent activity feed.

**Auth:** Bearer · **Roles:** `[super_admin]`

**Response `200`**
```json
{
  "totalOrgs": 42,
  "totalMembers": 1204,
  "activeCount": 18,
  "trialingCount": 20,
  "expiredCount": 4,
  "recentEvents": [
    {
      "id": 1,
      "event_type": "new_tenant_registered",
      "title": "New school registered",
      "description": "Riverside Dance Academy completed pioneer registration",
      "payload": { "orgId": 7, "adminEmail": "jane@example.com" },
      "created_at": "2024-09-01T10:00:00.000Z"
    }
  ]
}
```

---

### `GET /api/super-admin/associations`

Returns the full tenant directory with subscription and billing metadata.

**Auth:** Bearer · **Roles:** `[super_admin]`

**Response `200`**
```json
[
  {
    "id": 7,
    "name": "Riverside Dance Academy",
    "currency": "AUD",
    "country": "AU",
    "legal_framework": "ASD",
    "tenant_type": "commercial",
    "stripe_connect_account_id": "acct_xxx",
    "trial_started_at": "2024-08-01T00:00:00.000Z",
    "trial_ends_at": "2024-09-01T00:00:00.000Z",
    "is_trial_extended": false,
    "subscription_status": "trialing",
    "cost_per_seat_cents": 150
  }
]
```

---

### `POST /api/super-admin/extend-trial`

Extends a tenant's trial period by N months. Invalidates the trial cache immediately so the guard reflects the change without a server restart. Logs a `trial_extended` platform event.

**Auth:** Bearer · **Roles:** `[super_admin]`

**Request Body**
```json
{
  "orgId": 7,
  "months": 3
}
```

| Field | Required | Constraints |
|-------|----------|-------------|
| `orgId` | Yes | Must be a valid organisation ID |
| `months` | Yes | Integer ≥ 1 |

**Response `200`**
```json
{
  "id": 7,
  "name": "Riverside Dance Academy",
  "trial_ends_at": "2024-12-01T00:00:00.000Z",
  "is_trial_extended": true
}
```

---

### `PATCH /api/super-admin/associations/:id`

Updates a tenant's plan metadata (cost per seat, subscription status override).

**Auth:** Bearer · **Roles:** `[super_admin]`

**Request Body** (all optional)
```json
{
  "cost_per_seat_cents": 200,
  "subscription_status": "active"
}
```

**Response `200`** — updated organisation record.

---

### `POST /api/super-admin/seed`

Seeds the `super_admin` user from environment-level credentials. Safe to call repeatedly — returns `409` if the user already exists. Intended for initial platform provisioning only.

**Auth:** None (protected by environment secret check internally)

**Response `201`**
```json
{ "ok": true, "email": "superadmin@platform.internal" }
```

**Response `409`** — already seeded.

---

## Appendix A — Role Permission Matrix

| Endpoint Group | parent | operator | admin | super_admin |
|---------------|--------|----------|-------|-------------|
| Auth & Registration | ✅ | ✅ | ✅ | ✅ |
| Members (own) | ✅ | — | ✅ | — |
| Members (all) | — | ✅ | ✅ | — |
| Attendance | — | ✅ | ✅ | — |
| Disciplines | read | read | full | — |
| Private Bookings | create/read | confirm/read | full | — |
| Legal Signing | ✅ | ✅ | ✅ | — |
| Legal Audit Log | — | — | ✅ | — |
| Finance / Payouts | — | — | ✅ | — |
| Stripe Billing | — | — | ✅ | read |
| Users Management | — | — | ✅ | — |
| Kiosk Management | — | — | ✅ | — |
| Admin Settings | read | read | full | — |
| Super Admin | — | — | — | ✅ |

---

## Appendix B — Architecture Compliance Statement

This backend **fully satisfies** the API-First Routing & Separation mandate:

1. **All routes confined to `routes/`** — 37 modular route files, each responsible for a single domain, registered through `routes/index.ts` and mounted at `/api` in `app.ts`. No route logic exists in `app.ts` or any shared library.

2. **Strict JSON-only responses** — Zero instances of `res.render()`, `res.sendFile()`, or inline HTML strings detected across all route files. Every response path calls `res.json(...)` or `res.status(N).json(...)`.

3. **Business logic isolation** — Shared infrastructure (JWT auth, Supabase client, PostgreSQL pool, trial guard) lives exclusively in `lib/` and `middleware/`. No business logic is present in or imported by any frontend artifact (`stride-app`, `stride-landing`).

4. **HTTP status code discipline** — `201` for resource creation, `204` for deletions, `400` for validation failures, `401` for missing/invalid JWTs, `403` for role violations, `404` for missing resources, `409` for conflicts, `500` for unexpected errors, `503` for unavailable dependencies.

5. **AI-agent integration readiness** — All endpoints accept and return self-describing JSON. Authentication is stateless (JWT Bearer). Roles are encoded in the token. Any external agent can authenticate via `POST /api/auth/login`, read its role from the token, and access the full permitted surface using this specification as its sole interface contract.
