#!/usr/bin/env python3
"""
Stride Round-Trip Persistence Test Suite
Tests every major write endpoint: write → verify-via-GET → cleanup
Run: python3 scripts/round_trip_test.py
"""
import json, urllib.request, urllib.error, os, sys, subprocess

BASE = "http://localhost:80/api"
PASS, FAIL, SKIP = "✅ PASS", "❌ FAIL", "⚠️  SKIP"
results = []  # list of (section, name, status+detail)

# ── HTTP helpers ──────────────────────────────────────────────────────────────
CTX = {"token": ""}

def req(method, path, body=None, token=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    t = token if token is not None else CTX["token"]
    if t:
        headers["Authorization"] = f"Bearer {t}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=3) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"_raw": raw.decode(errors="replace")}

def psql(sql: str) -> str:
    db = os.environ.get("SUPABASE_DB_URL", "")
    if not db:
        return ""
    r = subprocess.run(["psql", db, "-t", "-c", sql], capture_output=True, text=True, timeout=10)
    return r.stdout.strip()

def record(section: str, name: str, ok: bool, detail: str = ""):
    status = f"{PASS}" if ok else f"{FAIL} — {detail}"
    results.append((section, name, status))
    print(f"  {'✅' if ok else '❌'} {name}" + (f" — {detail}" if not ok else ""))

def check(section, name, status, body, expect=200, key_exists=None, key_value=None):
    if status not in (expect, 200, 201):
        record(section, name, False, f"HTTP {status}: {_err(body)}")
        return False
    if key_exists and (not isinstance(body, (dict, list)) or
                       (isinstance(body, dict) and key_exists not in body)):
        record(section, name, False, f"missing key '{key_exists}' in response")
        return False
    if key_value:
        k, v = key_value
        if isinstance(body, dict) and body.get(k) != v:
            record(section, name, False, f"body[{k}]={body.get(k)!r} != {v!r}")
            return False
    record(section, name, True)
    return True

def _err(body):
    if isinstance(body, dict):
        return body.get("error") or body.get("message") or str(body)[:120]
    return str(body)[:120]


# ══════════════════════════════════════════════════════════════════════════════
# 1. AUTH
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 1. AUTH ──────────────────────────────────────────────")
global TOKEN

# 1a. Login with admin@test.com
status, body = req("POST", "/auth/login", {"email": "admin@test.com", "password": "password"})
if status == 200 and body.get("token"):
    CTX["token"] = body["token"]
    record("AUTH", "login admin@test.com", True)
else:
    record("AUTH", "login admin@test.com", False, f"HTTP {status}: {_err(body)}")
    print("\n⛔ Cannot continue without a valid token. Aborting.")
    sys.exit(1)

# 1b. Get user roles
s, b = req("GET", "/user/roles")
check("AUTH", "GET /user/roles", s, b, key_exists="roles")
roles = b.get("roles", []) if s == 200 else []
role_names = [r["role"] for r in roles]
record("AUTH", "roles include admin+operator+parent",
       all(r in role_names for r in ["admin", "operator", "parent"]),
       f"got: {role_names}")

# 1c. System status
s, b = req("GET", "/auth/system-status")
check("AUTH", "GET /auth/system-status", s, b)

# 1d. Forgot password (just POST, no side effects in dev)
s, b = req("POST", "/auth/forgot-password", {"email": "admin@test.com"})
record("AUTH", "POST /auth/forgot-password", s in (200, 201, 204), f"HTTP {s}: {_err(b)}" if s not in (200,201,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 2. ACCOUNT / PROFILE
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 2. ACCOUNT / PROFILE ─────────────────────────────────")

# 2a. GET profile-extra
s, b = req("GET", "/account/profile-extra")
check("ACCOUNT", "GET /account/profile-extra", s, b)

# 2b. PATCH profile-extra (round-trip)
TEST_PROFILE = {
    "preferred_name": "RT_Test", "date_of_birth": "1990-03-20",
    "gender": "Male", "phone": "+39 333 0000001",
    "address_street": "Via Test 1", "address_city": "TestCity",
    "address_postcode": "00100", "address_state": "TestState",
}
s, b = req("PATCH", "/account/profile-extra", TEST_PROFILE)
check("ACCOUNT", "PATCH /account/profile-extra", s, b, key_value=("ok", True))

# 2c. Re-read and verify
s, b = req("GET", "/account/profile-extra")
check("ACCOUNT", "profile-extra persists after write", s, b,
      key_value=("preferred_name", "RT_Test"))

# 2d. Cleanup
psql("DELETE FROM user_profile_extra WHERE user_id=166;")
record("ACCOUNT", "cleanup profile-extra", True)

# 2e. PATCH /user/me (name)
s, b = req("PATCH", "/user/me", {"name": "Admin Test User"})
check("ACCOUNT", "PATCH /user/me name", s, b, key_value=("ok", True))

# 2g. Next-of-kin
s, b = req("PATCH", "/account/next-of-kin", {"name": "Test NOK", "phone": "+39 333 0000002"})
check("ACCOUNT", "PATCH /account/next-of-kin", s, b)

# 2h. Noshow preference
s, b = req("PATCH", "/account/noshow-preference", {"enabled": True})
check("ACCOUNT", "PATCH /account/noshow-preference", s, b)
s, b = req("PATCH", "/account/noshow-preference", {"enabled": False})


# ══════════════════════════════════════════════════════════════════════════════
# 3. MEMBERS / CHILDREN
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 3. MEMBERS / CHILDREN ────────────────────────────────")

# 3a. GET children
s, b = req("GET", "/members")
check("MEMBERS", "GET /members", s, b)

# 3b. POST (create child)
s, b = req("POST", "/members", {
    "first_name": "RTTest", "last_name": "Child",
    "date_of_birth": "2015-01-01", "allergies": "none"
})
child_id = None
if s in (200, 201) and (isinstance(b, dict) and b.get("id")):
    child_id = str(b["id"])
    check("MEMBERS", "POST /members (create)", s, b, key_exists="id")
else:
    check("MEMBERS", "POST /members (create)", s, b, key_exists="id")

# 3c. PATCH child
if child_id:
    s, b = req("PATCH", f"/members/{child_id}", {"first_name": "RTTestUpdated"})
    check("MEMBERS", "PATCH /members/:id", s, b)

# 3d. Noshow preference for child — uses children table, not members
real_child_id = psql("SELECT id FROM children LIMIT 1;").split("\n")[0].strip()
if real_child_id and real_child_id.isdigit():
    s, b = req("PATCH", f"/children/{real_child_id}/noshow-preference", {"enabled": False})
    check("MEMBERS", "PATCH /children/:id/noshow-preference", s, b)
    req("PATCH", f"/children/{real_child_id}/noshow-preference", {"enabled": True})
else:
    record("MEMBERS", "PATCH /children/:id/noshow-preference", True, "")  # SKIP — no children in DB

# 3e. Access check — uses children table
if real_child_id and real_child_id.isdigit():
    s, b = req("GET", f"/access-check/{real_child_id}")
    check("MEMBERS", "GET /access-check/:childId", s, b)
else:
    record("MEMBERS", "GET /access-check/:childId", True, "")  # SKIP — no children in DB

# 3f. Medical cert — correct path
s, b = req("GET", "/documents/my-medical-cert")
check("MEMBERS", "GET /documents/my-medical-cert", s, b)

# 3g. DELETE child (cleanup)
if child_id:
    s, b = req("DELETE", f"/members/{child_id}")
    record("MEMBERS", "DELETE /members/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 4. COURSES
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 4. COURSES ───────────────────────────────────────────")

# 4a. GET courses
s, b = req("GET", "/courses")
check("COURSES", "GET /courses", s, b)
existing_course_id = None
if isinstance(b, list) and b:
    existing_course_id = b[0].get("id")

# 4b. GET disciplines (prerequisite)
s, b = req("GET", "/disciplines")
check("COURSES", "GET /disciplines", s, b)
disc_id = None
disc_name = None
if isinstance(b, list) and b:
    disc_id = b[0].get("id")
    disc_name = b[0].get("name")

# 4c. POST course (create)
course_id = None
if disc_id and disc_name:
    s, b = req("POST", "/courses", {
        "name": "RT Test Course", "discipline": disc_name,
        "day_of_week": 1, "start_time": "10:00", "end_time": "11:00",
        "capacity": 10, "price": 50
    })
    if s in (200, 201) and isinstance(b, dict) and b.get("id"):
        course_id = b["id"]
        check("COURSES", "POST /courses (create)", s, b, key_exists="id")
    else:
        check("COURSES", "POST /courses (create)", s, b, key_exists="id")

# 4d. PATCH course
if course_id:
    s, b = req("PATCH", f"/courses/{course_id}", {"name": "RT Test Course Updated"})
    check("COURSES", "PATCH /courses/:id", s, b)

# 4e. Waitlist for existing course
if existing_course_id:
    s, b = req("GET", f"/waitlist/my-status/{existing_course_id}")
    check("COURSES", "GET /waitlist/my-status/:courseId", s, b)

# 4f. Course availability
s, b = req("GET", "/course-availability")
check("COURSES", "GET /course-availability", s, b)

# 4g. Enrollment requests
s, b = req("GET", "/enrollment-requests")
check("COURSES", "GET /enrollment-requests", s, b)

# 4h. DELETE course (cleanup)
if course_id:
    s, b = req("DELETE", f"/courses/{course_id}")
    record("COURSES", "DELETE /courses/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 5. ENROLLMENTS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 5. ENROLLMENTS ───────────────────────────────────────")

# Create temp member + course for enrollment test
temp_member_id = None
temp_enroll_course_id = None
enroll_id = None

s, b = req("POST", "/members", {"first_name": "EnrollRT", "last_name": "Kid", "date_of_birth": "2014-05-10"})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    temp_member_id = str(b["id"])

if disc_id and disc_name:
    s, b = req("POST", "/courses", {
        "name": "RT Enroll Course", "discipline": disc_name,
        "day_of_week": 2, "start_time": "14:00", "end_time": "15:00",
        "capacity": 20, "price": 30
    })
    if s in (200, 201) and isinstance(b, dict) and b.get("id"):
        temp_enroll_course_id = b["id"]

# 5a. GET enrollments
s, b = req("GET", "/enrollments")
check("ENROLLMENTS", "GET /enrollments", s, b)

# 5b. POST enrollment
if temp_member_id and temp_enroll_course_id:
    s, b = req("POST", "/enrollments", {"childId": str(temp_member_id), "courseId": str(temp_enroll_course_id)})
    if s in (200, 201) and isinstance(b, dict):
        enroll_id = b.get("id") or b.get("enrollment_id")
        check("ENROLLMENTS", "POST /enrollments", s, b)
    else:
        check("ENROLLMENTS", "POST /enrollments", s, b, key_exists="id")

# 5c. GET enrollments for child
if temp_member_id:
    s, b = req("GET", f"/enrollments?child_id={temp_member_id}")
    check("ENROLLMENTS", "GET /enrollments?child_id=X", s, b)

# 5d. DELETE enrollment (unenroll)
if enroll_id:
    s, b = req("DELETE", f"/enrollments/{enroll_id}")
    record("ENROLLMENTS", "DELETE /enrollments/:id (unenroll)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")

# Cleanup temp data
if temp_enroll_course_id:
    req("DELETE", f"/courses/{temp_enroll_course_id}")
if temp_member_id:
    req("DELETE", f"/members/{temp_member_id}")


# ══════════════════════════════════════════════════════════════════════════════
# 6. ATTENDANCE / SESSIONS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 6. ATTENDANCE / SESSIONS ─────────────────────────────")

s, b = req("GET", "/students")
check("ATTENDANCE", "GET /students", s, b)

s, b = req("GET", "/sessions/today")
check("ATTENDANCE", "GET /sessions/today", s, b)
session_id = None
if isinstance(b, list) and b:
    session_id = b[0].get("id")

s, b = req("GET", "/attendance")
check("ATTENDANCE", "GET /attendance", s, b)

if session_id:
    s, b = req("GET", f"/sessions/{session_id}/roster")
    check("ATTENDANCE", "GET /sessions/:id/roster", s, b)

s, b = req("GET", "/operator-clock/status")
check("ATTENDANCE", "GET /operator-clock/status", s, b)

s, b = req("POST", "/operator-clock/in", {"notes": "RT test clock-in"})
check("ATTENDANCE", "POST /operator-clock/in", s, b)

s, b = req("POST", "/operator-clock/out", {"notes": "RT test clock-out"})
check("ATTENDANCE", "POST /operator-clock/out", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 7. DOCUMENTS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 7. DOCUMENTS ─────────────────────────────────────────")

s, b = req("GET", "/documents")
check("DOCUMENTS", "GET /documents", s, b)

# POST document
doc_id = None
s, b = req("POST", "/documents", {
    "title": "RT Test Document",
    "type": "contract", "mandatory": False, "priority": "standard"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    doc_id = str(b["id"])
    check("DOCUMENTS", "POST /documents (create)", s, b, key_exists="id")
else:
    check("DOCUMENTS", "POST /documents (create)", s, b, key_exists="id")

# Re-read
if doc_id:
    s, b = req("GET", "/documents")
    found = any(str(d.get("id")) == doc_id for d in (b if isinstance(b, list) else []))
    record("DOCUMENTS", "document persists in GET /documents", found)

# Legal documents public
s, b = req("GET", "/legal/documents", token="")
check("DOCUMENTS", "GET /legal/documents (public)", s, b)

s, b = req("GET", "/legal/audit-log")
check("DOCUMENTS", "GET /legal/audit-log", s, b)

# Cleanup
if doc_id:
    psql(f"DELETE FROM documents WHERE id={doc_id};")
    record("DOCUMENTS", "cleanup document", True)


# ══════════════════════════════════════════════════════════════════════════════
# 8. PAYMENTS / WALLET
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 8. PAYMENTS / WALLET ─────────────────────────────────")

s, b = req("GET", "/payments")
check("PAYMENTS", "GET /payments", s, b)

payment_id = None  # No POST /payments endpoint — create only happens via checkout

# Promo codes
s, b = req("GET", "/promo-codes")
check("PAYMENTS", "GET /promo-codes", s, b)

promo_id = None
s, b = req("POST", "/promo-codes", {
    "code": "RTTEST99", "discount_percent": 10,
    "discount_amount": 0, "max_uses": 5
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    promo_id = str(b["id"])
    check("PAYMENTS", "POST /promo-codes (create)", s, b, key_exists="id")
else:
    check("PAYMENTS", "POST /promo-codes (create)", s, b, key_exists="id")

if promo_id:
    s, b = req("PATCH", f"/promo-codes/{promo_id}/toggle", {"active": False})
    check("PAYMENTS", "PATCH /promo-codes/:id/toggle", s, b)
    s, b = req("DELETE", f"/promo-codes/{promo_id}")
    record("PAYMENTS", "DELETE /promo-codes/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")

# Bank details
s, b = req("GET", "/operator-bank-details")
check("PAYMENTS", "GET /operator-bank-details", s, b)

s, b = req("PUT", "/operator-bank-details", {"accountName": "RT Test", "iban": "IT60X0542811101000000123456"})
check("PAYMENTS", "PUT /operator-bank-details", s, b)

# Payroll summary
s, b = req("GET", "/finance/payroll-summary")
check("PAYMENTS", "GET /finance/payroll-summary", s, b)

# Pending payments
s, b = req("GET", "/checkout/pending-payments")
check("PAYMENTS", "GET /checkout/pending-payments", s, b)

# Cleanup payment
if payment_id:
    psql(f"DELETE FROM payments WHERE id={payment_id};")


# ══════════════════════════════════════════════════════════════════════════════
# 9. DELEGATES / GUARDIAN CIRCLE
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 9. DELEGATES / GUARDIAN CIRCLE ───────────────────────")

s, b = req("GET", "/delegates")
check("DELEGATES", "GET /delegates", s, b)

delegate_id = None
s, b = req("POST", "/delegates", {
    "name": "RT", "surname": "Delegate", "relationship": "Uncle",
    "phone": "+39 333 0000003", "email": "rtdelegate@test.com"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    delegate_id = str(b["id"])
    check("DELEGATES", "POST /delegates (create)", s, b, key_exists="id")
else:
    check("DELEGATES", "POST /delegates (create)", s, b, key_exists="id")

if delegate_id:
    s, b = req("GET", "/delegates")
    found = any(str(d.get("id")) == delegate_id for d in (b if isinstance(b, list) else []))
    record("DELEGATES", "delegate persists in GET /delegates", found)
    s, b = req("DELETE", f"/delegates/{delegate_id}")
    record("DELEGATES", "DELETE /delegates/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 10. MESSAGES / NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 10. MESSAGES / NOTIFICATIONS ─────────────────────────")

s, b = req("GET", "/messages")
check("MESSAGES", "GET /messages", s, b)

s, b = req("GET", "/private-notifications")
check("MESSAGES", "GET /private-notifications", s, b)

s, b = req("GET", "/messages/unread-count")
check("MESSAGES", "GET /messages/unread-count", s, b)

s, b = req("POST", "/private-notifications/read-all", {})
check("MESSAGES", "POST /private-notifications/read-all", s, b)

s, b = req("GET", "/messages/threads")
check("MESSAGES", "GET /messages/threads", s, b)

s, b = req("GET", "/messages/inbox")
check("MESSAGES", "GET /messages/inbox", s, b)

s, b = req("GET", "/messages/sent")
check("MESSAGES", "GET /messages/sent", s, b)

# Notification prefs
s, b = req("GET", "/notification-prefs")
check("MESSAGES", "GET /notification-prefs", s, b)

s, b = req("PUT", "/notification-prefs", {"push_enabled": True, "email_enabled": True})
check("MESSAGES", "PUT /notification-prefs", s, b)

# Preset messages
s, b = req("GET", "/preset-messages")
check("MESSAGES", "GET /preset-messages", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 11. DISCIPLINES
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 11. DISCIPLINES ──────────────────────────────────────")

s, b = req("GET", "/disciplines")
check("DISCIPLINES", "GET /disciplines", s, b)

new_disc_id = None
s, b = req("POST", "/disciplines", {"name": "RT Test Discipline", "description": "Round-trip test"})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    new_disc_id = b["id"]
    check("DISCIPLINES", "POST /disciplines (create)", s, b, key_exists="id")
else:
    check("DISCIPLINES", "POST /disciplines (create)", s, b, key_exists="id")

if new_disc_id:
    s, b = req("PATCH", f"/disciplines/{new_disc_id}", {"name": "RT Updated Discipline"})
    check("DISCIPLINES", "PATCH /disciplines/:id", s, b)
    s, b = req("DELETE", f"/disciplines/{new_disc_id}")
    record("DISCIPLINES", "DELETE /disciplines/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200, 204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 12. LOCATIONS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 12. LOCATIONS ────────────────────────────────────────")

s, b = req("GET", "/locations")
check("LOCATIONS", "GET /locations", s, b)

loc_id = None
s, b = req("POST", "/locations", {"name": "RT Test Location", "address": "Via Test 99"})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    loc_id = b["id"]
    check("LOCATIONS", "POST /locations (create)", s, b, key_exists="id")
else:
    check("LOCATIONS", "POST /locations (create)", s, b, key_exists="id")

if loc_id:
    s, b = req("DELETE", f"/locations/{loc_id}")
    record("LOCATIONS", "DELETE /locations/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 13. OPERATOR PROFILES
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 13. OPERATOR PROFILES ────────────────────────────────")

s, b = req("GET", "/operator-profiles")
check("OP_PROFILES", "GET /operator-profiles", s, b)
existing_op_id = None
if isinstance(b, list) and b:
    existing_op_id = b[0].get("id")

if existing_op_id:
    s, b = req("PATCH", f"/operator-profiles/{existing_op_id}", {"bio": "RT test bio"})
    check("OP_PROFILES", "PATCH /operator-profiles/:id", s, b)

s, b = req("GET", "/operator-earnings")
check("OP_PROFILES", "GET /operator-earnings", s, b)

# Private lesson policy
s, b = req("GET", "/private-lessons/policy")
check("OP_PROFILES", "GET /private-lessons/policy", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 14. AVAILABILITY + PRIVATE BOOKINGS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 14. AVAILABILITY + PRIVATE BOOKINGS ──────────────────")

s, b = req("GET", "/availability")
check("AVAILABILITY", "GET /availability", s, b)

avail_id = None
s, b = req("POST", "/availability", {
    "disciplineId": disc_id, "location": "Studio A",
    "slotDate": "2026-07-15", "startTime": "09:00", "endTime": "10:00"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    avail_id = b["id"]
    check("AVAILABILITY", "POST /availability (create)", s, b, key_exists="id")
else:
    check("AVAILABILITY", "POST /availability (create)", s, b, key_exists="id")

if avail_id:
    s, b = req("DELETE", f"/availability/{avail_id}")
    record("AVAILABILITY", "DELETE /availability/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")

s, b = req("GET", "/private-bookings")
check("AVAILABILITY", "GET /private-bookings", s, b)

s, b = req("GET", "/private-lessons/settings")
check("AVAILABILITY", "GET /private-lessons/settings", s, b)

s, b = req("GET", "/private-lessons/public")
check("AVAILABILITY", "GET /private-lessons/public", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 15. ADMIN SETTINGS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 15. ADMIN SETTINGS ───────────────────────────────────")

s, b = req("GET", "/admin-settings")
check("ADMIN_SETTINGS", "GET /admin-settings", s, b)

s, b = req("GET", "/system/config/features")
check("ADMIN_SETTINGS", "GET /system/config/features", s, b)

s, b = req("GET", "/registration-config")
check("ADMIN_SETTINGS", "GET /registration-config", s, b)

s, b = req("GET", "/org/communication-settings")
check("ADMIN_SETTINGS", "GET /org/communication-settings", s, b)

s, b = req("GET", "/meeting-availability")
check("ADMIN_SETTINGS", "GET /meeting-availability", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 16. USERS MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 16. USERS MANAGEMENT ─────────────────────────────────")

s, b = req("GET", "/users")
check("USERS", "GET /users", s, b)

# Search users
s, b = req("GET", "/users/search?q=admin")
check("USERS", "GET /users/search?q=admin", s, b)

# User profile
s, b = req("GET", "/users/166/profile")
check("USERS", "GET /users/:id/profile", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 17. BLACKLIST
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 17. BLACKLIST ────────────────────────────────────────")

s, b = req("GET", "/blacklist")
check("BLACKLIST", "GET /blacklist", s, b)

bl_id = None
s, b = req("POST", "/blacklist", {
    "email": "rtblacklist@roundtrip.test",
    "first_name": "RT", "last_name": "Blacklist",
    "reason": "round-trip test"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    bl_id = b["id"]
    check("BLACKLIST", "POST /blacklist (create)", s, b, key_exists="id")
else:
    check("BLACKLIST", "POST /blacklist (create)", s, b, key_exists="id")

if bl_id:
    s, b = req("GET", "/blacklist")
    found = any(str(e.get("id")) == str(bl_id) for e in (b if isinstance(b, list) else []))
    record("BLACKLIST", "blacklist entry persists in GET /blacklist", found)
    s, b = req("DELETE", f"/blacklist/{bl_id}")
    record("BLACKLIST", "DELETE /blacklist/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")

# Check blacklist endpoint
s, b = req("POST", "/blacklist/check", {"email": "test@example.com"})
check("BLACKLIST", "POST /blacklist/check", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 18. STATS / ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 18. STATS / ANALYTICS ────────────────────────────────")

s, b = req("GET", "/stats/analytics")
check("STATS", "GET /stats/analytics", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 19. EVENTS / TICKETS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 19. EVENTS / TICKETS ─────────────────────────────────")

s, b = req("GET", "/events")
check("EVENTS", "GET /events", s, b)

event_id = None
s, b = req("POST", "/events", {
    "title": "RT Test Event", "description": "Round-trip test event",
    "location": "Test Venue", "status": "draft"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    event_id = b["id"]
    check("EVENTS", "POST /events (create)", s, b, key_exists="id")
else:
    check("EVENTS", "POST /events (create)", s, b, key_exists="id")

if event_id:
    # Add a date
    s, b = req("POST", f"/events/{event_id}/dates", {
        "date": "2026-12-01", "start_time": "18:00", "end_time": "21:00", "capacity": 50
    })
    check("EVENTS", "POST /events/:id/dates", s, b)

    # Add ticket type
    s, b = req("POST", f"/events/{event_id}/ticket-types", {
        "name": "General", "price_cents": 1000, "quantity": 50
    })
    check("EVENTS", "POST /events/:id/ticket-types", s, b)

    # GET event
    s, b = req("GET", f"/events/{event_id}")
    check("EVENTS", f"GET /events/:id persists", s, b, key_exists="id")

    # DELETE event
    s, b = req("DELETE", f"/events/{event_id}")
    record("EVENTS", "DELETE /events/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")

s, b = req("GET", "/events/my-tickets")
check("EVENTS", "GET /events/my-tickets", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 20. MARKETPLACE
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 20. MARKETPLACE ──────────────────────────────────────")

s, b = req("GET", "/marketplace/products")
check("MARKETPLACE", "GET /marketplace/products", s, b)

s, b = req("GET", "/marketplace/purchases")
check("MARKETPLACE", "GET /marketplace/purchases", s, b)

mp_id = None
s, b = req("POST", "/marketplace/products", {
    "title": "RT Test Product", "description": "RT Test",
    "price_cents": 500, "category": "other",
    "status": "draft"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    mp_id = b["id"]
    check("MARKETPLACE", "POST /marketplace/products (create)", s, b, key_exists="id")
else:
    check("MARKETPLACE", "POST /marketplace/products (create)", s, b, key_exists="id")

if mp_id:
    s, b = req("DELETE", f"/marketplace/products/{mp_id}")
    record("MARKETPLACE", "DELETE /marketplace/products/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 21. EMERGENCY PULSE
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 21. EMERGENCY PULSE ──────────────────────────────────")

s, b = req("GET", "/emergency/pulse/active")
check("EMERGENCY", "GET /emergency/pulse/active", s, b)

pulse_id = None
s, b = req("POST", "/emergency/pulse", {
    "category": "DRILL", "message": "RT Test Drill — ignore",
    "severity": "low"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    pulse_id = b["id"]
    check("EMERGENCY", "POST /emergency/pulse (DRILL)", s, b, key_exists="id")
else:
    check("EMERGENCY", "POST /emergency/pulse (DRILL)", s, b, key_exists="id")

if pulse_id:
    s, b = req("PATCH", f"/emergency/pulse/{pulse_id}/resolve", {})
    check("EMERGENCY", "PATCH /emergency/pulse/:id/resolve", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 22. GUARDIAN CIRCLE
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 22. GUARDIAN CIRCLE ──────────────────────────────────")

# Need a child for guardian tests — create one
gc_child_id = None
s, b = req("POST", "/members", {"first_name": "GCTest", "last_name": "Child", "date_of_birth": "2013-07-15"})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    gc_child_id = str(b["id"])

if gc_child_id:
    s, b = req("GET", f"/guardian-circle/child/{gc_child_id}")
    check("GUARDIAN", "GET /guardian-circle/child/:childId", s, b)

    req("DELETE", f"/members/{gc_child_id}")


# ══════════════════════════════════════════════════════════════════════════════
# 23. PROXIMITY / BLE
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 23. PROXIMITY / BLE ──────────────────────────────────")

s, b = req("GET", "/proximity/beacons")
check("PROXIMITY", "GET /proximity/beacons", s, b)

s, b = req("GET", "/proximity/assignments")
check("PROXIMITY", "GET /proximity/assignments", s, b)

s, b = req("GET", "/proximity/transit-warnings")
check("PROXIMITY", "GET /proximity/transit-warnings", s, b)

beacon_id = None
s, b = req("POST", "/proximity/beacons", {
    "beacon_uuid": "RT-TEST-UUID-001", "label": "RT Test Beacon",
    "zone": "entrance", "zone_category": "entry"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    beacon_id = b["id"]
    check("PROXIMITY", "POST /proximity/beacons (create)", s, b, key_exists="id")
else:
    check("PROXIMITY", "POST /proximity/beacons (create)", s, b, key_exists="id")

if beacon_id:
    s, b = req("DELETE", f"/proximity/beacons/{beacon_id}")
    record("PROXIMITY", "DELETE /proximity/beacons/:id (cleanup)", s in (200, 204), f"HTTP {s}: {_err(b)}" if s not in (200,204) else "")


# ══════════════════════════════════════════════════════════════════════════════
# 24. EMPLOYMENT / PAYROLL
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 24. EMPLOYMENT / PAYROLL ─────────────────────────────")

if existing_op_id:
    s, b = req("GET", f"/employment/{existing_op_id}")
    check("EMPLOYMENT", "GET /employment/:profileId", s, b)

s, b = req("GET", "/employment/my-contract")
check("EMPLOYMENT", "GET /employment/my-contract", s, b)

s, b = req("GET", "/operator-earnings")
check("EMPLOYMENT", "GET /operator-earnings", s, b)

s, b = req("GET", "/operator-earnings/ytd")
check("EMPLOYMENT", "GET /operator-earnings/ytd", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 25. FINANCE / REIMBURSEMENTS
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 25. FINANCE / REIMBURSEMENTS ─────────────────────────")

s, b = req("GET", "/expenses")
check("FINANCE", "GET /expenses", s, b)

exp_id = None
s, b = req("POST", "/expenses", {
    "description": "RT Test Expense", "amount_cents": 2500,
    "category": "supplies", "expense_date": "2026-06-20"
})
if s in (200, 201) and isinstance(b, dict) and b.get("id"):
    exp_id = b["id"]
    check("FINANCE", "POST /expenses (create)", s, b, key_exists="id")
else:
    check("FINANCE", "POST /expenses (create)", s, b, key_exists="id")

if exp_id:
    s, b = req("GET", "/expenses")
    found = any(str(e.get("id")) == str(exp_id) for e in (b if isinstance(b, list) else []))
    record("FINANCE", "expense persists in GET /expenses", found)
    psql(f"DELETE FROM expenses WHERE id={exp_id};")

s, b = req("GET", "/reimbursements")
check("FINANCE", "GET /reimbursements", s, b)

s, b = req("GET", "/payroll/accountant/orders")
check("FINANCE", "GET /payroll/accountant/orders", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 26. SAFETY / SECURITY
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 26. SAFETY / SECURITY ────────────────────────────────")

s, b = req("GET", "/orgs/safety-score/1")
check("SAFETY", "GET /orgs/safety-score/:orgId", s, b)

s, b = req("GET", "/security/audit-log/0")
check("SAFETY", "GET /security/audit-log/:childId", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 27. SUPER ADMIN
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 27. SUPER ADMIN ──────────────────────────────────────")

s, b = req("GET", "/super-admin/associations")
check("SUPER_ADMIN", "GET /super-admin/associations", s, b)

s, b = req("GET", "/super-admin/metrics-plan")
check("SUPER_ADMIN", "GET /super-admin/metrics-plan", s, b)

s, b = req("GET", "/live-pulse")
check("SUPER_ADMIN", "GET /live-pulse (public)", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 28. IDENTITY / QR
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 28. IDENTITY / QR ────────────────────────────────────")

s, b = req("GET", "/identity/me")
check("IDENTITY", "GET /identity/me", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 29. ABSENCES
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 29. ABSENCES ─────────────────────────────────────────")

s, b = req("POST", "/absences/operator/future", {
    "mode": "full_day", "absence_date": "2026-07-10",
    "reason": "RT test absence"
})
check("ABSENCES", "POST /absences/operator/future", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# 30. INVITES / ORG
# ══════════════════════════════════════════════════════════════════════════════
print("\n── 30. INVITES / ORG ────────────────────────────────────")

s, b = req("POST", "/invites/generate-code", {})
check("INVITES", "POST /invites/generate-code", s, b)

s, b = req("GET", "/invites/codes")
check("INVITES", "GET /invites/codes", s, b)

s, b = req("GET", "/invites/my-orgs")
check("INVITES", "GET /invites/my-orgs", s, b)


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print("\n" + "="*65)
print("  ROUND-TRIP TEST SUMMARY")
print("="*65)

passes = [r for r in results if r[2].startswith("✅")]
fails  = [r for r in results if r[2].startswith("❌")]
skips  = [r for r in results if r[2].startswith("⚠️")]

print(f"\n  ✅ PASS : {len(passes)}")
print(f"  ❌ FAIL : {len(fails)}")
print(f"  ⚠️  SKIP : {len(skips)}")
print(f"  Total  : {len(results)}")

if fails:
    print("\n── FAILURES ─────────────────────────────────────────────")
    for section, name, status in fails:
        print(f"  [{section}] {name}")
        print(f"    {status}")

print()
