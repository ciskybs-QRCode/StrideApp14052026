import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useOfflineSync } from "./OfflineSyncContext";
import { api } from "../lib/api";

import type {
  ApiChild, ApiDelegate, ApiCourse, ApiEnrollment,
  ApiDocument, ApiPayment, ApiStudent, ApiLesson,
} from "../lib/api";

const LEGAL_DOCS_KEY = "stride_legal_docs_v2";

export interface Child {
  id: string;
  name: string;
  age: number;
  stars: number;
  allergies: string;
  medicalWaiver: "ambulance" | "call_parent";
  mediaConsent: "full" | "internal" | "none";
  courses: string[];
  photoUrl?: string;
  qrPayload?: string;
  dateOfBirth?: string;
  skillLevel?: string;
}

export interface Delegate {
  id: string;
  childId: string;
  name: string;
  surname: string;
  phone: string;
  pin: string;
  approved: boolean;
  relationship?: string;
  email?: string;
}

export interface Course {
  id: string;
  name: string;
  instructor: string;
  schedule: string;
  location: string;
  capacity: number;
  enrolled: number;
  ageMin: number;
  ageMax: number;
  level: string;
  price: number;
  description: string;
  hasPrivate: boolean;
  dropInEnabled: boolean;
  dropInPrice: number;
  fixedBlockEnabled: boolean;
  fixedBlockPrice: number;
  fixedBlockLessons: number;
}

export interface Booking {
  id: string;
  childId: string;
  courseId: string;
  date: string;
  type: "group" | "private";
  status: "confirmed" | "pending" | "cancelled";
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  description: string;
  status: "paid" | "pending" | "overdue";
}

export interface Document {
  id: string;
  title: string;
  type: string;
  signed: boolean;
  signedDate?: string;
  required: boolean;
  sentBy?: string;
  sentAt?: string;
  fileUrl?: string;
  createdAt?: string;
}

export interface LegalAdminDoc {
  id: string;
  title: string;
  type: string;
  highPriority: boolean;
  mandatorySignature: boolean;
  createdAt: string;
  linkUrl?: string;
  description?: string;
  fileUri?: string;
  fileName?: string;
  fileSize?: string | number;
  /** Full legal text shown in the signing gate */
  content?: string;
  /** Document version — signatures are locked to this version */
  version?: string;
  /** If true, signer must pick Option A/B/C before signing */
  has_options?: boolean;
  /** Custom labels for the three options */
  option_labels?: { a: string; b: string; c: string };
}

export interface Student {
  id: string;
  name: string;
  age: number;
  parentName: string;
  parentPhone: string;
  courses: string[];
  allergies: string;
  medicalWaiver: "ambulance" | "call_parent";
  stars: number;
  present?: boolean;
  checkedIn?: boolean;
}

export interface Lesson {
  id: string;
  courseId: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  room: string;
  enrolled: number;
  present: number;
  operatorId: string;
}

