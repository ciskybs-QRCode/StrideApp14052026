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

export async function request<T>(
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
    request<{ token: string; user: ApiUser; isPioneer?: boolean }>("POST", "/auth/register", { name, email, password, org_slug }),

  systemStatus: () =>
    request<{ configured: boolean; userCount: number; orgName: string | null; trialEndsAt: string | null; trialExpired: boolean; subscriptionStatus: string }>("GET", "/auth/system-status"),

  generateInvite: () =>
    request<{ token: string; url: string }>("POST", "/auth/invite", {}),

  validateInvite: (token: string) =>
    request<{ valid: boolean; orgId: number; orgName: string }>("GET", `/auth/invite/${token}`),

  pioneerComplete: (data: {
    schoolName: string;
    registrationNumber?: string;
    contactPhone?: string;
    studios?: { name: string; capacity: number }[];
    ageGroups?: string[];
    skillLevels?: string[];
  }) => request<{ configured: boolean }>("POST", "/org/configure", data),

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
  addAttendance: (data: Partial<ApiAttendance> & { check_in_method?: string; attended_at?: string }) =>
    request<ApiAttendance>("POST", "/attendance", data),
  updateAttendance: (id: string, data: Partial<ApiAttendance>) =>
    request<ApiAttendance>("PATCH", `/attendance/${id}`, data),
  addStars: (studentId: string, delta: number) =>
    request<{ id: number; gold_stars: number }>("PATCH", `/students/${studentId}/stars`, { delta }),

  // Sessions — roster & sign-out
  todaySessions: () =>
    request<{
      id: number; name: string; start_time: string; end_time: string;
      discipline_id: number; disciplines: { name: string } | null;
    }[]>("GET", "/sessions/today"),
  sessionRoster: (sessionId: number) =>
    request<{
      child_id: number; first_name: string; last_name: string;
      allergies: string | null; gold_stars: number;
      parent: { id: number; name: string; phone: string } | null;
      attendance_id: number | null; check_in_method: string | null;
      status: "present" | "absent" | "signed_out";
    }[]>("GET", `/sessions/${sessionId}/roster`),
  bulkSignOut: (sessionId: number) =>
    request<{ updated: number }>("POST", `/sessions/${sessionId}/bulk-signout`, {}),

  // Operator clock-in / clock-out
  clockIn: (payload: { session_id?: number; notes?: string }) =>
    request<{ id: number; clock_in: string; already_clocked_in?: boolean }>("POST", "/operator-clock/in", payload),
  clockOut: (payload?: { notes?: string }) =>
    request<{ id: number; clock_in: string; clock_out: string }>("POST", "/operator-clock/out", payload ?? {}),
  clockStatus: () =>
    request<{ clocked_in: boolean; record: { id: number; clock_in: string; session_id: number | null } | null }>(
      "GET", "/operator-clock/status"
    ),
  clockRecords: (params?: { date?: string; operatorId?: string }) => {
    const qs = params ? `?${new URLSearchParams(params as Record<string,string>).toString()}` : "";
    return request<{
      id: number; operator_id: number; clock_in: string; clock_out: string | null; session_id: number | null;
    }[]>("GET", `/operator-clock${qs}`);
  },

  // Lessons
  getLessons: (date?: string) =>
    request<ApiLesson[]>("GET", date ? `/lessons?date=${date}` : "/lessons"),

  // QR verification
  verifyMemberQr: (qrData: string) =>
    request<{ name: string; subscription: "active" | "expired" | "none"; medical: "valid" | "expiring" | "expired"; payment: "paid" | "overdue" | "pending"; type: "success" | "warning" | "error" }>("POST", "/verify-member-qr", { qrData }),

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

  // Legal Signature Audit Log
  legalSign: (payload: {
    document_id: string;
    document_version?: string;
    document_content?: string;
    selected_option?: string;
    signature_svg: string;
    device_os?: string;
  }) => request<{ ok: boolean; hash: string }>("POST", "/legal/sign", payload),

  legalSignedIds: () => request<{ ids: string[] }>("GET", "/legal/signed-ids"),

  legalAuditLog: () => request<{
    id: string;
    user_id: number;
    document_id: string;
    document_version: string;
    selected_option: string | null;
    timestamp: string;
    ip_address: string | null;
    device_operating_system: string | null;
    document_text_hash: string;
    user_email: string | null;
  }[]>("GET", "/legal/audit-log"),

  // Audit Logs
  logPdfGeneration: (data: { period: string; month: string; total_amount: number; action: "generated" | "shared" }) =>
    request<{ ok: boolean }>("POST", "/pdf-logs", data),
  logEmergencyStep: (data: { protocol_id: string; protocol_title: string; step_index: number; step_text: string }) =>
    request<{ ok: boolean }>("POST", "/emergency-logs", data),

  // Checkout & Payments — Web-Checkout Proxy model
  // Client sends item descriptors only (no prices). Server fetches prices from DB,
  // logs to payment_audit_log, creates the Stripe session, returns the verified itemized breakdown.
  createWebCheckoutSession: (data: {
    items: Array<{
      courseId:        string;
      courseName:      string;
      participantName: string;
      childId?:        string;
      packageType:     string;
      clientPrice?:    number;   // only sent for private/non-DB lessons
    }>;
    promoCode?:            string;
    promoDiscountType?:    "percent" | "amount";
    promoDiscountPercent?: number;
    promoDiscountAmount?:  number;
    promoTargetCourseIds?: string[];
  }) => request<{
    sessionId:       string;
    checkoutUrl:     string;
    auditId:         string;
    lineItems: Array<{
      courseId:        string;
      courseName:      string;
      participantName: string;
      packageType:     string;
      unitPrice:       number;
      discount:        number;
      finalPrice:      number;
      priceSource:     "db" | "client_fallback";
    }>;
    calculatedTotal:  number;
    discountApplied:  number;
    currency:         string;
  }>("POST", "/checkout/web-session", data),
  getCheckoutSessionStatus: (sessionId: string) =>
    request<{ status: "pending" | "complete" | "expired"; invoiceNumber: string | null; invoiceId: number | null }>("GET", `/checkout/session-status/${sessionId}`),

  createBatchCheckoutSession: (data: {
    groups: Array<{
      orgId: number;
      items: Array<{
        courseId:        string;
        courseName:      string;
        participantName: string;
        childId?:        string;
        packageType:     string;
        clientPrice?:    number;
      }>;
    }>;
    promoCode?:            string;
    promoDiscountType?:    "percent" | "amount";
    promoDiscountPercent?: number;
    promoDiscountAmount?:  number;
    promoTargetCourseIds?: string[];
  }) => request<{
    batchId:       string;
    sessions: Array<{
      position:    number;
      sessionId:   string;
      checkoutUrl: string;
      orgId:       number;
      orgName:     string;
      amountCents: number;
      currency:    string;
    }>;
    totalSessions: number;
  }>("POST", "/checkout/batch-session", data),

  getBatchStatus: (batchId: string) =>
    request<{
      batchId:        string;
      status:         "pending" | "partial" | "complete" | "abandoned";
      totalSessions:  number;
      completedCount: number;
      totalCents:     number;
      sessions: Array<{
        position:      number;
        sessionId:     string;
        status:        "pending" | "complete" | "expired";
        checkoutUrl:   string | null;
        orgId:         number;
        orgName:       string | null;
        amountCents:   number;
        invoiceNumber: string | null;
      }>;
    }>("GET", `/checkout/batch-status/${batchId}`),

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

  // ── Absence Planning ───────────────────────────────────────────────────────

  reportOperatorFutureAbsence: (payload: {
    mode: "hourly" | "full_day" | "range";
    absence_date: string;
    end_date?: string;
    start_time?: string;
    end_time?: string;
    reason?: string;
  }) => request<{ id: number }>("POST", "/absences/operator/future", payload),

  reportStudentFutureAbsence: (payload: {
    student_id: string;
    student_name: string;
    mode: "single" | "range";
    absence_date: string;
    end_date?: string;
    note?: string;
  }) => request<{ id: number }>("POST", "/absences/student/future", payload),

  // ── Vision AI ───────────────────────────────────────────────────────────────

  analyzeMedicalCertificate: (payload: {
    image_base64: string;
    mime_type: string;
    member_id?: string | number;
  }) => request<{
    record_id: number | null;
    student_full_name: string;
    expiration_date: string | null;
    doctor_name: string;
    certificate_type: "agonistico" | "non-agonistico" | "other";
    classification_confidence: number;
    potential_anomaly_detected: boolean;
    anomaly_reasons: string | null;
    status: "AI-Verified" | "Pending Admin Review";
  }>("POST", "/documents/analyze-medical-certificate", payload),

  // ── Guardian Circle ────────────────────────────────────────────────────────
  listGuardianCircle: (childId: string) =>
    request<{ entries: GuardianCircleApiEntry[] }>(
      "GET", `/guardian-circle/child/${encodeURIComponent(childId)}`,
    ).then(r => r.entries),

  addGuardianCircle: (data: {
    child_id:                  string;
    guardian_name:             string;
    guardian_email?:           string | null;
    guardian_phone?:           string | null;
    expires_at?:               string | null;
    is_single_use?:            boolean;
    pickup_days?:              string[] | null;
    pickup_window_start?:      string | null;
    pickup_window_end?:        string | null;
    window_tolerance_minutes?: number;
  }) => request<GuardianCircleApiEntry>("POST", "/guardian-circle", data),

  deactivateGuardianCircle: (id: string) =>
    request<GuardianCircleApiEntry>("PATCH", `/guardian-circle/${id}/deactivate`),

  checkGuardianCircle: (childId: string, guardianId: string) =>
    request<{ authorized: boolean; reason: string }>(
      "GET",
      `/guardian-circle/check?childId=${encodeURIComponent(childId)}&guardianId=${encodeURIComponent(guardianId)}`,
    ),

  scanGuardianQR: (guardianId: string, data: { child_id: string; class_start_time?: string }) =>
    request<{
      verdict:          "ok" | "override_required";
      reason?:          string;
      is_social_arrival?: boolean;
      guardian:         GuardianCircleApiEntry;
    }>("POST", `/guardian-circle/${guardianId}/scan`, data),

  confirmGuardianOverride: (guardianId: string, data: { child_id: string; override_reason: string; override_note?: string }) =>
    request<{ success: boolean; overridden_at: string }>(
      "POST", `/guardian-circle/${guardianId}/override`, data,
    ),

  // ── Stride Safety Score ────────────────────────────────────────────────────
  searchOrgs: (q?: string) =>
    request<OrgSearchResult[]>(
      "GET",
      `/orgs/search${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`,
    ),

  getOrgSafetyScore: (orgId: number | string) =>
    request<SafetyScoreResult>("GET", `/orgs/safety-score/${orgId}`),

  submitReview: (data: {
    org_id:               number;
    course_id?:           number | null;
    safety_rating:        number;
    communication_rating: number;
    comment?:             string | null;
  }) => request<{ id: string }>("POST", "/reviews", data),

  listOrgReviews: (orgId: number | string) =>
    request<{ reviews: OrgReview[] }>("GET", `/reviews/org/${orgId}`),

  // ── Emergency Pulse ────────────────────────────────────────────────────────
  triggerEmergencyPulse: (data: { org_id?: number | null; location_label?: string }) =>
    request<{ pulse_id: string; triggered_at: string; checked_in_count: number }>(
      "POST", "/emergency/pulse", data,
    ),

  getActivePulse: () =>
    request<EmergencyPulse | null>("GET", "/emergency/pulse/active"),

  getPulseStatus: (id: string) =>
    request<PulseStatus>("GET", `/emergency/pulse/${id}/status`),

  acknowledgePulse: (id: string, data: { status: "safe" | "missing" }) =>
    request<{ ok: boolean; status: string }>(
      "POST", `/emergency/pulse/${id}/acknowledge`, data,
    ),

  resolvePulse: (id: string) =>
    request<{ ok: boolean; resolved: boolean }>(
      "PATCH", `/emergency/pulse/${id}/resolve`,
    ),

  // ── BLE Proximity Check-in ─────────────────────────────────────────────────
  proximityDetect: (data: { wearable_uuid?: string; beacon_uuid?: string; child_id?: string; rssi?: number }) =>
    request<ProximityDetectResult>("POST", "/proximity/detect", data),

  listProximityBeacons: () =>
    request<{ beacons: ProximityBeacon[] }>("GET", "/proximity/beacons"),

  registerProximityBeacon: (data: { beacon_uuid: string; label: string; zone?: string; zone_category?: string; org_id?: number }) =>
    request<ProximityBeacon>("POST", "/proximity/beacons", data),

  deleteProximityBeacon: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/proximity/beacons/${id}`),

  listBeaconAssignments: () =>
    request<{ assignments: ChildBeaconAssignment[] }>("GET", "/proximity/assignments"),

  assignBeacon: (data: { child_id: string; wearable_uuid: string; label?: string }) =>
    request<ChildBeaconAssignment>("POST", "/proximity/assignments", data),

  deleteBeaconAssignment: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/proximity/assignments/${id}`),

  listRecentProximityCheckins: () =>
    request<{ entries: ProximityRecentEntry[] }>("GET", "/proximity/recent"),

  listTransitWarnings: () =>
    request<{ warnings: ChildTransitWarning[] }>("GET", "/proximity/transit-warnings"),

  clearTransitState: (childId: string) =>
    request<{ ok: boolean; child_id: string; status: string }>("POST", `/proximity/transit-clear/${childId}`),

  // ── Stride-Verified Marketplace ────────────────────────────────────────────
  listMarketplaceProducts: (params?: { org_id?: number; category?: string; verified?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.org_id   != null)  qs.set("org_id",   String(params.org_id));
    if (params?.category)          qs.set("category",  params.category);
    if (params?.verified === true) qs.set("verified",  "true");
    const q = qs.toString();
    return request<{ products: MarketplaceProduct[] }>("GET", `/marketplace/products${q ? `?${q}` : ""}`);
  },

  createMarketplaceProduct: (data: {
    title: string; description?: string; category?: string;
    price_cents: number; currency?: string; platform_fee_pct?: number;
    image_url?: string; is_stride_verified?: boolean; org_id?: number | null;
  }) =>
    request<MarketplaceProduct>("POST", "/marketplace/products", data),

  updateMarketplaceProduct: (id: string, data: Partial<{
    title: string; description: string; category: string; price_cents: number;
    platform_fee_pct: number; image_url: string; is_active: boolean; is_stride_verified: boolean;
  }>) =>
    request<MarketplaceProduct>("PATCH", `/marketplace/products/${id}`, data),

  deleteMarketplaceProduct: (id: string) =>
    request<{ ok: boolean }>("DELETE", `/marketplace/products/${id}`),

  marketplaceCheckout: (data: { product_id: string; quantity?: number }) =>
    request<MarketplaceCheckoutResult>("POST", "/marketplace/checkout", data),

  listMarketplacePurchases: () =>
    request<{ purchases: MarketplacePurchase[] }>("GET", "/marketplace/purchases"),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrgSearchResult {
  id:           number;
  name:         string;
  location:     string | null;
  description:  string | null;
  logo_url:     string | null;
  slug:         string | null;
  safety_score: number;
  is_verified:  boolean;
  review_count: number;
  avg_rating:   number;
  score_label:  "Excellent" | "Good" | "Fair" | "New";
}

