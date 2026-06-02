import AsyncStorage from "@react-native-async-storage/async-storage";

const getBaseUrl = () => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "/api";
};

const TOKEN_KEY = "stride_token";

// In-memory fallback for when localStorage is blocked (e.g. cross-origin canvas iframes)
let _memToken: string | null = null;

export async function getToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(TOKEN_KEY) ?? _memToken; }
  catch { return _memToken; }
}

export async function setToken(token: string): Promise<void> {
  _memToken = token;
  try { await AsyncStorage.setItem(TOKEN_KEY, token); } catch { /* localStorage blocked */ }
}

export async function clearToken(): Promise<void> {
  _memToken = null;
  try { await AsyncStorage.removeItem(TOKEN_KEY); } catch { /* localStorage blocked */ }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getToken();
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 204) return undefined as T;
  let data: T | { error: string };
  try {
    data = await res.json() as T | { error: string };
  } catch {
    // Empty or non-JSON body (e.g. proxy 502 when server is down)
    throw new Error(`Server unavailable (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error((data as { error: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Demo credentials (bypass backend when Supabase is not seeded) ─────────────

async function isDemoSession(): Promise<boolean> {
  const token = await getToken();
  return (token?.startsWith("demo-token-") ?? false);
}

let DEMO_BLACKLIST: ApiBlacklistEntry[] = [];
let _demoBlacklistId = 1000;

const DEMO_LOCATIONS: ApiLocation[] = [
  { id: 1, name: "Studio A", description: "Main studio",       active: true },
  { id: 2, name: "Studio B", description: "Secondary studio",  active: true },
  { id: 3, name: "Studio C",  description: "Rehearsal studio",   active: true },
  { id: 4, name: "Gym Hall",  description: "Equipped gym space", active: true },
];

const DEMO_PRIVATE_NOTIFICATIONS: ApiPrivateNotification[] = [
  {
    id: 101,
    organization_id: 1,
    recipient_id: 2,
    type: "payment_received",
    title: "Payment Received — Ballet",
    body: "Jane Smith has paid €35 for the private Ballet lesson (Mon 10 Feb 16:00). Earnings credited.",
    booking_id: 201,
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: 102,
    organization_id: 1,
    recipient_id: 2,
    type: "booking_confirmed",
    title: "Booking Confirmed — Hip Hop",
    body: "Tom Davis has confirmed the private Hip Hop lesson for Tue 11 Feb at 17:30.",
    booking_id: 202,
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 103,
    organization_id: 1,
    recipient_id: 2,
    type: "booking_request",
    title: "New Request — Ballet",
    body: "Chris Carter would like to book a private Ballet lesson for Wed 12 Feb at 15:00.",
    booking_id: 203,
    read: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

const DEMO_PRIVATE_BOOKINGS: ApiPrivateBooking[] = [
  {
    id: 201,
    organization_id: 1,
    availability_id: 301,
    parent_user_id: 1,
    child_id: 11,
    operator_user_id: 2,
    discipline_id: 1,
    slot_date: "2026-02-10",
    start_time: "16:00",
    end_time: "17:00",
    location: "Studio A",
    price_cents: 3500,
    status: "confirmed",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    child: { id: 11, name: "Jane Smith" },
    operator: { id: 2, name: "Emma Wilson" },
    discipline: { id: 1, name: "Ballet" },
  },
  {
    id: 202,
    organization_id: 1,
    availability_id: 302,
    parent_user_id: 4,
    child_id: 12,
    operator_user_id: 2,
    discipline_id: 2,
    slot_date: "2026-02-11",
    start_time: "17:30",
    end_time: "18:30",
    location: "Studio B",
    price_cents: 4000,
    status: "confirmed",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    child: { id: 12, name: "Tom Davis" },
    operator: { id: 2, name: "Emma Wilson" },
    discipline: { id: 2, name: "Hip Hop" },
  },
];

const DEMO_CHILDREN: ApiChild[] = [
  {
    id: 11,
    user_id: 1,
    name: "Jane Smith",
    age: 8,
    gold_stars: 12,
    allergies: "None",
    allergies_list: "None",
    ambulance_consent: true,
    media_consent: "full",
    qr_payload: "STRIDE-QR-11",
  },
  {
    id: 12,
    user_id: 1,
    name: "Tom Davis",
    age: 10,
    gold_stars: 7,
    allergies: "Lactose intolerance",
    allergies_list: "Lactose intolerance",
    ambulance_consent: false,
    media_consent: "internal",
    qr_payload: "STRIDE-QR-12",
  },
];

const DEMO_DELEGATES: ApiDelegate[] = [
  {
    id: 51,
    parent_id: 1,
    child_id: 11,
    name: "Grandma",
    surname: "Smith",
    phone: "+1 310 123 4567",
    pin: "4291",
    relationship: "Grandmother",
  },
];

const DEMO_DOCUMENTS: ApiDocument[] = [
  {
    id: 31,
    organization_id: 1,
    title: "Liberatoria fotografica",
    type: "liberatoria",
    signed: true,
    mandatory: false,
    created_at: "2026-01-10T10:00:00Z",
  },
  {
    id: 32,
    organization_id: 1,
    title: "Autorizzazione emergenza medica",
    type: "medica",
    signed: false,
    mandatory: true,
    created_at: "2026-01-10T10:00:00Z",
  },
];

const DEMO_PAYMENTS: ApiPayment[] = [
  {
    id: 201,
    organization_id: 1,
    amount: 120,
    description: "Quota mensile – Ballet Junior",
    status: "paid",
    created_at: "2026-04-01T09:00:00Z",
  },
  {
    id: 202,
    organization_id: 1,
    amount: 80,
    description: "Quota mensile – Hip Hop",
    status: "pending",
    created_at: "2026-05-01T09:00:00Z",
  },
];

const DEMO_ENROLLMENTS: ApiEnrollment[] = [
  { id: 301, child_id: 11, course_id: 1, status: "active", enrolled_at: "2026-01-15T08:00:00Z" },
  { id: 302, child_id: 12, course_id: 2, status: "active", enrolled_at: "2026-01-20T08:00:00Z" },
];

const DEMO_USERS: Record<string, { token: string; user: ApiUser }> = {
  "genitore@test.com": {
    token: "demo-token-parent",
    user: { id: "1", name: "John Smith", email: "genitore@test.com", role: "parent", orgId: 1 },
  },
  "operatore@test.com": {
    token: "demo-token-operator",
    user: { id: "2", name: "Sara Wilson", email: "operatore@test.com", role: "operator", orgId: 1 },
  },
  "admin@test.com": {
    token: "demo-token-admin",
    user: { id: "3", name: "Admin Stride", email: "admin@test.com", role: "admin", orgId: 1 },
  },
};

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<{ token: string; user: ApiUser }> => {
    try {
      return await request<{ token: string; user: ApiUser }>("POST", "/auth/login", { email, password });
    } catch (err) {
      // Fallback to demo mode only when the server is completely unreachable
      const key = email.trim().toLowerCase();
      if (DEMO_USERS[key] && String(err).includes("Failed to fetch")) return DEMO_USERS[key];
      throw err;
    }
  },

  register: (name: string, email: string, password: string, org_slug?: string) =>
    request<{ token: string; user: ApiUser }>("POST", "/auth/register", { name, email, password, org_slug }),

  // Children
  getChildren: async (): Promise<ApiChild[]> =>
    (await isDemoSession()) ? DEMO_CHILDREN : request<ApiChild[]>("GET", "/members"),
  addChild: (data: Partial<ApiChild>) => request<ApiChild>("POST", "/members", data),
  updateChild: (id: string, data: Partial<ApiChild>) => request<ApiChild>("PATCH", `/members/${id}`, data),
  deleteChild: (id: string) => request<void>("DELETE", `/members/${id}`),

  // Courses & Enrollments
  getCourses: () => request<ApiCourse[]>("GET", "/courses"),
  getEnrollments: async (childId?: string): Promise<ApiEnrollment[]> =>
    (await isDemoSession())
      ? (childId ? DEMO_ENROLLMENTS.filter(e => String(e.child_id) === childId) : DEMO_ENROLLMENTS)
      : request<ApiEnrollment[]>("GET", childId ? `/enrollments?childId=${childId}` : "/enrollments"),
  enroll: (childId: string, courseId: string) =>
    request<ApiEnrollment>("POST", "/enrollments", { childId, courseId }),

  // Delegates
  getDelegates: async (childId?: string): Promise<ApiDelegate[]> =>
    (await isDemoSession())
      ? (childId ? DEMO_DELEGATES.filter(d => String(d.child_id) === childId) : DEMO_DELEGATES)
      : request<ApiDelegate[]>("GET", childId ? `/delegates?childId=${childId}` : "/delegates"),
  addDelegate: (data: Partial<ApiDelegate>) => request<ApiDelegate>("POST", "/delegates", data),
  removeDelegate: (id: string) => request<void>("DELETE", `/delegates/${id}`),

  // Documents
  getDocuments: async (): Promise<ApiDocument[]> =>
    (await isDemoSession()) ? DEMO_DOCUMENTS : request<ApiDocument[]>("GET", "/documents"),
  signDocument: (id: string) => request<{ ok: boolean }>("POST", `/documents/${id}/sign`),
  addDocument: (data: Partial<ApiDocument>) => request<ApiDocument>("POST", "/documents", data),

  // Payments
  getPayments: async (): Promise<ApiPayment[]> =>
    (await isDemoSession()) ? DEMO_PAYMENTS : request<ApiPayment[]>("GET", "/payments"),
  addPayment: (data: Partial<ApiPayment>) => request<ApiPayment>("POST", "/payments", data),

  // Promo Codes
  getPromoCodes: () => request<ApiPromoCode[]>("GET", "/promo-codes"),
  addPromoCode: (data: Partial<ApiPromoCode>) => request<ApiPromoCode>("POST", "/promo-codes", data),
  togglePromoCode: (id: string, active: boolean) =>
    request<ApiPromoCode>("PATCH", `/promo-codes/${id}/toggle`, { active }),
  deletePromoCode: (id: string) => request<void>("DELETE", `/promo-codes/${id}`),

  // Messages
  getMessages: () => request<ApiMessage[]>("GET", "/messages"),
  sendMessage: (data: Partial<ApiMessage>) => request<ApiMessage>("POST", "/messages", data),

  // Users (admin)
  getUsers: () => request<ApiUser[]>("GET", "/users"),
  setUserStatus: (id: string, blocked: boolean, reason?: string) =>
    request<ApiUser>("PATCH", `/users/${id}/status`, { blocked, reason }),
  setUserRole: (id: string, role: string) =>
    request<ApiUser>("PATCH", `/users/${id}/role`, { role }),

  // Students & Attendance (operator)
  getStudents: () => request<ApiStudent[]>("GET", "/students"),
  getAttendance: (sessionId?: string) =>
    request<ApiAttendance[]>("GET", sessionId ? `/attendance?sessionId=${sessionId}` : "/attendance"),
  addAttendance: (data: Partial<ApiAttendance>) => request<ApiAttendance>("POST", "/attendance", data),
  updateAttendance: (id: string, data: Partial<ApiAttendance>) =>
    request<ApiAttendance>("PATCH", `/attendance/${id}`, data),
  addStars: (studentId: string, delta: number) =>
    request<{ id: number; gold_stars: number }>("PATCH", `/students/${studentId}/stars`, { delta }),

  // Lessons
  getLessons: (date?: string) =>
    request<ApiLesson[]>("GET", date ? `/lessons?date=${date}` : "/lessons"),

  // Org
  getOrg: () => request<ApiOrg>("GET", "/org"),
  updateOrg: (data: Partial<ApiOrg> & { member_label?: string }) => request<ApiOrg>("PATCH", "/org", data),
  getTerminology: () => request<{ primaryRoleName: string; secondaryRoleName: string }>("GET", "/terminology"),

  // Reimbursements
  getReimbursements: () => request<ApiReimbursement[]>("GET", "/reimbursements"),
  createReimbursement: (data: {
    claimantName: string; claimantRole: string;
    description: string; amountCents: number; receiptUri?: string;
  }) => request<ApiReimbursement>("POST", "/reimbursements", data),
  updateReimbursement: (id: string, data: { status?: string; adminNote?: string }) =>
    request<ApiReimbursement>("PATCH", `/reimbursements/${id}`, data),

  // Profile (parent self-update)
  updateProfile: (data: { name?: string; phone?: string }) =>
    request<ApiUser>("PATCH", "/profile", data),

  // Full profile update for onboarding (includes address + onboarding_complete)
  updateFullProfile: (data: {
    firstName: string;
    lastName: string;
    phone: string;
    address: { street: string; city: string; zip: string; state: string; country: string };
  }) =>
    request<ApiUser>("PATCH", "/profile", {
      name: `${data.firstName} ${data.lastName}`.trim(),
      phone: data.phone,
      address_street:  data.address.street,
      address_city:    data.address.city,
      address_zip:     data.address.zip,
      address_state:   data.address.state,
      address_country: data.address.country,
      onboarding_complete: true,
    }),

  // Sign a document and attach drawn signature SVG
  signDocumentWithSignature: (id: string, signatureData: string) =>
    request<{ ok: boolean }>("POST", `/documents/${id}/sign`, { signature_data: signatureData }),

  // Audit Logs
  logPdfGeneration: (data: { period: string; month: string; total_amount: number; action: "generated" | "shared" }) =>
    request<{ ok: boolean }>("POST", "/pdf-logs", data),
  logEmergencyStep: (data: { protocol_id: string; protocol_title: string; step_index: number; step_text: string }) =>
    request<{ ok: boolean }>("POST", "/emergency-logs", data),

  // Checkout & Payments
  createStripeIntent: (data: { amount: number; currency?: string }) =>
    request<{ clientSecret: string; intentId: string }>("POST", "/checkout/stripe/intent", data),
  createPayPalOrder: (data: { amount: number }) =>
    request<{ orderId: string }>("POST", "/checkout/paypal/order", data),
  capturePayPalOrder: (orderId: string) =>
    request<{ success: boolean }>("POST", "/checkout/paypal/capture", { orderId }),
  checkoutComplete: (data: {
    items: Array<{ courseId: string; courseName: string; participantName: string; childId?: string; packageType: string; price: number }>;
    paymentMethod: string;
    paymentRef: string;
    amount: number;
  }) => request<{ success: boolean; invoiceNumber: string; invoiceId: number | null; transactionId: number | null; enrollmentErrors: string[] | null }>("POST", "/checkout/complete", data),

  // Enrollment Requests (validation & approval flow)
  getEnrollmentRequests: () =>
    request<ApiEnrollmentRequest[]>("GET", "/enrollment-requests"),
  createEnrollmentRequest: (data: {
    courseId: string;
    courseName: string;
    participantName: string;
    participantAge?: number;
    participantSkillLevel?: string;
    packageType: string;
    price: number;
    validationIssue: string;
    cartItemId: string;
  }) => request<ApiEnrollmentRequest>("POST", "/enrollment-requests", data),
  reviewEnrollmentRequest: (id: string, status: "approved" | "rejected", notes?: string) =>
    request<ApiEnrollmentRequest>("PATCH", `/enrollment-requests/${id}`, { status, notes }),

  // ── Private Lessons ──────────────────────────────────────────────────────

  // Disciplines
  getDisciplines: () => request<ApiDiscipline[]>("GET", "/disciplines"),
  // Locations (admin-configured rooms/studios)
  getLocations: async (): Promise<ApiLocation[]> =>
    (await isDemoSession()) ? DEMO_LOCATIONS : request<ApiLocation[]>("GET", "/locations"),
  createDiscipline: (data: { name: string; description?: string }) =>
    request<ApiDiscipline>("POST", "/disciplines", data),
  updateDiscipline: (id: number, data: Partial<{ name: string; description: string; active: boolean }>) =>
    request<ApiDiscipline>("PATCH", `/disciplines/${id}`, data),
  deleteDiscipline: (id: number) => request<void>("DELETE", `/disciplines/${id}`),

  // Operator profiles
  getOperatorProfiles: () => request<ApiOperatorProfile[]>("GET", "/operator-profiles"),
  createOperatorProfile: (data: {
    userId: number;
    profileType: "paid" | "volunteer";
    bio?: string;
    rates?: Array<{ disciplineId: number; hourlyRateCents: number }>;
  }) => request<ApiOperatorProfile>("POST", "/operator-profiles", data),
  updateOperatorProfile: (id: number, data: Partial<{
    profileType: "paid" | "volunteer";
    bio: string;
    active: boolean;
    rates: Array<{ disciplineId: number; hourlyRateCents: number }>;
  }>) => request<ApiOperatorProfile>("PATCH", `/operator-profiles/${id}`, data),
  deleteOperatorProfile: (id: number) => request<void>("DELETE", `/operator-profiles/${id}`),

  // Availability
  getAvailability: () => request<ApiAvailabilitySlot[]>("GET", "/availability"),
  submitAvailability: (data: {
    disciplineId: number;
    location: string;
    slotDate: string;
    startTime: string;
    endTime: string;
    notes?: string;
  }) => request<ApiAvailabilitySlot>("POST", "/availability", data),
  reviewAvailability: (
    id: number,
    status: "approved" | "rejected",
    parentPriceCents?: number,
    operatorPayCents?: number,
  ) =>
    request<ApiAvailabilitySlot>("PATCH", `/availability/${id}`, { status, parentPriceCents, operatorPayCents }),

  // Private bookings
  getPrivateBookings: async () => {
    if (await isDemoSession()) return DEMO_PRIVATE_BOOKINGS;
    return request<ApiPrivateBooking[]>("GET", "/private-bookings");
  },
  createPrivateBooking: (data: { availabilityId: number; childId: number }) =>
    request<ApiPrivateBooking>("POST", "/private-bookings", data),
  confirmPrivateBooking: (id: number) =>
    request<ApiPrivateBooking>("PATCH", `/private-bookings/${id}/confirm`, {}),
  cancelPrivateBooking: (id: number) =>
    request<ApiPrivateBooking>("PATCH", `/private-bookings/${id}/cancel`, {}),
  scanPrivateLesson: (qrToken: string) =>
    request<{ ok: boolean; earnings_cents: number; invoice_number: string; attended_at: string; error?: string }>(
      "POST", "/private-bookings/scan", { qrToken }
    ),

  // Operator earnings aggregation
  getOperatorEarnings: (month?: string) =>
    request<ApiOperatorEarnings>("GET", month ? `/operator-earnings?month=${month}` : "/operator-earnings"),

  // Notifications
  getPrivateNotifications: async () => {
    if (await isDemoSession()) return DEMO_PRIVATE_NOTIFICATIONS;
    return request<ApiPrivateNotification[]>("GET", "/private-notifications");
  },
  markNotificationRead: async (id: number) => {
    if (await isDemoSession()) {
      const n = DEMO_PRIVATE_NOTIFICATIONS.find(x => x.id === id);
      if (n) n.read = true;
      return { ok: true };
    }
    return request<{ ok: boolean }>("POST", `/private-notifications/${id}/read`, {});
  },
  markAllNotificationsRead: async () => {
    if (await isDemoSession()) {
      DEMO_PRIVATE_NOTIFICATIONS.forEach(n => { n.read = true; });
      return { ok: true };
    }
    return request<{ ok: boolean }>("POST", "/private-notifications/read-all", {});
  },

  // Meeting availability (all authenticated roles)
  getMeetingAvailability: async (): Promise<{ meeting_days: number[]; meeting_slots: string[] }> => {
    if (await isDemoSession()) {
      return {
        meeting_days: [1, 2, 3, 4, 5],
        meeting_slots: ["09:00 \u2013 09:45", "10:00 \u2013 10:45", "11:00 \u2013 11:45", "14:00 \u2013 14:45", "15:00 \u2013 15:45", "16:00 \u2013 16:45"],
      };
    }
    return request<{ meeting_days: number[]; meeting_slots: string[] }>("GET", "/meeting-availability");
  },

  // Admin Settings (grace access + anti-fraud)
  getAdminSettings: () => request<ApiAdminSettings>("GET", "/admin-settings"),
  updateAdminSettings: (data: Partial<ApiAdminSettings>) =>
    request<ApiAdminSettings>("PUT", "/admin-settings", data),

  // Blacklist
  getBlacklist: async (): Promise<ApiBlacklistEntry[]> =>
    (await isDemoSession()) ? [...DEMO_BLACKLIST] : request<ApiBlacklistEntry[]>("GET", "/blacklist"),
  addBlacklistEntry: async (data: Omit<ApiBlacklistEntry, "id" | "created_at">): Promise<ApiBlacklistEntry> => {
    if (await isDemoSession()) {
      const entry: ApiBlacklistEntry = { ...data, id: ++_demoBlacklistId, created_at: new Date().toISOString() };
      DEMO_BLACKLIST = [...DEMO_BLACKLIST, entry];
      return entry;
    }
    return request<ApiBlacklistEntry>("POST", "/blacklist", data);
  },
  deleteBlacklistEntry: async (id: number): Promise<void> => {
    if (await isDemoSession()) {
      DEMO_BLACKLIST = DEMO_BLACKLIST.filter(e => e.id !== id);
      return;
    }
    return request<void>("DELETE", `/blacklist/${id}`);
  },
  checkBlacklist: (data: { email?: string; phone_number?: string; first_name?: string; last_name?: string }) =>
    request<{ blocked: boolean; reason: string | null }>("POST", "/blacklist/check", data),

  // Access verification (QR anti-fraud check)
  checkAccess: (childId: string) =>
    request<ApiAccessCheck>("GET", `/access-check/${childId}`),
  updateChildPayment: (childId: string, data: { payment_status?: string; is_blocked?: boolean; block_reason?: string }) =>
    request<ApiAccessCheck>("PATCH", `/access-check/${childId}/payment`, data),

  // ── Course Availability Templates (Operator weekly regular-course schedule) ──
  getCourseAvailability: () =>
    request<ApiCourseAvailTemplate[]>("GET", "/course-availability"),
  upsertCourseAvailability: (data: { disciplineId: number; dayOfWeek: number; startTime: string; endTime: string }) =>
    request<ApiCourseAvailTemplate>("PUT", "/course-availability", data),
  deleteCourseAvailability: (id: number) =>
    request<void>("DELETE", `/course-availability/${id}`),

  // ── Stripe Connect ───────────────────────────────────────────────────────
  stripeOnboarding: () =>
    request<{ url: string; connectId: string }>("POST", "/finance/stripe-onboarding", {}),
  stripeStatus: () =>
    request<{ configured: boolean; connectId: string | null }>("GET", "/finance/stripe-status"),

  // ── Scheduled Courses (Admin-created targeted recurring courses) ─────────────
  getScheduledCourses: () =>
    request<ApiScheduledCourse[]>("GET", "/scheduled-courses"),
  createScheduledCourse: (data: {
    disciplineId: number;
    operatorProfileId?: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    ageMin?: number;
    ageMax?: number;
    skillLevel?: string;
    notes?: string;
  }) => request<ApiScheduledCourse>("POST", "/scheduled-courses", data),
  confirmScheduledCourse: (id: number) =>
    request<ApiScheduledCourse>("POST", `/scheduled-courses/${id}/confirm`, {}),
  declineScheduledCourse: (id: number) =>
    request<ApiScheduledCourse>("POST", `/scheduled-courses/${id}/decline`, {}),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: string | number;
  name: string;
  email: string;
  role: string;
  roles?: string;
  blocked?: boolean;
  blocked_reason?: string;
  phone?: string;
  orgId?: number;
  organization_id?: number;
  staff_type?: string;
  created_at?: string;
}

export interface ApiChild {
  id: number;
  user_id: number;
  full_name?: string;
  name: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  date_of_birth?: string;
  gold_stars: number;
  allergies?: string;
  allergies_list?: string;
  ambulance_consent?: boolean;
  medical_notes?: string;
  media_consent?: string;
  photo_url?: string;
  qr_payload?: string;
}

export interface ApiCourse {
  id: number;
  name: string;
  discipline?: string;
  price?: number;
  capacity?: number;
  age_min?: number;
  age_max?: number;
  level?: string;
  description?: string;
  days_of_week?: string;
  start_date?: string;
  instructor?: { id: number; name: string } | null;
  venue?: { id: number; name: string } | null;
}

export interface ApiEnrollment {
  id: number;
  child_id: number;
  course_id: number;
  status: string;
  enrolled_at?: string;
  course?: ApiCourse | null;
}

export interface ApiDelegate {
  id: number;
  parent_id: number;
  child_id: number;
  name: string;
  surname: string;
  phone: string;
  relationship?: string;
  pin?: string;
  email?: string;
}

export interface ApiDocument {
  id: number;
  organization_id: number;
  title: string;
  type: string;
  mandatory?: boolean;
  file_url?: string;
  signed?: boolean;
  expires_at?: string;
  created_at?: string;
}

export interface ApiPayment {
  id: number;
  organization_id: number;
  amount?: number;
  created_at?: string;
  description?: string;
  status?: string;
}

export interface ApiPromoCode {
  id: number;
  organization_id: number;
  code: string;
  description?: string;
  discount_percent?: number;
  discount_amount?: number;
  max_uses?: number;
  uses: number;
  valid_from?: string;
  valid_until?: string;
  kind?: string;
  target_type?: string;
}

export interface ApiReimbursement {
  id: number;
  organization_id: number;
  claimant_user_id: number;
  claimant_name: string;
  claimant_role: "admin" | "paid_operator" | "volunteer" | "parent";
  description: string;
  amount_cents: number;
  receipt_uri?: string;
  status: "pending" | "approved" | "paid" | "rejected";
  admin_note?: string;
  submitted_at: string;
  updated_at: string;
}

export interface ApiMessage {
  id: number;
  organization_id: number;
  sender_id: number;
  title: string;
  body: string;
  target?: string;
  created_at?: string;
  sender?: { id: number; name: string; role: string };
}

export interface ApiStudent {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  gold_stars: number;
  allergies?: string;
  ambulance_consent?: boolean;
  parent?: { id: number; name: string; phone?: string } | null;
  enrollments?: Array<{ course_id: number; status: string; course: { id: number; name: string } | null }>;
}

export interface ApiAttendance {
  id: number;
  session_id?: number;
  child_id: number;
  check_in_time?: string;
  check_out_time?: string;
  status?: string;
  gold_stars_awarded?: number;
  notes?: string;
  child?: ApiChild | null;
}

export interface ApiLesson {
  id: number;
  course_id: number;
  start_time?: string;
  end_time?: string;
  organization_id: number;
  course?: ApiCourse | null;
}

export interface ApiOrg {
  id: number;
  name: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  contact_phone?: string;
  official_email?: string;
  legal_address?: string;
  region?: string;
  plan?: string;
  birthday_message?: string;
}

export interface ApiEnrollmentRequest {
  id: string;
  org_id?: number;
  course_id?: string;
  course_name: string;
  participant_name: string;
  participant_age?: number;
  participant_skill_level?: string;
  package_type: string;
  price: number;
  validation_issue?: string;
  cart_item_id?: string;
  parent_user_id?: string;
  reviewed_by?: string;
  operator_notes?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

// ── Private Lesson Types ──────────────────────────────────────────────────────

export interface ApiLocation {
  id: number;
  name: string;
  description?: string;
  active: boolean;
}

export interface ApiDiscipline {
  id: number;
  organization_id: number;
  name: string;
  description?: string;
  active: boolean;
  created_at: string;
}

export interface ApiDisciplineRate {
  id: number;
  operator_profile_id: number;
  discipline_id: number;
  hourly_rate_cents: number;
  discipline?: { id: number; name: string };
}

export interface ApiOperatorProfile {
  id: number;
  user_id: number;
  organization_id: number;
  profile_type: "paid" | "volunteer";
  bio?: string;
  active: boolean;
  created_at: string;
  user?: { id: number; name: string; email: string };
  rates?: ApiDisciplineRate[];
}

export interface ApiAvailabilitySlot {
  id: number;
  operator_profile_id: number;
  organization_id: number;
  discipline_id: number;
  location: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "approved" | "rejected" | "booked";
  parent_price_cents?: number;
  /** Operator's hourly pay rate in cents (set by admin on approval) */
  operator_pay_cents?: number;
  notes?: string;
  created_at: string;
  operator_profile?: {
    id: number;
    profile_type: "paid" | "volunteer";
    user?: { id: number; name: string };
  };
  discipline?: { id: number; name: string };
}

export interface ApiPrivateBooking {
  id: number;
  organization_id: number;
  availability_id: number;
  child_id: number;
  parent_user_id: number;
  operator_user_id: number;
  discipline_id: number;
  location: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  price_cents: number;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  qr_token?: string;
  attended_at?: string;
  earnings_cents?: number;
  operator_notes?: string;
  created_at: string;
  discipline?: { id: number; name: string };
  child?: { id: number; name: string };
  operator?: { id: number; name: string };
}

export interface ApiOperatorEarnings {
  month: string;
  disciplines: Array<{
    discipline_id: number;
    discipline_name: string;
    lesson_count: number;
    total_minutes: number;
    total_hours: number;
    earnings_cents: number;
    hourly_rate_cents: number;
  }>;
  total_lessons: number;
  total_hours: number;
  total_earnings_cents: number;
}

export interface ApiPrivateNotification {
  id: number;
  organization_id: number;
  recipient_id: number;
  sender_id?: number;
  type:
    | "booking_request"
    | "booking_confirmed"
    | "booking_cancelled"
    | "availability_approved"
    | "availability_rejected"
    | "lesson_reminder"
    | "payment_received";
  title: string;
  body: string;
  booking_id?: number;
  read: boolean;
  created_at: string;
}

export interface ApiAdminSettings {
  id?: number;
  organization_id: number;
  allow_one_time_grace_access: boolean;
  grace_used_child_ids: number[];
  updated_at?: string;
}

export interface ApiBlacklistEntry {
  id: number;
  organization_id?: number;
  email?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  reason?: string;
  blocked_by_user_id?: number;
  created_at: string;
}

export interface ApiAccessCheck {
  verdict: "allowed" | "suspended" | "grace_allowed" | "overdue_denied";
  childId: string;
  childName: string;
  blockReason?: string;
}

// ── Scheduling Ecosystem ──────────────────────────────────────────────────────

/** Operator's weekly recurring course-teaching availability template. */
export interface ApiCourseAvailTemplate {
  id: number;
  operator_id: number;
  organization_id: number;
  discipline_id: number;
  /** ISO weekday 0=Sunday…6=Saturday */
  day_of_week: number;
  start_time: string;
  end_time: string;
  created_at: string;
  discipline?: { id: number; name: string };
  operator?: { id: number; name: string };
}

/** Admin-created targeted recurring course. Requires operator confirmation before going active. */
export interface ApiScheduledCourse {
  id: number;
  organization_id: number;
  discipline_id: number;
  operator_profile_id?: number;
  /** ISO weekday 0=Sunday…6=Saturday */
  day_of_week: number;
  start_time: string;
  end_time: string;
  age_min: number;
  age_max: number;
  skill_level: "beginner" | "intermediate" | "advanced" | "open";
  status: "pending_confirmation" | "active" | "declined" | "cancelled";
  notes?: string;
  created_by_admin_id?: number;
  created_at: string;
  confirmed_at?: string;
  discipline?: { id: number; name: string };
  operator?: {
    id: number;
    profile_type: "paid" | "volunteer";
    user?: { id: number; name: string };
  };
}