interface AppDataContextType {
  children: Child[];
  delegates: Delegate[];
  courses: Course[];
  bookings: Booking[];
  payments: Payment[];
  documents: Document[];
  legalAdminDocs: LegalAdminDoc[];
  signedAdminDocIds: string[];
  students: Student[];
  lessons: Lesson[];
  isLoadingData: boolean;
  refreshData: () => Promise<void>;
  addChild: (child: Omit<Child, "id">) => Promise<void>;
  updateChild: (id: string, updates: Partial<Child>) => Promise<void>;
  removeChild: (id: string) => Promise<void>;
  addDelegate: (delegate: Omit<Delegate, "id" | "pin">) => Promise<void>;
  removeDelegate: (id: string) => Promise<void>;
  addPayment: (payment: Omit<Payment, "id">) => Promise<void>;
  signDocument: (id: string) => Promise<void>;
  updateStudentPresence: (studentId: string, present: boolean) => Promise<void>;
  addDocument: (doc: Omit<Document, "id">) => Promise<void>;
  addStars: (studentId: string, count: number) => Promise<void>;
  addLegalDoc: (doc: Omit<LegalAdminDoc, "id">) => Promise<void>;
  updateLegalDoc: (id: string, updates: Partial<LegalAdminDoc>) => Promise<void>;
  deleteLegalDoc: (id: string) => Promise<void>;
  signAdminDoc: (id: string, auditPayload?: {
    signature_svg: string;
    document_content?: string;
    document_version?: string;
    selected_option?: string;
    device_os?: string;
  }) => Promise<void>;
  mediaConsent: "full" | "internal" | "none";
  setMediaConsent: (consent: "full" | "internal" | "none") => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

function inferSkillLevel(stars: number): string {
  if (stars >= 50) return "Advanced";
  if (stars >= 20) return "Intermediate";
  return "Beginner";
}

function calcAgeFromDob(dob: string): number {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function mapChild(c: ApiChild, enrollments: ApiEnrollment[]): Child {
  const childEnrollments = enrollments.filter(e => e.child_id === c.id && e.status === "active");
  const stars = c.gold_stars ?? 0;
  const dob = c.date_of_birth;
  const age = dob ? calcAgeFromDob(dob) : (c.age ?? 0);
  return {
    id: String(c.id),
    name: c.full_name || c.name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    age,
    stars,
    allergies: c.allergies_list || c.allergies || "None",
    medicalWaiver: c.ambulance_consent ? "ambulance" : "call_parent",
    mediaConsent: (c.media_consent as "full" | "internal" | "none") ?? "none",
    courses: childEnrollments.map(e => String(e.course_id)),
    photoUrl: c.photo_url,
    qrPayload: c.qr_payload,
    dateOfBirth: dob,
    skillLevel: (c as unknown as Record<string, unknown>)["skill_level"] as string | undefined ?? inferSkillLevel(stars),
  };
}

function mapCourse(c: ApiCourse): Course {
  const basePrice = c.price ?? 20;
  return {
    id: String(c.id),
    name: c.name,
    instructor: c.instructor?.name ?? "TBA",
    schedule: c.days_of_week ?? "",
    location: "",
    capacity: c.capacity ?? 0,
    enrolled: 0,
    ageMin: c.age_min ?? 0,
    ageMax: c.age_max ?? 99,
    level: c.level ?? "All levels",
    price: basePrice,
    description: c.description ?? "",
    hasPrivate: true,
    dropInEnabled: true,
    dropInPrice: basePrice,
    fixedBlockEnabled: basePrice > 0,
    fixedBlockPrice: Math.round(basePrice * 8 * 0.85),
    fixedBlockLessons: 8,
  };
}

function mapDocument(d: ApiDocument): Document {
  return {
    id: String(d.id),
    title: d.title,
    type: d.type,
    signed: d.signed ?? false,
    required: d.mandatory ?? false,
    fileUrl: d.file_url,
    createdAt: d.created_at,
  } as Document & { createdAt?: string };
}

function mapStudent(s: ApiStudent): Student {
  const coursesArr = (s.enrollments ?? [])
    .filter(e => e.status === "active")
    .map(e => e.course?.name ?? "");
  return {
    id: String(s.id),
    name: s.name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
    age: s.age ?? 0,
    parentName: s.parent?.name ?? "Unknown",
    parentPhone: s.parent?.phone ?? "",
    courses: coursesArr,
    allergies: s.allergies ?? "None",
    medicalWaiver: s.ambulance_consent ? "ambulance" : "call_parent",
    stars: s.gold_stars ?? 0,
    present: false,
    checkedIn: false,
  };
}

function mapLesson(l: ApiLesson): Lesson {
  const startDt = l.start_time ? new Date(l.start_time) : null;
  const endDt = l.end_time ? new Date(l.end_time) : null;
  return {
    id: String(l.id),
    courseId: String(l.course_id),
    courseName: l.course?.name ?? "Unknown",
    date: startDt ? startDt.toISOString().split("T")[0] : "",
    startTime: startDt ? startDt.toTimeString().slice(0, 5) : "",
    endTime: endDt ? endDt.toTimeString().slice(0, 5) : "",
    location: l.course?.venue?.name ?? "",
    room: "",
    enrolled: 0,
    present: 0,
    operatorId: "",
  };
}

const FALLBACK_LEGAL_DOCS: LegalAdminDoc[] = [
  {
    id: "ld1", title: "Terms & Conditions", type: "terms", version: "1",
    highPriority: false, mandatorySignature: true, createdAt: "01/01/2026",
    description: "General terms and conditions for use of the Stride platform.",
    content: `TERMS AND CONDITIONS OF USE\n\nEffective Date: 1 January 2026\n\n1. ACCEPTANCE OF TERMS\nBy accessing or using the Stride platform ("Service"), you agree to be bound by these Terms and Conditions. If you do not agree, you may not use the Service.\n\n2. USE OF THE SERVICE\nThe Service is provided exclusively for the management of dance school activities. You agree to use the Service only for lawful purposes and in accordance with these Terms.\n\n3. ACCOUNT RESPONSIBILITY\nYou are responsible for maintaining the confidentiality of your account credentials. You accept full responsibility for all activities that occur under your account.\n\n4. CHILDREN'S PRIVACY\nWe take the privacy of minors seriously. All data relating to children enrolled in our programmes is processed in strict accordance with applicable data protection legislation.\n\n5. INTELLECTUAL PROPERTY\nAll content, branding, and software within the Stride platform are the intellectual property of the service provider. Unauthorised reproduction is strictly prohibited.\n\n6. LIMITATION OF LIABILITY\nThe platform is provided on an "as is" basis. We do not accept liability for any indirect, incidental, or consequential damages arising from use of the Service.\n\n7. CHANGES TO TERMS\nWe reserve the right to update these Terms at any time. Continued use of the Service following notification of changes constitutes your acceptance of the revised Terms.\n\n8. GOVERNING LAW\nThese Terms are governed by and construed in accordance with applicable law. Any disputes shall be subject to the exclusive jurisdiction of the relevant courts.`,
  },
  {
    id: "ld2", title: "Privacy Policy", type: "privacy", version: "1",
    highPriority: false, mandatorySignature: true, createdAt: "01/01/2026",
    description: "How we collect, store, and use your personal information.",
    content: `PRIVACY POLICY\n\nEffective Date: 1 January 2026\n\n1. INTRODUCTION\nThis Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use the Stride platform.\n\n2. DATA WE COLLECT\nWe collect: (a) Account information — name, email address, phone number; (b) Children's information — name, date of birth, medical notes, attendance records; (c) Payment information — processed securely via third-party payment providers; (d) Usage data — app interactions, log files, device identifiers.\n\n3. HOW WE USE YOUR DATA\nYour data is used to: manage enrolment and attendance; process payments; communicate service updates; comply with legal obligations; improve our services.\n\n4. DATA SHARING\nWe do not sell your personal data. We may share data with: authorised service providers under strict confidentiality agreements; regulatory authorities where required by law.\n\n5. DATA RETENTION\nWe retain personal data for as long as necessary to fulfil the purposes described in this Policy or as required by law.\n\n6. YOUR RIGHTS\nYou have the right to: access your personal data; request correction or deletion; object to processing; lodge a complaint with a supervisory authority.\n\n7. SECURITY\nWe implement industry-standard security measures including encryption, access controls, and regular audits to protect your data.\n\n8. CONTACT US\nFor any privacy-related queries, please contact your dance school administrator directly.`,
  },
  {
    id: "ld3", title: "Cookie Policy", type: "cookies", version: "1",
    highPriority: false, mandatorySignature: false, createdAt: "01/01/2026",
    description: "How we use cookies and tracking technologies.",
    content: "This application uses essential cookies to maintain your session and preferences. No third-party advertising cookies are used.",
  },
  {
    id: "ld4", title: "Media Release Consent", type: "waiver", version: "1",
    highPriority: true, mandatorySignature: true, createdAt: "01/01/2026",
    has_options: true,
    option_labels: { a: "Full consent — photos & videos for all purposes", b: "Internal use only — school newsletters and internal records", c: "No consent — do not photograph or film my child" },
    description: "Consent for photography and video recording of your child.",
    content: `MEDIA RELEASE CONSENT\n\nThis consent form relates to the photography and video recording of students enrolled at this dance school.\n\nDuring classes, performances, showcases, and other school events, we may capture photographs and video footage. This media may be used for promotional, educational, and documentary purposes.\n\nYou are required to select one of the following consent options:\n\nOPTION A — Full Consent\nYou consent to photographs and videos of your child being used for all school purposes, including but not limited to: the school website, social media channels, printed promotional materials, and internal records.\n\nOPTION B — Internal Use Only\nYou consent to photographs and videos being used exclusively for internal purposes such as school newsletters, private parent communications, and internal training documentation. Media will not be published publicly.\n\nOPTION C — No Consent\nYou do not consent to your child being photographed or filmed. The school will make reasonable efforts to ensure your child is excluded from all media capture. Please note this may affect participation in certain group activities.\n\nThis consent applies for the duration of your child's enrolment and may be updated in writing at any time by contacting the school administrator.`,
  },
];

export function AppDataProvider({ children: childrenProp }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { isOnline, enqueue, getPendingQueue, dequeue } = useOfflineSync();

  const [childrenData, setChildrenData] = useState<Child[]>([]);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [legalAdminDocs, setLegalAdminDocs] = useState<LegalAdminDoc[]>(FALLBACK_LEGAL_DOCS);
  const [signedAdminDocIds, setSignedAdminDocIds] = useState<string[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [mediaConsent, setMediaConsentState] = useState<"full" | "internal" | "none">("none");
  const loadedForUser = useRef<string | null>(null);

  // Hydrate legal docs from AsyncStorage on first mount (persists across restarts)
  useEffect(() => {
    AsyncStorage.getItem(LEGAL_DOCS_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as LegalAdminDoc[];
          if (Array.isArray(saved) && saved.length > 0) {
            setLegalAdminDocs(saved);
          }
        } catch { /* keep FALLBACK_LEGAL_DOCS */ }
      }
    }).catch(() => {});
  }, []);