export interface SafetyScoreResult {
  org_id:             number;
  total:              number;
  protocol_adherence: number;
  parent_feedback:    number;
  emergency_response: number;
  review_count:       number;
  avg_rating:         number;
  is_verified:        boolean;
  label:              string;
}

export interface OrgReview {
  id:                   string;
  safety_rating:        number;
  communication_rating: number;
  comment:              string | null;
  created_at:           string;
}

export interface EmergencyPulse {
  id:             string;
  org_id:         number | null;
  triggered_by:   string;
  location_label: string;
  status:         "active" | "resolved";
  triggered_at:   string;
  resolved_at:    string | null;
  type?:           "emergency_pulse" | "ble_timeout" | "security_escalation";
  dependent_name?: string;
}

export interface PulseStatus extends EmergencyPulse {
  safe_count:    number;
  missing_count: number;
  total_acks:    number;
  acks: Array<{ parent_id: string; status: string; acked_at: string }>;
}

export interface MarketplaceProduct {
  id:                string;
  org_id:            number | null;
  title:             string;
  description:       string | null;
  category:          string;
  price_cents:       number;
  currency:          string;
  platform_fee_pct:  number;
  image_url:         string | null;
  is_stride_verified: boolean;
  is_active:         boolean;
  created_at:        string;
}

