import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import type { Course, Student } from "@/context/AppDataContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type Layout = "full" | "grid" | "badge";
type GridSize = 2 | 4 | 6 | 8 | 10;

// ── Demo fallback data ────────────────────────────────────────────────────────

const DEMO_STUDENTS: Student[] = [
  { id: "d1", name: "Sofia Rossi",    age: 8,  parentName: "Marco Rossi",   parentPhone: "", courses: ["Classical Dance"], allergies: "None", medicalWaiver: "call_parent", stars: 12 },
  { id: "d2", name: "Luca Ferrari",   age: 10, parentName: "Luigi Ferrari",  parentPhone: "", courses: ["Hip Hop"],         allergies: "None", medicalWaiver: "call_parent", stars: 8  },
  { id: "d3", name: "Giulia Mancini", age: 7,  parentName: "Anna Mancini",   parentPhone: "", courses: ["Classical Dance"], allergies: "None", medicalWaiver: "call_parent", stars: 5  },
  { id: "d4", name: "Marco Bianchi",  age: 12, parentName: "Carlo Bianchi",  parentPhone: "", courses: ["Ballet"],          allergies: "Nuts", medicalWaiver: "ambulance",   stars: 25 },
  { id: "d5", name: "Emma Conti",     age: 9,  parentName: "Sara Conti",     parentPhone: "", courses: ["Contemporary"],    allergies: "None", medicalWaiver: "call_parent", stars: 18 },
  { id: "d6", name: "Pietro Russo",   age: 11, parentName: "Giulia Russo",   parentPhone: "", courses: ["Hip Hop"],         allergies: "None", medicalWaiver: "call_parent", stars: 31 },
];

const DEMO_COURSES: Course[] = [
  { id: "dc1", name: "Classical Dance", instructor: "Maria Rossi",   schedule: "Mon, Wed", location: "Studio A", capacity: 15, enrolled: 12, ageMin: 5, ageMax: 12, level: "Beginner",     price: 120, description: "", hasPrivate: true,  dropInEnabled: true,  dropInPrice: 20, fixedBlockEnabled: true, fixedBlockPrice: 800, fixedBlockLessons: 8 },
  { id: "dc2", name: "Hip Hop",         instructor: "Luigi Ferrari",  schedule: "Tue, Thu", location: "Studio B", capacity: 12, enrolled: 8,  ageMin: 8, ageMax: 16, level: "All",          price: 100, description: "", hasPrivate: false, dropInEnabled: true,  dropInPrice: 18, fixedBlockEnabled: true, fixedBlockPrice: 700, fixedBlockLessons: 8 },
  { id: "dc3", name: "Ballet",          instructor: "Anna Bianchi",   schedule: "Wed, Fri", location: "Studio A", capacity: 10, enrolled: 6,  ageMin: 5, ageMax: 14, level: "All",          price: 130, description: "", hasPrivate: true,  dropInEnabled: false, dropInPrice: 0,  fixedBlockEnabled: true, fixedBlockPrice: 900, fixedBlockLessons: 8 },
  { id: "dc4", name: "Contemporary",    instructor: "Marco Conti",    schedule: "Mon, Fri", location: "Studio C", capacity: 10, enrolled: 4,  ageMin: 10,ageMax: 18, level: "Intermediate", price: 110, description: "", hasPrivate: true,  dropInEnabled: true,  dropInPrice: 20, fixedBlockEnabled: true, fixedBlockPrice: 750, fixedBlockLessons: 8 },
];

// ── QR-in-HTML helper ─────────────────────────────────────────────────────────