  // Load signed document IDs from backend (persists across devices)
  useEffect(() => {
    if (!user) return;
    api.legalSignedIds().then(result => {
      if (result && Array.isArray(result.ids) && result.ids.length > 0) {
        setSignedAdminDocIds(prev => [...new Set([...prev, ...result.ids])]);
      }
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const cacheKey = `${user.id}:${user.role}`;
    if (loadedForUser.current === cacheKey) return;
    loadedForUser.current = cacheKey;
    loadAll(user.role).catch(() => {
      setIsLoadingData(false);
    });
  }, [user]);

  const refreshData = async () => {
    if (!user) return;
    loadedForUser.current = null;
    await loadAll(user.role);
    if (user) loadedForUser.current = `${user.id}:${user.role}`;
  };

  // When coming back online, process any queued actions
  const prevOnline = useRef(true);
  useEffect(() => {
    if (!prevOnline.current && isOnline && user) {
      processOfflineQueue();
    }
    prevOnline.current = isOnline;
  }, [isOnline, user]);

  const processOfflineQueue = async () => {
    const queue = await getPendingQueue();
    for (const entry of queue) {
      try {
        const { action } = entry;
        switch (action.type) {
          case "addChild":
            await api.addChild(action.params as Parameters<typeof api.addChild>[0]);
            break;
          case "removeChild":
            await api.deleteChild(action.params.id);
            break;
          case "updateChild":
            await api.updateChild(action.params.id, action.params.updates as Parameters<typeof api.updateChild>[1]);
            break;
          case "addDelegate":
            await api.addDelegate(action.params as Parameters<typeof api.addDelegate>[0]);
            break;
          case "removeDelegate":
            await api.removeDelegate(action.params.id);
            break;
          case "addPayment":
            await api.addPayment(action.params as Parameters<typeof api.addPayment>[0]);
            break;
          case "signDocument":
            await api.signDocument(action.params.id);
            break;
          case "addDocument":
            await api.addDocument(action.params as Parameters<typeof api.addDocument>[0]);
            break;
          case "addStars":
            await api.addStars(action.params.studentId, action.params.count);
            break;
          case "updateStudentPresence":
            // presence is local-only, no API call needed
            break;
        }
        await dequeue(entry.id);
      } catch {
        // Still failing — leave in queue, will retry next time online
      }
    }
  };

  const loadAll = async (role: string) => {
    setIsLoadingData(true);
    // Clear stale data from a previous role so screens never render with wrong-role content
    if (role === "parent") {
      setStudents([]);
      setLessons([]);
    } else {
      setChildrenData([]);
      setDelegates([]);
      setPayments([]);
    }
    try {
      const [coursesData] = await Promise.all([api.getCourses().catch(() => [])]);
      const mappedCourses = Array.isArray(coursesData) ? (coursesData as ApiCourse[]).map(mapCourse) : [];
      setCourses(mappedCourses);

      if (role === "parent" || role === "super_admin") {
        const [childrenRes, enrollmentsRes, delegatesRes, docsRes, paymentsRes] = await Promise.allSettled([
          api.getChildren(),
          api.getEnrollments(),
          api.getDelegates(),
          api.getDocuments(),
          api.getPayments(),
        ]);
        const rawChildren = childrenRes.status === "fulfilled" ? (childrenRes.value as ApiChild[]) : [];
        const rawEnrollments = enrollmentsRes.status === "fulfilled" ? (enrollmentsRes.value as ApiEnrollment[]) : [];
        setChildrenData(rawChildren.map(c => mapChild(c, rawEnrollments)));
        setBookings(rawEnrollments.map(e => ({
          id: String(e.id),
          childId: String(e.child_id),
          courseId: String(e.course_id),
          date: e.enrolled_at?.split("T")[0] ?? new Date().toISOString().split("T")[0],
          type: "group" as const,
          status: e.status === "active" ? "confirmed" as const : "cancelled" as const,
        })));
        if (delegatesRes.status === "fulfilled") {
          setDelegates((delegatesRes.value as ApiDelegate[]).map(d => ({
            id: String(d.id),
            childId: String(d.child_id),
            name: d.name,
            surname: d.surname,
            phone: d.phone,
            pin: d.pin ?? "",
            approved: true,
            relationship: d.relationship,
            email: d.email,
          })));
        }
        if (docsRes.status === "fulfilled") {
          setDocuments((docsRes.value as ApiDocument[]).map(mapDocument));
        }
        if (paymentsRes.status === "fulfilled") {
          setPayments((paymentsRes.value as ApiPayment[]).map(p => ({
            id: String(p.id),
            amount: p.amount ?? 0,
            date: p.created_at?.split("T")[0] ?? "",
            description: p.description ?? "",
            status: (p.status as Payment["status"]) ?? "pending",
          })));
        }
      }

      if (role === "operator" || role === "admin" || role === "super_admin") {
        const [studentsRes, lessonsRes, docsRes] = await Promise.allSettled([
          api.getStudents(),
          api.getLessons(),
          api.getDocuments(),
        ]);
        if (studentsRes.status === "fulfilled") setStudents((studentsRes.value as ApiStudent[]).map(mapStudent));
        if (lessonsRes.status === "fulfilled") setLessons((lessonsRes.value as ApiLesson[]).map(mapLesson));
        if (docsRes.status === "fulfilled") setDocuments((docsRes.value as ApiDocument[]).map(mapDocument));
      }
    } catch {
      // Silently recover — stale/empty state is safer than crashing the screen
    } finally {
      setIsLoadingData(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async function withOfflineFallback<T>(
    apiCall: () => Promise<T>,
    offlineAction: Parameters<typeof enqueue>[0],
  ): Promise<T | null> {
    if (!isOnline) {
      await enqueue(offlineAction);
      return null;
    }
    try {
      return await apiCall();
    } catch {
      await enqueue(offlineAction);
      return null;
    }
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  const addChild = async (child: Omit<Child, "id">) => {
    const nameParts = child.name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName  = nameParts.slice(1).join(" ");

    // Use the user's real orgId — never fall back to a hardcoded org.
    // `|| 1` handles the edge case where orgId is 0 (super_admin before pioneer).
    const resolvedOrgId = (user?.orgId && user.orgId > 0) ? user.orgId : undefined;

    const payload = {
      full_name: child.name,
      first_name: firstName,
      ...(lastName ? { last_name: lastName } : {}),
      ...(resolvedOrgId !== undefined ? { organization_id: resolvedOrgId } : {}),
      ...(child.dateOfBirth ? { date_of_birth: child.dateOfBirth } : {}),
      gold_stars: child.stars ?? 0,
      ...(child.allergies && child.allergies !== "None" ? { allergies_list: child.allergies } : {}),
      ambulance_consent: child.medicalWaiver === "ambulance",
      media_consent: child.mediaConsent,
      ...(child.photoUrl ? { photo_url: child.photoUrl } : {}),
    };

    const tempId = `temp_${Date.now()}`;
    setChildrenData(prev => [...prev, { ...child, id: tempId }]);

    // Do NOT use withOfflineFallback for creation — silent queuing hides DB
    // errors and leaves ghost temp entries in the list forever.  Instead, let
    // errors propagate so the calling screen can show a proper Alert.
    try {
      const res = await api.addChild(payload);
      const newChild = mapChild(res, []);
      setChildrenData(prev => prev.map(c => c.id === tempId ? newChild : c));
    } catch (err) {
      // Remove the optimistic placeholder so no ghost entry remains
      setChildrenData(prev => prev.filter(c => c.id !== tempId));
      throw err; // propagate to the UI
    }
  };

  const removeChild = async (id: string) => {
    setChildrenData(prev => prev.filter(c => c.id !== id));
    await withOfflineFallback(
      () => api.deleteChild(id),
      { type: "removeChild", params: { id } },
    );
  };

  const updateChild = async (id: string, updates: Partial<Child>) => {
    setChildrenData(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    const payload: Partial<ApiChild> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.age !== undefined) payload.age = updates.age;
    if (updates.dateOfBirth !== undefined) payload.date_of_birth = updates.dateOfBirth;
    if (updates.stars !== undefined) payload.gold_stars = updates.stars;
    if (updates.allergies !== undefined) payload.allergies = updates.allergies;
    if (updates.medicalWaiver !== undefined) payload.ambulance_consent = updates.medicalWaiver === "ambulance";
    if (updates.mediaConsent !== undefined) payload.media_consent = updates.mediaConsent;
    await withOfflineFallback(
      () => api.updateChild(id, payload),
      { type: "updateChild", params: { id, updates: payload as Record<string, unknown> } },
    );
  };

  const addDelegate = async (delegate: Omit<Delegate, "id" | "pin">) => {
    const payload = {
      child_id: parseInt(delegate.childId),
      name: delegate.name,
      surname: delegate.surname,
      phone: delegate.phone,
      relationship: delegate.relationship,
      email: delegate.email,
    };
    const tempId = `temp_${Date.now()}`;
    setDelegates(prev => [...prev, { ...delegate, id: tempId, pin: "", approved: true }]);
    const res = await withOfflineFallback(
      () => api.addDelegate(payload),
      { type: "addDelegate", params: payload as Record<string, unknown> },
    );
    if (res) {
      const d = res as ApiDelegate;
      setDelegates(prev => prev.map(del => del.id === tempId ? {
        id: String(d.id), childId: String(d.child_id), name: d.name,
        surname: d.surname, phone: d.phone, pin: d.pin ?? "", approved: true,
      } : del));
    }
  };

  const removeDelegate = async (id: string) => {
    setDelegates(prev => prev.filter(d => d.id !== id));
    await withOfflineFallback(
      () => api.removeDelegate(id),
      { type: "removeDelegate", params: { id } },
    );
  };

  const addPayment = async (payment: Omit<Payment, "id">) => {
    const payload = { amount: payment.amount, description: payment.description, status: payment.status };
    const tempId = `temp_${Date.now()}`;
    setPayments(prev => [...prev, { ...payment, id: tempId }]);
    const res = await withOfflineFallback(
      () => api.addPayment(payload),
      { type: "addPayment", params: payload as Record<string, unknown> },
    );
    if (res) {
      const p = res as ApiPayment;
      setPayments(prev => prev.map(pm => pm.id === tempId ? {
        id: String(p.id), amount: p.amount ?? payment.amount,
        date: p.created_at?.split("T")[0] ?? payment.date,
        description: p.description ?? payment.description,
        status: (p.status as Payment["status"]) ?? payment.status,
      } : pm));
    }
  };

  const signDocument = async (id: string) => {
    setDocuments(prev => prev.map(d =>
      d.id === id ? { ...d, signed: true, signedDate: new Date().toISOString().split("T")[0] } : d
    ));
    await withOfflineFallback(
      () => api.signDocument(id),
      { type: "signDocument", params: { id } },
    );
  };

  const updateStudentPresence = async (studentId: string, present: boolean) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, present } : s));
    // Presence is tracked locally; queue for when online if needed
    if (!isOnline) {
      await enqueue({ type: "updateStudentPresence", params: { studentId, present } });
    }
  };

  const addDocument = async (doc: Omit<Document, "id">) => {
    const payload = { title: doc.title, type: doc.type, mandatory: doc.required, file_url: doc.fileUrl };
    const tempId = `temp_${Date.now()}`;
    setDocuments(prev => [...prev, { ...doc, id: tempId }]);
    const res = await withOfflineFallback(
      () => api.addDocument(payload),
      { type: "addDocument", params: payload as Record<string, unknown> },
    );
    if (res) {
      setDocuments(prev => prev.map(d => d.id === tempId ? mapDocument(res as ApiDocument) : d));
    }
  };

  const addStars = async (studentId: string, count: number) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, stars: s.stars + count } : s));
    await withOfflineFallback(
      () => api.addStars(studentId, count),
      { type: "addStars", params: { studentId, count } },
    );
  };

  const addLegalDoc = async (doc: Omit<LegalAdminDoc, "id">) => {
    const newDoc: LegalAdminDoc = { ...doc, id: Date.now().toString() };
    setLegalAdminDocs(prev => {
      const next = [...prev, newDoc];
      AsyncStorage.setItem(LEGAL_DOCS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const updateLegalDoc = async (id: string, updates: Partial<LegalAdminDoc>) => {
    setLegalAdminDocs(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updates } : d);
      AsyncStorage.setItem(LEGAL_DOCS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const deleteLegalDoc = async (id: string) => {
    setLegalAdminDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      AsyncStorage.setItem(LEGAL_DOCS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const signAdminDoc = async (id: string, auditPayload?: {
    signature_svg: string;
    document_content?: string;
    document_version?: string;
    selected_option?: string;
    device_os?: string;
  }) => {
    setSignedAdminDocIds(prev => [...new Set([...prev, id])]);
    if (auditPayload) {
      try {
        await api.legalSign({
          document_id: id,
          document_version: auditPayload.document_version,
          document_content: auditPayload.document_content,
          selected_option: auditPayload.selected_option,
          signature_svg: auditPayload.signature_svg,
          device_os: auditPayload.device_os,
        });
      } catch {
        // Audit log write is best-effort; local signature still recorded
      }
    }
  };

  const setMediaConsent = async (consent: "full" | "internal" | "none") => {
    setMediaConsentState(consent);
  };

  return (
    <AppDataContext.Provider value={{
      children: childrenData,
      delegates,
      courses,
      bookings,
      payments,
      documents,
      legalAdminDocs,
      signedAdminDocIds,
      students,
      lessons,
      isLoadingData,
      refreshData,
      addChild,
      updateChild,
      removeChild,
      addDelegate,
      removeDelegate,
      addPayment,
      signDocument,
      updateStudentPresence,
      addDocument,
      addStars,
      addLegalDoc,
      updateLegalDoc,
      deleteLegalDoc,
      signAdminDoc,
      mediaConsent,
      setMediaConsent,
    }}>
      {childrenProp}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