export interface MarketplaceCheckoutResult {
  checkoutUrl:        string;
  sessionId:          string;
  amount_cents:       number;
  platform_fee_cents: number;
  net_cents:          number;
  currency:           string;
  product:            { title: string; category: string };
}

export interface MarketplacePurchase {
  id:                string;
  stripe_session_id: string | null;
  amount_cents:      number;
  platform_fee_cents: number;
  status:            string;
  purchased_at:      string;
  title:             string;
  category:          string;
  image_url:         string | null;
  is_stride_verified: boolean;
}

export interface ProximityBeacon {
  id:            string;
  org_id:        number | null;
  beacon_uuid:   string;
  label:         string;
  zone:          string;
  zone_category: "core" | "transition" | "external_safe_zone" | "exit";
  active:        boolean;
  created_at:    string;
}

export interface ChildTransitWarning {
  child_id:           string;
  status:             string;
  transit_lock:       boolean;
  transit_started_at: string;
  updated_at:         string;
  minutes_elapsed:    number;
}

export interface ChildBeaconAssignment {
  id:            string;
  child_id:      string;
  wearable_uuid: string;
  label:         string;
  active:        boolean;
  assigned_at:   string;
}

export interface ProximityDetectResult {
  auto_checked_in:    boolean;
  already_checked_in: boolean;
  child_id:           string | null;
  detected_uuid?:     string | null;
  checked_in_at?:     string;
  message?:           string;
}

