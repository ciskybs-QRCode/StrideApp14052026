import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface Child {
  id: string;
  name: string;
  age: number;
  stars: number;
  allergies: string;
  medicalWaiver: "ambulance" | "call_parent";
  photo?: string;
  courses: string[];
}

export interface Delegate {
  id: string;
  childId: string;
  name: string;
  surname: string;
  phone: string;
  pin: string;
  approved: boolean;
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
}

export interface Booking {
  id: string;
  childId: string;
  courseId: string;
  date: string;
  type: "group" | "private" | "meeting";
  status: "confirmed" | "pending" | "cancelled";
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  description: string;
  status: "paid" | "pending";
  receiptUrl?: string;
}

export interface Document {
  id: string;
  title: string;
  type: "tc" | "privacy" | "waiver" | "media_release" | "communication" | "material";
  signed: boolean;
  signedDate?: string;
  required: boolean;
  fileUrl?: string;
  sentBy?: "admin" | "operator";
  sentAt?: string;
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
  students: Student[];
  lessons: Lesson[];
  addChild: (child: Omit<Child, "id">) => Promise<void>;
  updateChild: (id: string, updates: Partial<Child>) => Promise<void>;
  addDelegate: (delegate: Omit<Delegate, "id" | "pin">) => Promise<void>;
  removeDelegate: (id: string) => Promise<void>;
  addPayment: (payment: Omit<Payment, "id">) => Promise<void>;
  signDocument: (id: string) => Promise<void>;
  updateStudentPresence: (studentId: string, present: boolean) => Promise<void>;
  addDocument: (doc: Omit<Document, "id">) => Promise<void>;
  addStars: (studentId: string, count: number) => Promise<void>;
  mediaConsent: "full" | "internal" | "none";
  setMediaConsent: (consent: "full" | "internal" | "none") => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

const INITIAL_CHILDREN: Child[] = [
  { id: "c1", name: "Sofia Rossi", age: 8, stars: 12, allergies: "Nessuna", medicalWaiver: "ambulance", courses: ["course1", "course2"] },
  { id: "c2", name: "Luca Rossi", age: 11, stars: 7, allergies: "Penicillina", medicalWaiver: "call_parent", courses: ["course3"] },
];

const INITIAL_DELEGATES: Delegate[] = [
  { id: "d1", childId: "c1", name: "Maria", surname: "Ferrari", phone: "+39 333 1234567", pin: "482931", approved: true },
];

const INITIAL_COURSES: Course[] = [
  { id: "course1", name: "Danza Classica", instructor: "Sara Bianchi", schedule: "Lun/Mer 15:30-17:00", location: "Sede Principale", capacity: 15, enrolled: 12, ageMin: 6, ageMax: 12, level: "Base", price: 120, description: "Corso base di danza classica per bambini.", hasPrivate: true },
  { id: "course2", name: "Hip Hop Junior", instructor: "Marco Verdi", schedule: "Mar/Gio 16:00-17:30", location: "Sede Principale", capacity: 12, enrolled: 10, ageMin: 7, ageMax: 14, level: "Intermedio", price: 110, description: "Corso di hip hop per ragazzi.", hasPrivate: true },
  { id: "course3", name: "Danza Contemporanea", instructor: "Elena Russo", schedule: "Mer/Ven 17:00-18:30", location: "Sede Principale", capacity: 10, enrolled: 8, ageMin: 10, ageMax: 16, level: "Avanzato", price: 130, description: "Corso di danza contemporanea.", hasPrivate: true },
  { id: "course4", name: "Yoga Kids", instructor: "Giulia Moro", schedule: "Sab 10:00-11:00", location: "Sala B", capacity: 15, enrolled: 6, ageMin: 5, ageMax: 10, level: "Base", price: 80, description: "Yoga per bambini.", hasPrivate: false },
];

const INITIAL_BOOKINGS: Booking[] = [
  { id: "b1", childId: "c1", courseId: "course1", date: "2026-04-10", type: "group", status: "confirmed" },
  { id: "b2", childId: "c1", courseId: "course2", date: "2026-04-08", type: "group", status: "confirmed" },
  { id: "b3", childId: "c2", courseId: "course3", date: "2026-04-09", type: "group", status: "confirmed" },
];

const INITIAL_PAYMENTS: Payment[] = [
  { id: "p1", amount: 120, date: "2026-04-01", description: "Danza Classica - Aprile 2026", status: "paid" },
  { id: "p2", amount: 110, date: "2026-04-01", description: "Hip Hop Junior - Aprile 2026", status: "paid" },
  { id: "p3", amount: 130, date: "2026-04-01", description: "Danza Contemporanea - Aprile 2026", status: "paid" },
  { id: "p4", amount: 120, date: "2026-05-01", description: "Danza Classica - Maggio 2026", status: "pending" },
];

const INITIAL_DOCUMENTS: Document[] = [
  { id: "doc1", title: "Termini & Condizioni", type: "tc", signed: true, signedDate: "2026-01-15", required: true },
  { id: "doc2", title: "Privacy Policy", type: "privacy", signed: true, signedDate: "2026-01-15", required: true },
  { id: "doc3", title: "Medical Waiver", type: "waiver", signed: true, signedDate: "2026-01-15", required: true },
  { id: "doc4", title: "Liberatoria Foto/Video", type: "media_release", signed: false, required: true },
  { id: "doc5", title: "Newsletter Aprile 2026", type: "communication", signed: false, required: false, sentBy: "admin", sentAt: "2026-04-01" },
  { id: "doc6", title: "Copione Saggio Fine Anno", type: "material", signed: false, required: false, sentBy: "operator", sentAt: "2026-04-05" },
];

const INITIAL_STUDENTS: Student[] = [
  { id: "s1", name: "Sofia Rossi", age: 8, parentName: "Marco Rossi", parentPhone: "+39 333 1111111", courses: ["Danza Classica"], allergies: "Nessuna", medicalWaiver: "ambulance", stars: 12, present: false, checkedIn: false },
  { id: "s2", name: "Emma Ferrari", age: 9, parentName: "Luigi Ferrari", parentPhone: "+39 333 2222222", courses: ["Danza Classica"], allergies: "Lattosio", medicalWaiver: "call_parent", stars: 8, present: false, checkedIn: true },
  { id: "s3", name: "Giulia Mancini", age: 8, parentName: "Anna Mancini", parentPhone: "+39 333 3333333", courses: ["Danza Classica", "Hip Hop"], allergies: "Nessuna", medicalWaiver: "ambulance", stars: 15, present: false, checkedIn: false },
  { id: "s4", name: "Martina Costa", age: 10, parentName: "Roberto Costa", parentPhone: "+39 333 4444444", courses: ["Hip Hop"], allergies: "Penicillina", medicalWaiver: "call_parent", stars: 5, present: false, checkedIn: false },
  { id: "s5", name: "Luca Rossi", age: 11, parentName: "Marco Rossi", parentPhone: "+39 333 1111111", courses: ["Danza Contemporanea"], allergies: "Penicillina", medicalWaiver: "call_parent", stars: 7, present: false, checkedIn: true },
];

const INITIAL_LESSONS: Lesson[] = [
  { id: "l1", courseId: "course1", courseName: "Danza Classica", date: "2026-04-09", startTime: "15:30", endTime: "17:00", location: "Sede Principale", room: "Sala A", enrolled: 12, present: 2, operatorId: "2" },
  { id: "l2", courseId: "course2", courseName: "Hip Hop Junior", date: "2026-04-09", startTime: "17:00", endTime: "18:30", location: "Sede Principale", room: "Sala B", enrolled: 10, present: 0, operatorId: "2" },
];

export function AppDataProvider({ children: childrenProp }: { children: React.ReactNode }) {
  const [childrenData, setChildrenData] = useState<Child[]>(INITIAL_CHILDREN);
  const [delegates, setDelegates] = useState<Delegate[]>(INITIAL_DELEGATES);
  const [courses] = useState<Course[]>(INITIAL_COURSES);
  const [bookings] = useState<Booking[]>(INITIAL_BOOKINGS);
  const [payments, setPayments] = useState<Payment[]>(INITIAL_PAYMENTS);
  const [documents, setDocuments] = useState<Document[]>(INITIAL_DOCUMENTS);
  const [students, setStudents] = useState<Student[]>(INITIAL_STUDENTS);
  const [lessons] = useState<Lesson[]>(INITIAL_LESSONS);
  const [mediaConsent, setMediaConsentState] = useState<"full" | "internal" | "none">("none");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem("stride_data");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.children) setChildrenData(data.children);
        if (data.delegates) setDelegates(data.delegates);
        if (data.payments) setPayments(data.payments);
        if (data.documents) setDocuments(data.documents);
        if (data.mediaConsent) setMediaConsentState(data.mediaConsent);
      }
    } catch {}
  };

  const saveData = async (updates: Record<string, unknown>) => {
    try {
      const stored = await AsyncStorage.getItem("stride_data");
      const current = stored ? JSON.parse(stored) : {};
      await AsyncStorage.setItem("stride_data", JSON.stringify({ ...current, ...updates }));
    } catch {}
  };

  const addChild = async (child: Omit<Child, "id">) => {
    const newChild = { ...child, id: Date.now().toString() };
    const updated = [...childrenData, newChild];
    setChildrenData(updated);
    await saveData({ children: updated });
  };

  const updateChild = async (id: string, updates: Partial<Child>) => {
    const updated = childrenData.map(c => c.id === id ? { ...c, ...updates } : c);
    setChildrenData(updated);
    await saveData({ children: updated });
  };

  const addDelegate = async (delegate: Omit<Delegate, "id" | "pin">) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const newDelegate = { ...delegate, id: Date.now().toString(), pin, approved: true };
    const updated = [...delegates, newDelegate];
    setDelegates(updated);
    await saveData({ delegates: updated });
  };

  const removeDelegate = async (id: string) => {
    const updated = delegates.filter(d => d.id !== id);
    setDelegates(updated);
    await saveData({ delegates: updated });
  };

  const addPayment = async (payment: Omit<Payment, "id">) => {
    const newPayment = { ...payment, id: Date.now().toString() };
    const updated = [...payments, newPayment];
    setPayments(updated);
    await saveData({ payments: updated });
  };

  const signDocument = async (id: string) => {
    const updated = documents.map(d => d.id === id ? { ...d, signed: true, signedDate: new Date().toISOString().split("T")[0] } : d);
    setDocuments(updated);
    await saveData({ documents: updated });
  };

  const updateStudentPresence = async (studentId: string, present: boolean) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, present } : s));
  };

  const addDocument = async (doc: Omit<Document, "id">) => {
    const newDoc = { ...doc, id: Date.now().toString() };
    const updated = [...documents, newDoc];
    setDocuments(updated);
    await saveData({ documents: updated });
  };

  const addStars = async (studentId: string, count: number) => {
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, stars: s.stars + count } : s));
  };

  const setMediaConsent = async (consent: "full" | "internal" | "none") => {
    setMediaConsentState(consent);
    await saveData({ mediaConsent: consent });
  };

  return (
    <AppDataContext.Provider value={{
      children: childrenData,
      delegates,
      courses,
      bookings,
      payments,
      documents,
      students,
      lessons,
      addChild,
      updateChild,
      addDelegate,
      removeDelegate,
      addPayment,
      signDocument,
      updateStudentPresence,
      addDocument,
      addStars,
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
