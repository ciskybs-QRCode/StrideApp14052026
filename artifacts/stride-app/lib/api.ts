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
  const data = await res.json() as T | { error: string };
  if (!res.ok) throw new Error((data as { error: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ token: string; user: ApiUser }>("POST", "/auth/login", { email, password }),

  // Children
  getChildren: () => request<ApiChild[]>("GET", "/children"),
  addChild: (data: Partial<ApiChild>) => request<ApiChild>("POST", "/children", data),
  updateChild: (id: string, data: Partial<ApiChild>) => request<ApiChild>("PATCH", `/children/${id}`, data),
  deleteChild: (id: string) => request<void>("DELETE", `/children/${id}`),

  // Courses & Enrollments
  getCourses: () => request<ApiCourse[]>("GET", "/courses"),
  getEnrollments: (childId?: string) =>
    request<ApiEnrollment[]>("GET", childId ? `/enrollments?childId=${childId}` : "/enrollments"),
  enroll: (childId: string, courseId: string) =>
    request<ApiEnrollment>("POST", "/enrollments", { childId, courseId }),

  // Delegates
  getDelegates: (childId?: string) =>
    request<ApiDelegate[]>("GET", childId ? `/delegates?childId=${childId}` : "/delegates"),
  addDelegate: (data: Partial<ApiDelegate>) => request<ApiDelegate>("POST", "/delegates", data),
  removeDelegate: (id: string) => request<void>("DELETE", `/delegates/${id}`),

  // Documents
  getDocuments: () => request<ApiDocument[]>("GET", "/documents"),
  signDocument: (id: string) => request<{ ok: boolean }>("POST", `/documents/${id}/sign`),
  addDocument: (data: Partial<ApiDocument>) => request<ApiDocument>("POST", "/documents", data),

  // Payments
  getPayments: () => request<ApiPayment[]>("GET", "/payments"),
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
  updateOrg: (data: Partial<ApiOrg>) => request<ApiOrg>("PATCH", "/org", data),

  // Profile (parent self-update)
  updateProfile: (data: { name?: string; phone?: string }) =>
    request<ApiUser>("PATCH", "/profile", data),

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
  parent_id: number;
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