export interface ProximityRecentEntry {
  id:        string;
  child_id:  string;
  timestamp: string;
  metadata:  {
    trigger?:       string;
    wearable_uuid?: string;
    rssi?:          number | null;
    notes?:         string;
  };
}

export interface GuardianCircleApiEntry {
  id:                       string;
  child_id:                 string;
  guardian_name:            string;
  guardian_email:           string | null;
  guardian_phone:           string | null;
  is_active:                boolean;
  expires_at:               string | null;
  created_at:               string;
  is_single_use:            boolean;
  used_at:                  string | null;
  pickup_days:              string[] | null;
  pickup_window_start:      string | null;
  pickup_window_end:        string | null;
  window_tolerance_minutes: number;
}

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
  is_owner?: boolean;
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
  organization_id?: number;
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
    // 27 production types
    | "promo"
    | "attendance_alert"
    | "emergency"
    | "course_assignment"
    | "broadcast"
    | "check_in"
    | "course_pending_confirmation"
    | "feedback"
    | "lesson_decision"
    | "chat_message"
    | "emergency_resolved"
    | "lesson_disruption"
    | "emergency_medical"
    | "document"
    | "meeting"
    | "achievement"
    | "substitute_request"
    | "material"
    | "compliance"
    | "private_lesson_approved"
    | "emergency_police"
    | "emergency_fire"
    | "reimbursement"
    | "private_lesson_proposed"
    | "emergency_pulse"
    | "ble_timeout"
    | "security_escalation"
    // legacy types kept for backward compat
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