async function qrSvgFor(data: string): Promise<string> {
  try {
    const QRCode = (await import("qrcode")).default;
    const svg = await QRCode.toString(data, { type: "svg", margin: 1 });
    return svg;
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="white"/>
      <rect x="10" y="10" width="30" height="30" fill="#1E3A8A"/>
      <rect x="60" y="10" width="30" height="30" fill="#1E3A8A"/>
      <rect x="10" y="60" width="30" height="30" fill="#1E3A8A"/>
      <rect x="45" y="45" width="15" height="15" fill="#1E3A8A"/>
    </svg>`;
  }
}

// ── HTML builders ─────────────────────────────────────────────────────────────

const BASE_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; background: white; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

function splitName(name: string) {
  const parts = name.trim().split(" ");
  return { first: parts[0] ?? name, last: parts.slice(1).join(" ") };
}

async function buildFullPageHtml(students: Student[], opts: BadgeOpts): Promise<string> {
  const pages = await Promise.all(students.map(async (s) => {
    const { first, last } = splitName(s.name);
    const qr = await qrSvgFor(`STRIDE:CHILD:${s.id}:${encodeURIComponent(s.name)}`);
    const course = s.courses[0] ?? opts.courseName ?? "Dance";
    return `
      <div style="width:210mm;min-height:297mm;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20mm;page-break-after:always;position:relative;background:white;">
        <div style="position:absolute;top:0;left:0;right:0;height:14px;background:#1E3A8A;"></div>
        <div style="position:absolute;top:14px;left:0;right:0;height:5px;background:#FBBF24;"></div>
        ${opts.showPhoto ? `<div style="width:110px;height:110px;border-radius:55px;background:#DBEAFE;border:3px solid #1E3A8A;display:flex;align-items:center;justify-content:center;margin-bottom:20px;"><span style="font-size:52px;font-weight:900;color:#1E3A8A;">${first[0] ?? "?"}</span></div>` : ""}
        <div style="font-size:64px;font-weight:900;color:#1E3A8A;text-align:center;letter-spacing:-2px;line-height:1;${opts.showLastName && last ? "margin-bottom:6px;" : "margin-bottom:24px;"}">${first}</div>
        ${opts.showLastName && last ? `<div style="font-size:36px;font-weight:600;color:#374151;text-align:center;margin-bottom:24px;">${last}</div>` : ""}
        <div style="width:210px;height:210px;">${qr}</div>
        ${opts.showSecondary ? `<div style="font-size:18px;color:#6B7280;text-align:center;margin-top:20px;">${course} · Età ${s.age} anni</div>` : ""}
        <div style="position:absolute;bottom:14mm;font-size:11px;color:#9CA3AF;text-align:center;">Stride Dance School · stride.app</div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:10px;background:#1E3A8A;"></div>
      </div>`;
  }));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${pages.join("")}</body></html>`;
}

async function buildGridHtml(students: Student[], gridSize: GridSize, opts: BadgeOpts): Promise<string> {
  const cols = gridSize <= 2 ? 1 : 2;
  const chunks: Student[][] = [];
  for (let i = 0; i < students.length; i += gridSize) chunks.push(students.slice(i, i + gridSize));

  const qrSvgs = await Promise.all(students.map(s => qrSvgFor(`STRIDE:CHILD:${s.id}:${encodeURIComponent(s.name)}`)));

  const pages = chunks.map(chunk => {
    const cards = chunk.map(s => {
      const { first, last } = splitName(s.name);
      const idx = students.indexOf(s);
      const course = s.courses[0] ?? opts.courseName ?? "";
      return `
        <div style="border:2px solid #1E3A8A;border-radius:10px;padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px;background:white;">
          <div style="width:130px;height:130px;">${qrSvgs[idx]}</div>
          <div style="font-size:22px;font-weight:800;color:#1E3A8A;text-align:center;">${first}${opts.showLastName && last ? `<br/><span style="font-size:15px;font-weight:600;color:#374151;">${last}</span>` : ""}</div>
          ${opts.showPhoto ? `<div style="width:36px;height:36px;border-radius:18px;background:#DBEAFE;border:2px solid #1E3A8A;display:flex;align-items:center;justify-content:center;"><span style="font-size:16px;font-weight:900;color:#1E3A8A;">${first[0] ?? "?"}</span></div>` : ""}
          ${opts.showSecondary && course ? `<div style="font-size:12px;color:#6B7280;text-align:center;">${course} · Età ${s.age}</div>` : ""}
        </div>`;
    }).join("");
    return `
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:10mm;padding:15mm;page-break-after:always;background:white;align-content:start;">
        <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;margin-bottom:5mm;">
          <div style="font-size:14px;font-weight:800;color:#1E3A8A;border-left:4px solid #FBBF24;padding-left:8px;">${opts.courseName ?? "Tutti gli Studenti"}</div>
          <div style="font-size:11px;color:#9CA3AF;">Stride Dance School</div>
        </div>
        ${cards}
      </div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${pages}</body></html>`;
}

async function buildBadgeHtml(students: Student[], opts: BadgeOpts): Promise<string> {
  const PER_ROW = 3;
  const PER_PAGE = 15;
  const chunks: Student[][] = [];
  for (let i = 0; i < students.length; i += PER_PAGE) chunks.push(students.slice(i, i + PER_PAGE));
  const qrSvgs = await Promise.all(students.map(s => qrSvgFor(`STRIDE:CHILD:${s.id}:${encodeURIComponent(s.name)}`)));

  const pages = chunks.map(chunk => {
    const badges = chunk.map(s => {
      const { first, last } = splitName(s.name);
      const idx = students.indexOf(s);
      const course = s.courses[0] ?? opts.courseName ?? "";
      return `
        <div style="width:85.6mm;height:54mm;border:1.5px solid #1E3A8A;border-radius:3mm;display:flex;align-items:center;padding:3mm;gap:3mm;background:white;overflow:hidden;position:relative;">
          <div style="position:absolute;top:0;left:0;right:0;height:3px;background:#1E3A8A;"></div>
          <div style="width:44mm;height:44mm;flex-shrink:0;">${qrSvgs[idx]}</div>
          <div style="flex:1;display:flex;flex-direction:column;gap:2px;overflow:hidden;min-width:0;">
            ${opts.showPhoto ? `<div style="width:26px;height:26px;border-radius:13px;background:#DBEAFE;border:1.5px solid #1E3A8A;display:flex;align-items:center;justify-content:center;margin-bottom:2px;"><span style="font-size:11px;font-weight:900;color:#1E3A8A;">${first[0] ?? "?"}</span></div>` : ""}
            <div style="font-size:17px;font-weight:900;color:#1E3A8A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${first}</div>
            ${opts.showLastName && last ? `<div style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${last}</div>` : ""}
            ${opts.showSecondary && course ? `<div style="font-size:10px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${course}</div>` : ""}
            <div style="margin-top:auto;display:flex;align-items:center;gap:3px;">
              <div style="width:8px;height:8px;border-radius:4px;background:#FBBF24;"></div>
              <span style="font-size:7px;color:#9CA3AF;letter-spacing:0.5px;">STRIDE</span>
            </div>
          </div>
        </div>`;
    }).join("");
    return `
      <div style="display:grid;grid-template-columns:repeat(${PER_ROW},85.6mm);gap:4mm;padding:12mm;page-break-after:always;background:#F9FAFB;">
        ${badges}
      </div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${pages}</body></html>`;
}

interface BadgeOpts {
  showPhoto: boolean;
  showLastName: boolean;
  showSecondary: boolean;
  courseName?: string;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PdfBadgeGenerator() {
  const { students: ctxStudents, courses: ctxCourses } = useAppData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabBarHeight = Platform.OS === "web" ? 84 : 49;

  const students = ctxStudents.length > 0 ? ctxStudents : DEMO_STUDENTS;
  const courses  = ctxCourses.length  > 0 ? ctxCourses  : DEMO_COURSES;

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [layout,           setLayout]           = useState<Layout>("badge");
  const [gridSize,         setGridSize]         = useState<GridSize>(6);
  const [showPhoto,        setShowPhoto]        = useState(false);
  const [showLastName,     setShowLastName]     = useState(true);
  const [showSecondary,    setShowSecondary]    = useState(true);
  const [generating,       setGenerating]       = useState(false);
  const [shareVisible,     setShareVisible]     = useState(false);
  const [pendingHtml,      setPendingHtml]      = useState<string>("");

  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  const filteredStudents = selectedCourseId
    ? students.filter(s => s.courses.some(cn => cn === selectedCourse?.name || cn === selectedCourseId))
    : students;

  const displayStudents = filteredStudents.length > 0 ? filteredStudents : DEMO_STUDENTS.slice(0, 6);

  // ── Build HTML (shared by all actions) ─────────────────────────────────────

  const buildHtml = async (): Promise<string> => {
    const opts: BadgeOpts = { showPhoto, showLastName, showSecondary, courseName: selectedCourse?.name };
    if (layout === "full")       return buildFullPageHtml(displayStudents, opts);
    else if (layout === "grid")  return buildGridHtml(displayStudents, gridSize, opts);
    else                         return buildBadgeHtml(displayStudents, opts);
  };

  // ── Open share panel ────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const html = await buildHtml();
      setPendingHtml(html);
      setShareVisible(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Errore", "Impossibile generare il PDF. Riprova.");
    } finally {
      setGenerating(false);
    }
  };

  // ── Web helper: open HTML in new tab for print/save ─────────────────────────

  const webOpenAndPrint = (html: string, autoPrint = false) => {
    if (typeof window === "undefined") return;
    const win = window.open("", "_blank");
    if (!win) { Alert.alert("Pop-up blocked", "Please allow pop-ups and try again."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    if (autoPrint) setTimeout(() => { win.print(); }, 300);
  };

  // ── Share actions ────────────────────────────────────────────────────────────

  const doShare = async (html: string) => {
    setShareVisible(false);
    if (Platform.OS === "web") { webOpenAndPrint(html, false); return; }
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share Badge PDF", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF Ready", `Saved to: ${uri}`);
      }
    } catch {
      Alert.alert("Error", "Could not share the PDF.");
    }
  };

  const doPrint = async (html: string) => {
    setShareVisible(false);
    if (Platform.OS === "web") { webOpenAndPrint(html, true); return; }
    try {
      await Print.printAsync({ html });
    } catch {
      Alert.alert("Error", "Could not start printing.");
    }
  };

  const doWhatsApp = async (html: string) => {
    setShareVisible(false);
    if (Platform.OS === "web") { webOpenAndPrint(html, false); return; }
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Send via WhatsApp", UTI: "com.adobe.pdf" });
      } else {
        const waUrl = "whatsapp://send";
        const canOpen = await Linking.canOpenURL(waUrl);
        if (canOpen) await Linking.openURL(waUrl);
        else Alert.alert("WhatsApp not available");
      }
    } catch {
      Alert.alert("Error", "Could not send via WhatsApp.");
    }
  };

  const doEmail = async (html: string) => {
    setShareVisible(false);
    if (Platform.OS === "web") { webOpenAndPrint(html, false); return; }
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Send via Email", UTI: "com.adobe.pdf" });
      } else {
        await Linking.openURL("mailto:?subject=Badge%20PDF");
      }
    } catch {
      Alert.alert("Error", "Could not send via Email.");
    }
  };

  // ── Badge preview (React Native) ────────────────────────────────────────────

  const sample = displayStudents[0];
  const previewFirst  = sample?.name.split(" ")[0]           ?? "Sofia";
  const previewLast   = sample?.name.split(" ").slice(1).join(" ") ?? "Rossi";
  const previewCourse = sample?.courses[0] ?? selectedCourse?.name ?? "Classical Dance";
  const previewAge    = sample?.age ?? 8;

  const PreviewContent = () => {
    if (layout === "full") {
      return (
        <View style={styles.previewFull}>
          <View style={styles.previewStripeTop} />
          <View style={styles.previewStripeGold} />
          {showPhoto && (
            <View style={styles.previewCircle}>
              <Text style={styles.previewInitial}>{previewFirst[0]}</Text>
            </View>
          )}
          <Text style={styles.previewFirstFull}>{previewFirst.toUpperCase()}</Text>
          {showLastName && previewLast ? <Text style={styles.previewLastFull}>{previewLast}</Text> : null}
          <View style={styles.previewQrBox}>
            <Ionicons name="qr-code" size={52} color="#1E3A8A" />
          </View>
          {showSecondary && <Text style={styles.previewSec}>{previewCourse} · Età {previewAge}</Text>}
          <View style={styles.previewStripeBottom} />
        </View>
      );
    }
    if (layout === "grid") {
      return (
        <View style={styles.previewGridWrap}>
          {displayStudents.slice(0, Math.min(4, gridSize)).map((s, i) => (
            <View key={i} style={styles.previewGridCard}>
              <Ionicons name="qr-code" size={28} color="#1E3A8A" />
              <Text style={styles.previewGridName}>{s.name.split(" ")[0]}</Text>
              {showSecondary && <Text style={styles.previewGridSec}>{s.courses[0] ?? previewCourse}</Text>}
            </View>
          ))}
        </View>
      );
    }
    return (
      <View style={styles.previewBadge}>
        <View style={styles.previewBadgeStripe} />
        <View style={styles.previewBadgeQrWrap}>
          <Ionicons name="qr-code" size={38} color="#1E3A8A" />
        </View>
        <View style={styles.previewBadgeInfo}>
          {showPhoto && (
            <View style={styles.previewBadgePhotoCircle}>
              <Text style={styles.previewBadgePhotoText}>{previewFirst[0]}</Text>
            </View>
          )}
          <Text style={styles.previewBadgeFirst}>{previewFirst}</Text>
          {showLastName && previewLast ? <Text style={styles.previewBadgeLast}>{previewLast}</Text> : null}
          {showSecondary ? <Text style={styles.previewBadgeSec}>{previewCourse}</Text> : null}
          <View style={styles.previewBadgeFooter}>
            <View style={styles.previewBadgeDot} />
            <Text style={styles.previewBadgeTag}>STRIDE</Text>
          </View>
        </View>
      </View>
    );
  };

  const GRID_SIZES: GridSize[] = [2, 4, 6, 8, 10];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1E3A8A" />
        </Pressable>
        <Text style={styles.headerTitle}>Badge Generator</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Course ── */}
        <Text style={styles.sectionLabel}>COURSE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <Pressable
            style={[styles.chip, !selectedCourseId && styles.chipActive]}
            onPress={() => setSelectedCourseId("")}
          >
            <Text style={[styles.chipText, !selectedCourseId && styles.chipTextActive]}>All</Text>
          </Pressable>
          {courses.map(c => (
            <Pressable
              key={c.id}
              style={[styles.chip, selectedCourseId === c.id && styles.chipActive]}
              onPress={() => setSelectedCourseId(c.id)}
            >
              <Text style={[styles.chipText, selectedCourseId === c.id && styles.chipTextActive]}>{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.studentCount}>{displayStudents.length} student{displayStudents.length !== 1 ? "s" : ""} selected</Text>

        {/* ── Layout ── */}
        <Text style={styles.sectionLabel}>LAYOUT</Text>
        <View style={styles.layoutRow}>
          {(["full", "grid", "badge"] as Layout[]).map(l => (
            <Pressable
              key={l}
              style={[styles.layoutBtn, layout === l && styles.layoutBtnActive]}
              onPress={() => { setLayout(l); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Ionicons
                name={l === "full" ? "document-outline" : l === "grid" ? "grid-outline" : "card-outline"}
                size={18}
                color={layout === l ? "#FFF" : "#1E3A8A"}
              />
              <Text style={[styles.layoutBtnText, layout === l && styles.layoutBtnTextActive]}>
                {l === "full" ? "Full\nPage" : l === "grid" ? "Grid" : "Plastic\nBadge"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Grid size ── */}
        {layout === "grid" && (
          <View style={styles.gridSizeSection}>
            <Text style={styles.sectionLabel}>PER PAGE (MAX 10)</Text>
            <View style={styles.gridSizeRow}>
              {GRID_SIZES.map(n => (
                <Pressable
                  key={n}
                  style={[styles.gridSizeBtn, gridSize === n && styles.gridSizeBtnActive]}
                  onPress={() => { setGridSize(n); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={[styles.gridSizeTxt, gridSize === n && styles.gridSizeTxtActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Content toggles ── */}
        <Text style={styles.sectionLabel}>BADGE CONTENT</Text>
        <View style={styles.togglesCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Ionicons name="person" size={15} color="#1E3A8A" />
              <Text style={styles.toggleLabel}>First Name</Text>
            </View>
            <View style={styles.requiredBadge}><Text style={styles.requiredText}>Required</Text></View>
          </View>
          <View style={[styles.toggleRow, styles.toggleRowBorder]}>
            <View style={styles.toggleLeft}>
              <Ionicons name="qr-code" size={15} color="#1E3A8A" />
              <Text style={styles.toggleLabel}>QR Code</Text>
            </View>
            <View style={styles.requiredBadge}><Text style={styles.requiredText}>Required</Text></View>
          </View>
          <View style={[styles.divider]} />
          <View style={[styles.toggleRow, styles.toggleRowBorder]}>
            <View style={styles.toggleLeft}>
              <Ionicons name="image-outline" size={15} color="#6B7280" />
              <Text style={[styles.toggleLabel, { color: "#6B7280" }]}>Photo / Avatar</Text>
            </View>
            <Switch value={showPhoto} onValueChange={v => { setShowPhoto(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} trackColor={{ true: "#1E3A8A", false: "#D1D5DB" }} thumbColor="#FFF" />
          </View>
          <View style={[styles.toggleRow, styles.toggleRowBorder]}>
            <View style={styles.toggleLeft}>
              <Ionicons name="person-outline" size={15} color="#6B7280" />
              <Text style={[styles.toggleLabel, { color: "#6B7280" }]}>Last Name</Text>
            </View>
            <Switch value={showLastName} onValueChange={v => { setShowLastName(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} trackColor={{ true: "#1E3A8A", false: "#D1D5DB" }} thumbColor="#FFF" />
          </View>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Ionicons name="information-circle-outline" size={15} color="#6B7280" />
              <Text style={[styles.toggleLabel, { color: "#6B7280" }]}>Course & Age</Text>
            </View>
            <Switch value={showSecondary} onValueChange={v => { setShowSecondary(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} trackColor={{ true: "#1E3A8A", false: "#D1D5DB" }} thumbColor="#FFF" />
          </View>
        </View>

        {/* ── Preview ── */}
        <Text style={styles.sectionLabel}>PREVIEW</Text>
        <View style={styles.previewCard}>
          <PreviewContent />
        </View>

      </ScrollView>

      {/* ── Sticky Generate Footer ── */}
      <View style={[styles.footer, { paddingBottom: Math.max(tabBarHeight, insets.bottom) + 8 }]}>
        <Pressable
          style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <>
              <ActivityIndicator size="small" color="#1E3A8A" />
              <Text style={styles.generateBtnText}>Preparing PDF…</Text>
            </>
          ) : (
            <>
              <Ionicons name="document-text-outline" size={22} color="#1E3A8A" />
              <Text style={styles.generateBtnText}>Generate PDF</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Share Action Sheet ── */}
      <Modal
        visible={shareVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setShareVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShareVisible(false)}>
          <Pressable style={[styles.shareSheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>What do you want to do with the PDF?</Text>
            <Text style={styles.sheetSub}>{displayStudents.length} student{displayStudents.length !== 1 ? "s" : ""} · {layout === "full" ? "full page" : layout === "grid" ? "grid" : "badge"} layout</Text>

            <Pressable style={styles.shareRow} onPress={() => doPrint(pendingHtml)}>
              <View style={[styles.shareIcon, { backgroundColor: "#EEF3FF" }]}>
                <Ionicons name="print-outline" size={22} color="#1E3A8A" />
              </View>
              <View style={styles.shareInfo}>
                <Text style={styles.shareRowTitle}>Print</Text>
                <Text style={styles.shareRowSub}>Send directly to a printer</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <View style={styles.sheetDivider} />

            <Pressable style={styles.shareRow} onPress={() => doWhatsApp(pendingHtml)}>
              <View style={[styles.shareIcon, { backgroundColor: "#DCFCE7" }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#16A34A" />
              </View>
              <View style={styles.shareInfo}>
                <Text style={styles.shareRowTitle}>WhatsApp</Text>
                <Text style={styles.shareRowSub}>Send the PDF via WhatsApp</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable style={styles.shareRow} onPress={() => doEmail(pendingHtml)}>
              <View style={[styles.shareIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="mail-outline" size={22} color="#D97706" />
              </View>
              <View style={styles.shareInfo}>
                <Text style={styles.shareRowTitle}>Email</Text>
                <Text style={styles.shareRowSub}>Send the PDF via email</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable style={styles.shareRow} onPress={() => doShare(pendingHtml)}>
              <View style={[styles.shareIcon, { backgroundColor: "#F3E8FF" }]}>
                <Ionicons name="share-outline" size={22} color="#7C3AED" />
              </View>
              <View style={styles.shareInfo}>
                <Text style={styles.shareRowTitle}>Message / Drive / Dropbox…</Text>
                <Text style={styles.shareRowSub}>Opens the system sharing panel</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>

            <Pressable style={styles.cancelBtn} onPress={() => setShareVisible(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: "#F8FAFF" },
  header:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#E5EAF5" },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EEF3FF", alignItems: "center", justifyContent: "center" },
  headerTitle:{ fontSize: 17, fontWeight: "800", color: "#1E3A8A", flex: 1, textAlign: "center" },
  headerRight:{ width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#6B7280", letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  studentCount: { fontSize: 12, color: "#9CA3AF", marginTop: 4, marginBottom: 0 },

  chipRow:    { gap: 8, paddingRight: 16 },
  chip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1.5, borderColor: "#D1D5DB" },
  chipActive: { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
  chipText:   { fontSize: 13, fontWeight: "600", color: "#374151" },
  chipTextActive: { color: "#FFF" },

  layoutRow:           { flexDirection: "row", gap: 10 },
  layoutBtn:           { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: 14, backgroundColor: "#FFF", borderWidth: 2, borderColor: "#1E3A8A", gap: 6 },
  layoutBtnActive:     { backgroundColor: "#1E3A8A" },
  layoutBtnText:       { fontSize: 12, fontWeight: "700", color: "#1E3A8A", textAlign: "center" },
  layoutBtnTextActive: { color: "#FFF" },

  gridSizeSection: { marginTop: 0 },
  gridSizeRow:     { flexDirection: "row", gap: 8 },
  gridSizeBtn:     { flex: 1, height: 40, borderRadius: 10, backgroundColor: "#FFF", borderWidth: 1.5, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  gridSizeBtnActive: { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
  gridSizeTxt:     { fontSize: 14, fontWeight: "700", color: "#374151" },
  gridSizeTxtActive: { color: "#FFF" },

  togglesCard:    { backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5EAF5", overflow: "hidden" },
  toggleRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  toggleRowBorder:{ borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  toggleLeft:     { flexDirection: "row", alignItems: "center", gap: 10 },
  toggleLabel:    { fontSize: 14, fontWeight: "600", color: "#1E3A8A" },
  requiredBadge:  { backgroundColor: "#EEF3FF", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  requiredText:   { fontSize: 11, fontWeight: "600", color: "#1E3A8A" },
  divider:        { height: 1, backgroundColor: "#E5EAF5", marginHorizontal: 14 },

  previewCard: { backgroundColor: "#FFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5EAF5", padding: 16, alignItems: "center", minHeight: 130, justifyContent: "center" },

  // Full page preview
  previewFull:        { width: "100%", backgroundColor: "#F0F4FF", borderRadius: 10, alignItems: "center", padding: 16, gap: 6, overflow: "hidden", position: "relative" },
  previewStripeTop:   { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: "#1E3A8A" },
  previewStripeGold:  { position: "absolute", top: 6, left: 0, right: 0, height: 3, backgroundColor: "#FBBF24" },
  previewStripeBottom:{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, backgroundColor: "#1E3A8A" },
  previewCircle:      { width: 48, height: 48, borderRadius: 24, backgroundColor: "#DBEAFE", borderWidth: 2, borderColor: "#1E3A8A", alignItems: "center", justifyContent: "center", marginTop: 8 },
  previewInitial:     { fontSize: 22, fontWeight: "900", color: "#1E3A8A" },
  previewFirstFull:   { fontSize: 26, fontWeight: "900", color: "#1E3A8A", marginTop: 10 },
  previewLastFull:    { fontSize: 16, fontWeight: "600", color: "#374151" },
  previewQrBox:       { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  previewSec:         { fontSize: 12, color: "#6B7280", marginBottom: 10 },

  // Grid preview
  previewGridWrap:  { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  previewGridCard:  { width: "44%", borderWidth: 2, borderColor: "#1E3A8A", borderRadius: 8, padding: 10, alignItems: "center", gap: 4 },
  previewGridName:  { fontSize: 13, fontWeight: "800", color: "#1E3A8A" },
  previewGridSec:   { fontSize: 10, color: "#6B7280" },

  // Badge preview
  previewBadge:          { flexDirection: "row", width: "100%", maxWidth: 280, height: 80, borderWidth: 2, borderColor: "#1E3A8A", borderRadius: 8, overflow: "hidden", backgroundColor: "#FFF" },
  previewBadgeStripe:    { position: "absolute", top: 0, left: 0, right: 0, height: 3, backgroundColor: "#1E3A8A" },
  previewBadgeQrWrap:    { width: 74, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F4FF" },
  previewBadgeInfo:      { flex: 1, padding: 8, gap: 2, justifyContent: "center" },
  previewBadgePhotoCircle:{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#DBEAFE", borderWidth: 1.5, borderColor: "#1E3A8A", alignItems: "center", justifyContent: "center" },
  previewBadgePhotoText: { fontSize: 10, fontWeight: "900", color: "#1E3A8A" },
  previewBadgeFirst:     { fontSize: 16, fontWeight: "900", color: "#1E3A8A" },
  previewBadgeLast:      { fontSize: 11, fontWeight: "600", color: "#374151" },
  previewBadgeSec:       { fontSize: 10, color: "#6B7280" },
  previewBadgeFooter:    { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  previewBadgeDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: "#FBBF24" },
  previewBadgeTag:       { fontSize: 7, color: "#9CA3AF", letterSpacing: 0.5 },

  // Generate button footer
  footer:              { paddingHorizontal: 16, paddingTop: 12, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E5EAF5" },
  generateBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#FBBF24", borderRadius: 16, paddingVertical: 18 },
  generateBtnDisabled: { opacity: 0.6 },
  generateBtnText:     { fontSize: 16, fontWeight: "800", color: "#1E3A8A" },

  // Share modal
  modalOverlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  shareSheet:     { backgroundColor: "#FFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12 },
  sheetHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 16 },
  sheetTitle:     { fontSize: 17, fontWeight: "800", color: "#1E3A8A", textAlign: "center", marginBottom: 4 },
  sheetSub:       { fontSize: 12, color: "#9CA3AF", textAlign: "center", marginBottom: 20 },
  sheetDivider:   { height: 1, backgroundColor: "#F3F4F6", marginVertical: 4 },
  shareRow:       { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  shareIcon:      { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  shareInfo:      { flex: 1 },
  shareRowTitle:  { fontSize: 15, fontWeight: "700", color: "#111827" },
  shareRowSub:    { fontSize: 12, color: "#6B7280", marginTop: 1 },
  cancelBtn:      { marginTop: 12, backgroundColor: "#F3F4F6", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  cancelBtnText:  { fontSize: 15, fontWeight: "700", color: "#374151" },
});
