import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useOfflineSync } from "./OfflineSyncContext";
import { api } from "../lib/api";
import type {
  ApiChild, ApiDelegate, ApiCourse, ApiEnrollment,
  ApiDocument, ApiPayment, ApiStudent, ApiLesson,
} from "../lib/api";

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
  signAdminDoc: (id: string) => Promise<void>;
  mediaConsent: "full" | "internal" | "none";
  setMediaConsent: (consent: "full" | "internal" | "none") => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

function inferSkillLevel(stars: number): string {
  if (stars >= 50) return "Advanced";
  if (stars >= 20) return "Intermediate";
  return "Beginner";
}

function mapChild(c: ApiChild, enrollments: ApiEnrollment[]): Child {
  const childEnrollments = enrollments.filter(e => e.child_id === c.id && e.status === "active");
  const stars = c.gold_stars ?? 0;
  return {
    id: String(c.id),
    name: c.name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    age: c.age ?? 0,
    stars,
    allergies: c.allergies_list || c.allergies || "None",
    medicalWaiver: c.ambulance_consent ? "ambulance" : "call_parent",
    mediaConsent: (c.media_consent as "full" | "internal" | "none") ?? "none",
    courses: childEnrollments.map(e => String(e.course_id)),
    photoUrl: c.photo_url,
    qrPayload: c.qr_payload,
    dateOfBirth: c.date_of_birth,
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
  { id: "ld1", title: "Terms & Conditions", type: "terms", highPriority: false, mandatorySignature: true, createdAt: "01/01/2026", description: "General terms and conditions for use of the Stride platform and dance school services." },
  { id: "ld2", title: "Privacy Policy", type: "privacy", highPriority: false, mandatorySignature: true, createdAt: "01/01/2026", description: "How we collect, store, and use your personal information in accordance with applicable law." },
  { id: "ld3", title: "Cookie Policy", type: "cookies", highPriority: false, mandatorySignature: false, createdAt: "01/01/2026", description: "How we use cookies and similar tracking technologies on our platforms." },
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

  useEffect(() => {
    if (!user) return;
    const cacheKey = `${user.id}:${user.role}`;
    if (loadedForUser.current === cacheKey) return;
    loadedForUser.current = cacheKey;
    loadAll(user.role);
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
    try {
      const [coursesData] = await Promise.all([api.getCourses().catch(() => [])]);
      const mappedCourses = (coursesData as ApiCourse[]).map(mapCourse);
      setCourses(mappedCourses);

      if (role === "parent") {
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

      if (role === "operator" || role === "admin") {
        const [studentsRes, lessonsRes, docsRes] = await Promise.allSettled([
          api.getStudents(),
          api.getLessons(),
          api.getDocuments(),
        ]);
        if (studentsRes.status === "fulfilled") setStudents((studentsRes.value as ApiStudent[]).map(mapStudent));
        if (lessonsRes.status === "fulfilled") setLessons((lessonsRes.value as ApiLesson[]).map(mapLesson));
        if (docsRes.status === "fulfilled") setDocuments((docsRes.value as ApiDocument[]).map(mapDocument));
      }
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
    const payload = {
      name: child.name,
      age: child.age,
      gold_stars: child.stars ?? 0,
      allergies: child.allergies,
      ambulance_consent: child.medicalWaiver === "ambulance",
      media_consent: child.mediaConsent,
      ...(child.photoUrl ? { photo_url: child.photoUrl } : {}),
    };
    const tempId = `temp_${Date.now()}`;
    setChildrenData(prev => [...prev, { ...child, id: tempId }]);
    const res = await withOfflineFallback(
      () => api.addChild(payload),
      { type: "addChild", params: payload as Record<string, unknown> },
    );
    if (res) {
      const newChild = mapChild(res as ApiChild, []);
      setChildrenData(prev => prev.map(c => c.id === tempId ? newChild : c));
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
    if (updates.stars !== undefined) payload.gold_stars = updates.stars;
    if (updates.allergies !== undefined) payload.allergies = updates.allergies;
    if (updates.medicalWaiver !== undefined) payload.ambulance_consent = updates.medicalWaiver === "ambulance";
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
    setLegalAdminDocs(prev => [...prev, newDoc]);
  };

  const updateLegalDoc = async (id: string, updates: Partial<LegalAdminDoc>) => {
    setLegalAdminDocs(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const deleteLegalDoc = async (id: string) => {
    setLegalAdminDocs(prev => prev.filter(d => d.id !== id));
  };

  const signAdminDoc = async (id: string) => {
    setSignedAdminDocIds(prev => [...prev, id]);
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