// ── Kiosk Provisioning ────────────────────────────────────────────────────────

export type KioskAccount = {
  id: number;
  name: string;
  email: string;
  generatedEmail?: string;
  created_at: string;
};

export async function listKiosks(): Promise<KioskAccount[]> {
  return request<KioskAccount[]>("GET", "/admin/kiosks");
}

export async function createKiosk(
  deviceName: string,
  password: string,
): Promise<KioskAccount & { generatedEmail: string }> {
  return request<KioskAccount & { generatedEmail: string }>("POST", "/admin/create-kiosk", {
    deviceName,
    password,
  });
}

export async function revokeKiosk(userId: number): Promise<void> {
  return request<void>("DELETE", `/admin/revoke-kiosk/${userId}`);
}

export async function getKioskPin(): Promise<string> {
  const res = await request<{ pin: string }>("GET", "/kiosk-pin");
  return res.pin ?? "4321";
}

export async function getAdminKioskPin(): Promise<string> {
  const res = await request<{ pin: string }>("GET", "/admin/kiosk-pin");
  return res.pin ?? "4321";
}

export async function setAdminKioskPin(pin: string): Promise<string> {
  const res = await request<{ pin: string }>("PUT", "/admin/kiosk-pin", { pin });
  return res.pin;
}

// ── Super-Admin ───────────────────────────────────────────────────────────────

export type AssociationRecord = {
  id: number;
  name: string;
  currency?: string;
  country?: string;
  legal_framework?: string;
  tenant_type?: string;
  stripe_connect_account_id?: string;
  trial_started_at?: string;
  trial_ends_at?: string;
  is_trial_extended?: boolean;
  subscription_status?: "active" | "trialing" | "past_due" | "suspended" | "expired";
  cost_per_seat_cents?: number;
  member_count?: number;
  qr_base_price_cents?: number;
  qr_discount_type?: "fixed" | "percent";
  qr_discount_value?: number;
  promo_code?: string;
};

export interface TenantOptions {
  trialValue?: number;
  trialUnit?: "days" | "weeks" | "months" | "years";
  qrBasePriceCents?: number;
  qrDiscountType?: "fixed" | "percent";
  qrDiscountValue?: number;
  promoCode?: string;
}

export type PlatformEvent = {
  id: number;
  event_type: string;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type PlatformMetrics = {
  totalOrgs: number;
  totalMembers: number;
  activeCount: number;
  trialingCount: number;
  expiredCount: number;
  recentEvents: PlatformEvent[];
};

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  return request<PlatformMetrics>("GET", "/super-admin/metrics");
}

export async function listAssociations(): Promise<AssociationRecord[]> {
  return request<AssociationRecord[]>("GET", "/super-admin/associations");
}

export async function extendTrial(
  orgId: number,
  months: number,
): Promise<AssociationRecord> {
  return request<AssociationRecord>("POST", "/super-admin/extend-trial", { orgId, months });
}

export async function updateAssociation(
  id: number,
  data: Partial<Pick<AssociationRecord, "currency" | "country" | "legal_framework" | "tenant_type" | "stripe_connect_account_id">>,
): Promise<AssociationRecord> {
  return request<AssociationRecord>("PATCH", `/super-admin/associations/${id}`, data);
}

export async function setSuspension(
  orgId: number,
  suspended: boolean,
): Promise<AssociationRecord> {
  return request<AssociationRecord>("POST", "/super-admin/set-suspension", { orgId, suspended });
}

export async function setTrialEndDate(
  orgId: number,
  trialEndsAt: string,
): Promise<AssociationRecord> {
  return request<AssociationRecord>("POST", "/super-admin/set-trial-end", { orgId, trialEndsAt });
}

export type FinancialOrgRecord = {
  orgId: number;
  name: string;
  status: string;
  memberCount: number;
  costPerSeatCents: number;
  mrrCents: number;
  currency: string;
};

export type FinancialSummary = {
  totalMrrCents: number;
  trialMrrCents: number;
  totalMemberCount: number;
  orgs: FinancialOrgRecord[];
};

export type AdminRecord = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type CreateTenantResult = AssociationRecord & { tempPassword?: string };
export type AddSuperAdminResult = AdminRecord & { tempPassword?: string };

export async function getFinancialAnalytics(): Promise<FinancialSummary> {
  return request<FinancialSummary>("GET", "/super-admin/financial");
}

export async function createTenant(
  name: string,
  adminEmail: string,
  plan: "starter" | "pro" | "standard",
  options?: TenantOptions,
): Promise<CreateTenantResult> {
  return request<CreateTenantResult>("POST", "/super-admin/tenants", { name, adminEmail, plan, ...options });
}

export async function listAdmins(): Promise<AdminRecord[]> {
  return request<AdminRecord[]>("GET", "/super-admin/admins");
}

export async function updateUserRole(userId: number, newRole: string): Promise<AdminRecord> {
  return request<AdminRecord>("PATCH", `/super-admin/users/${userId}/role`, { newRole });
}

export async function deleteUser(userId: number): Promise<void> {
  return request<void>("DELETE", `/super-admin/users/${userId}`);
}

export async function addSuperAdmin(
  email: string,
  name?: string,
): Promise<AddSuperAdminResult> {
  return request<AddSuperAdminResult>("POST", "/super-admin/add-super-admin", { email, name });
}

// ── Admin Copilot ─────────────────────────────────────────────────────────────

export interface CopilotResponse {
  intent: string;
  summary: string;
  columns: string[];
  rows: string[][];
  totalCount: number;
  latencyMs: number;
  executedAt: string;
  meta: Record<string, unknown>;
  intentResult: { intent: string; period: string; location?: string | null };
}

export async function adminCopilotQuery(query: string): Promise<CopilotResponse> {
  return request<CopilotResponse>("POST", "/admin/copilot-query", { query });
}

// ── Predictive Substitutes ────────────────────────────────────────────────────

export interface PredictiveSubstitute {
  id: string;
  name: string;
  email: string;
  matchPercent: number;
  availabilityScore: number;
  courseMatchScore: number;
  costScore: number;
  reasons: string[];
  hourlyRateCents: number | null;
}

export async function getPredictiveSubstitutes(params: {
  missing_operator_id: string;
  class_datetime: string;
  discipline_id?: string;
  org_id?: string;
}): Promise<PredictiveSubstitute[]> {
  const q = new URLSearchParams();
  q.set("missing_operator_id", params.missing_operator_id);
  q.set("class_datetime", params.class_datetime);
  if (params.discipline_id) q.set("discipline_id", params.discipline_id);
  if (params.org_id) q.set("org_id", params.org_id);
  return request<PredictiveSubstitute[]>("GET", `/finance/predictive-substitutes?${q.toString()}`);
}

// ── Billing ───────────────────────────────────────────────────────────────────

export type BillingStatus = {
  subscriptionStatus: string;
  trialEndsAt: string | null;
  trialExpired: boolean;
  memberCount: number;
  costPerSeatCents: number;
  currency: string;
  totalMonthlyCents: number;
  hasActiveSubscription: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export async function getBillingStatus(): Promise<BillingStatus> {
  return request<BillingStatus>("GET", "/billing/status");
}

export async function createCheckoutSession(): Promise<{ url: string; sessionId: string }> {
  return request<{ url: string; sessionId: string }>("POST", "/billing/checkout-session", {});
}

export async function syncSeats(): Promise<{ success: boolean; memberCount: number }> {
  return request<{ success: boolean; memberCount: number }>("POST", "/billing/sync-seats", {});
}

// ── Owner Settings ────────────────────────────────────────────────────────────

export async function getOwnerSettings(): Promise<{ email: string }> {
  return request<{ email: string }>("GET", "/super-admin/owner-settings");
}

export async function updateOwnerEmail(
  newEmail: string,
  currentPassword: string,
): Promise<{ token: string; email: string; is_owner: boolean }> {
  return request<{ token: string; email: string; is_owner: boolean }>(
    "POST", "/super-admin/owner-email", { newEmail, currentPassword },
  );
}

export async function updateOwnerPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    "POST", "/super-admin/owner-password", { currentPassword, newPassword },
  );
}

export async function seedSuperAdmin(
  name: string,
  email: string,
  password: string,
): Promise<{ token: string; user: { id: string; name: string; email: string; role: string } }> {
  return request<{ token: string; user: { id: string; name: string; email: string; role: string } }>(
    "POST", "/super-admin/seed", { name, email, password },
  );
}

// ── Digital Proof of Presence ───────────────────────────────────────────────

export type PickupSignaturePayload = {
  child_id:       string;
  child_name:     string;
  guardian_name:  string;
  relationship:   string;
  lat:            number | null;
  lng:            number | null;
  signature_blob: string;
};

export type PickupRecord = {
  pickup_id:     string;
  child_id:      string;
  child_name:    string;
  operator_name: string | null;
  guardian_name: string | null;
  relationship:  string | null;
  lat:           number | null;
  lng:           number | null;
  hash_preview:  string;
  created_at:    string;
};

export async function submitPickupSignature(
  payload: PickupSignaturePayload,
): Promise<{ pickupId: string; integrityHash: string }> {
  return request<{ pickupId: string; integrityHash: string }>(
    "POST", "/security/pickup-signature", payload,
  );
}

export async function getPickupAuditLog(childId: string): Promise<PickupRecord[]> {
  const res = await request<{ records: PickupRecord[] }>(
    "GET", `/security/audit-log/${encodeURIComponent(childId)}`,
  );
  return res.records;
}

// ── System Feature Flags ──────────────────────────────────────────────────────

export interface FeatureFlags {
  marketplace_enabled: boolean;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  return request<FeatureFlags>("GET", "/system/config/features");
}

export async function setFeatureFlag(key: string, value: boolean): Promise<FeatureFlags> {
  return request<FeatureFlags>("POST", "/super-admin/features", { [key]: value });
}

export interface GovernanceEvent {
  id: number;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

export async function getGovernanceLog(): Promise<GovernanceEvent[]> {
  const res = await request<{ events: GovernanceEvent[] }>("GET", "/super-admin/governance/log");
  return res.events;
}

// ── Regional Pricing ──────────────────────────────────────────────────────────

export interface RegionalPriceRow {
  id:                   number;
  region_code:          string;
  currency_code:        string;
  price_per_seat_cents: number;
  is_active:            boolean;
  updated_at:           string;
}

export interface RegionalPricingData {
  pricing:       RegionalPriceRow[];
  orgRegionCode: string | null;
}

export async function getRegionalPricing(): Promise<RegionalPricingData> {
  return request<RegionalPricingData>("GET", "/regional-pricing");
}

export async function createRegionalPricing(data: {
  region_code:          string;
  currency_code:        string;
  price_per_seat_cents: number;
  is_active:            boolean;
}): Promise<RegionalPriceRow> {
  return request<RegionalPriceRow>("POST", "/regional-pricing", data);
}

export async function updateRegionalPricing(
  id: number,
  data: Partial<{ currency_code: string; price_per_seat_cents: number; is_active: boolean }>,
): Promise<RegionalPriceRow> {
  return request<RegionalPriceRow>("PUT", `/regional-pricing/${id}`, data);
}

export async function deleteRegionalPricing(id: number): Promise<void> {
  await request<void>("DELETE", `/regional-pricing/${id}`);
}

export async function setOrgRegion(region_code: string | null): Promise<void> {
  await request<void>("PUT", "/regional-pricing/org-region", { region_code });
}

// ── Rescue Cascade ─────────────────────────────────────────────────────────────

export interface CascadeContact {
  id:               number;
  cascade_id:       number;
  operator_id:      string;
  operator_name:    string | null;
  rank:             number;
  skill_score:      number | null;
  reliability_score: number | null;
  composite_score:  number | null;
  status:           "pending" | "accepted" | "declined" | "expired";
  contacted_at:     string;
  responded_at:     string | null;
}

export interface RescueCascade {
  id:                      number;
  org_id:                  number;
  absence_id:              number | null;
  discipline_id:           number | null;
  course_name:             string | null;
  class_datetime:          string | null;
  absent_operator_id:      string;
  absent_operator_name:    string | null;
  status:                  "pending" | "resolved" | "cancelled";
  auto_triggered:          boolean;
  resolved_at:             string | null;
  resolved_by_operator_id: string | null;
  created_at:              string;
  // aggregated
  pending_count?:   number;
  accepted_count?:  number;
  declined_count?:  number;
  total_contacts?:  number;
  contacts?:        CascadeContact[];
}

export async function triggerRescueCascade(params: {
  discipline_id:         number;
  absent_operator_id:    string;
  course_name?:          string;
  class_datetime?:       string;
  absent_operator_name?: string;
  absence_id?:           number;
}): Promise<{ cascade_id: number }> {
  return request<{ cascade_id: number }>("POST", "/rescue/trigger", params);
}

export async function getRescueCascades(): Promise<RescueCascade[]> {
  return request<RescueCascade[]>("GET", "/rescue/cascades");
}

export async function getRescueCascadeDetail(id: number): Promise<RescueCascade> {
  return request<RescueCascade>("GET", `/rescue/cascade/${id}`);
}

export async function cancelRescueCascade(id: number): Promise<void> {
  await request<void>("DELETE", `/rescue/cascade/${id}`);
}

export async function getRescuePending(): Promise<CascadeContact[]> {
  return request<CascadeContact[]>("GET", "/rescue/pending");
}

export async function acknowledgeRescue(cascade_contact_id: number, accept: boolean): Promise<{ success: boolean; cascadeStatus: string }> {
  return request<{ success: boolean; cascadeStatus: string }>("POST", "/rescue/acknowledge", {
    cascade_contact_id,
    accept,
  });
}

// ── Emergency Notifications ────────────────────────────────────────────────────

export interface EmergencyPushResult {
  suppressed:      boolean;
  suppressReason?: string;
  logId?:          number;
  tokensCount:     number;
  errors:          string[];
}

export interface EmergencyPushLog {
  id:                        number;
  category:                  string;
  title:                     string;
  body:                      string;
  status:                    string;
  suppressed:                boolean;
  suppress_reason:           string | null;
  tokens_count:              number | null;
  twilio_fallback_triggered: boolean;
  twilio_fallback_at:        string | null;
  ack_deadline:              string | null;
  acknowledged_at:           string | null;
  created_at:                string;
}

export async function registerPushToken(params: {
  token:    string;
  platform: string;
}): Promise<{ registered: boolean }> {
  return request<{ registered: boolean }>("POST", "/notifications/register-token", params);
}

export async function triggerEmergencyPush(params: {
  category:        string;
  title?:          string;
  body?:           string;
  childId?:        string;
  scanTime?:       string;
  classStartTime?: string;
}): Promise<EmergencyPushResult> {
  return request<EmergencyPushResult>("POST", "/notifications/emergency", params);
}

export async function acknowledgeEmergencyPush(logId: number): Promise<{ acknowledged: boolean }> {
  return request<{ acknowledged: boolean }>("POST", `/notifications/acknowledge/${logId}`);
}

export async function getEmergencyPushLog(): Promise<EmergencyPushLog[]> {
  return request<EmergencyPushLog[]>("GET", "/notifications/push-log");
}

