import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData, type LegalAdminDoc } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api } from "@/lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const LEGAL_TYPES: {
  value: LegalAdminDoc["type"];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: "terms",   label: "Terms",   icon: "document-text-outline"       },
  { value: "privacy", label: "Privacy", icon: "shield-outline"              },
  { value: "cookies", label: "Cookies", icon: "disc-outline"                },
  { value: "waiver",  label: "Waiver",  icon: "medkit-outline"              },
  { value: "other",   label: "Other",   icon: "ellipsis-horizontal-outline" },
];

type SourceType = "file" | "link";

const FILE_FORMAT_GROUPS = [
  { label: "PDF / Word",  mimeTypes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], ext: "PDF · DOC · DOCX", icon: "document-outline" as const },
  { label: "Image",       mimeTypes: ["image/jpeg", "image/png", "image/tiff"],                                                                               ext: "JPG · PNG · TIFF", icon: "image-outline" as const    },
];

function todayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function legalTypeInfo(type: LegalAdminDoc["type"], colors: any) {
  const base = LEGAL_TYPES.find(t => t.value === type) ?? LEGAL_TYPES[4];
  return { ...base, color: colors.primary, bg: "rgba(30,58,138,0.1)" };
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url.startsWith("http") ? url : `https://${url}`);
    return true;
  } catch {
    return false;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function linkBrand(url: string): { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string } {
  const lower = url.toLowerCase();
  if (lower.includes("drive.google")) return { label: "Google Drive", icon: "logo-google",   color: "#4285F4", bg: "#E8F0FE" };
  if (lower.includes("dropbox"))      return { label: "Dropbox",      icon: "cloud-outline",  color: "#0061FF", bg: "#E0EDFF" };
  if (lower.includes("onedrive") || lower.includes("sharepoint")) return { label: "OneDrive", icon: "cloud-outline", color: "#0078D4", bg: "#E6F2FB" };
  return { label: "External Link",    icon: "link-outline",           color: "#6B7280", bg: "#F3F4F6" };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LegalPrivacyPage() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { legalAdminDocs, addLegalDoc, updateLegalDoc, deleteLegalDoc } = useAppData();

  // ── Add form state ──
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<LegalAdminDoc["type"]>("terms");
  const [newHighPriority, setNewHighPriority] = useState(false);
  const [newMandatory, setNewMandatory] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newVersion, setNewVersion] = useState("1");
  const [newHasOptions, setNewHasOptions] = useState(false);
  const [newSourceType, setNewSourceType] = useState<SourceType>("file");
  const [newFileUri, setNewFileUri] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const [newFileSize, setNewFileSize] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // ── Audit log state ──
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [auditLog, setAuditLog] = useState<{
    id: string; user_id: number; user_email: string | null; document_id: string;
    document_version: string; selected_option: string | null;
    timestamp: string; ip_address: string | null;
    device_operating_system: string | null; document_text_hash: string;
  }[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ── Detail / viewer / replace state ──
  // showDetail = doc currently open in the detail bottom sheet
  // viewerDoc  = doc carried into the viewer modal (survives showDetail being cleared)
  // replaceDoc = doc carried into the replace modal (survives showDetail being cleared)
  const [showDetail, setShowDetail]   = useState<LegalAdminDoc | null>(null);
  const [showViewer, setShowViewer]   = useState(false);
  const [viewerDoc,  setViewerDoc]    = useState<LegalAdminDoc | null>(null);
  const [showReplace, setShowReplace] = useState(false);
  const [replaceDoc,  setReplaceDoc]  = useState<LegalAdminDoc | null>(null);

  const [replaceSourceType, setReplaceSourceType] = useState<SourceType>("file");
  const [replaceFileUri,    setReplaceFileUri]     = useState<string | null>(null);
  const [replaceFileName,   setReplaceFileName]    = useState<string | null>(null);
  const [replaceFileSize,   setReplaceFileSize]    = useState<string | null>(null);
  const [replaceLinkUrl,    setReplaceLinkUrl]     = useState("");

  const assocDocs   = legalAdminDocs.filter(d => d.source !== "stride_platform");
  const strideDocs  = legalAdminDocs.filter(d => d.source === "stride_platform");
  const mandatoryCount = assocDocs.filter(d => d.mandatorySignature).length;
  const priorityCount  = assocDocs.filter(d => d.highPriority).length;

  // ── File picker helpers ──────────────────────────────────────────────────────

  const pickDocument = async (onResult: (uri: string, name: string, size: string) => void) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets.length > 0) {
        const asset = res.assets[0];
        onResult(asset.uri, asset.name, formatFileSize(asset.size));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("Error", "Could not open file picker.");
    }
  };

  const pickImage = async (onResult: (uri: string, name: string, size: string) => void) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission Required", "Allow access to your photo library."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (!res.canceled && res.assets.length > 0) {
      const asset = res.assets[0];
      onResult(asset.uri, asset.fileName || "image.jpg", "");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // ── Add handlers ─────────────────────────────────────────────────────────────

  const resetAddForm = () => {
    setNewTitle(""); setNewType("terms"); setNewHighPriority(false);
    setNewMandatory(false); setNewDescription(""); setNewContent("");
    setNewVersion("1"); setNewHasOptions(false); setNewSourceType("file");
    setNewFileUri(null); setNewFileName(null); setNewFileSize(null); setNewLinkUrl("");
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) { Alert.alert("Error", "Please enter a document title."); return; }
    if (newSourceType === "link" && newLinkUrl.trim() && !isValidUrl(newLinkUrl.trim())) {
      Alert.alert("Error", "Please enter a valid URL (e.g. https://drive.google.com/...)"); return;
    }
    await addLegalDoc({
      title: newTitle.trim(),
      type: newType,
      highPriority: newHighPriority,
      mandatorySignature: newMandatory,
      createdAt: todayStr(),
      description: newDescription.trim() || undefined,
      content: newContent.trim() || undefined,
      version: newVersion.trim() || "1",
      has_options: newHasOptions || undefined,
      fileUri:  newSourceType === "file" ? (newFileUri ?? undefined)  : undefined,
      fileName: newSourceType === "file" ? (newFileName ?? undefined) : undefined,
      fileSize: newSourceType === "file" ? (newFileSize ?? undefined) : undefined,
      linkUrl:  newSourceType === "link" ? (newLinkUrl.trim() || undefined) : undefined,
    });
    resetAddForm();
    setShowAdd(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (newMandatory) Alert.alert("Mandatory Document Added", "Users will be blocked from the app until they sign this document.");
  };

  // ── View / Replace / Delete handlers ─────────────────────────────────────────

  const handleOpenView = (doc: LegalAdminDoc) => {
    // Capture the doc into viewerDoc BEFORE clearing showDetail
    setViewerDoc(doc);
    setShowDetail(null);
    setTimeout(() => setShowViewer(true), 200);
  };

  const handleOpenLink = async (url: string) => {
    const full = url.startsWith("http") ? url : `https://${url}`;
    const canOpen = await Linking.canOpenURL(full);
    if (canOpen) {
      await Linking.openURL(full);
    } else {
      Alert.alert("Cannot Open Link", `Please copy this URL and open it in your browser:\n\n${full}`);
    }
  };

  const handleOpenReplace = (doc: LegalAdminDoc) => {
    // Capture the doc into replaceDoc BEFORE clearing showDetail
    setReplaceDoc(doc);
    setReplaceSourceType(doc.linkUrl ? "link" : "file");
    setReplaceLinkUrl(doc.linkUrl || "");
    setReplaceFileUri(doc.fileUri || null);
    setReplaceFileName(doc.fileName || null);
    setReplaceFileSize(doc.fileSize != null ? String(doc.fileSize) : null);
    setShowDetail(null);
    setTimeout(() => setShowReplace(true), 200);
  };

  const handleSaveReplace = async (doc: LegalAdminDoc) => {
    if (replaceSourceType === "link" && replaceLinkUrl.trim() && !isValidUrl(replaceLinkUrl.trim())) {
      Alert.alert("Error", "Please enter a valid URL."); return;
    }
    const updates: Partial<LegalAdminDoc> = {
      createdAt: todayStr(),
      fileUri:  replaceSourceType === "file" ? (replaceFileUri  ?? doc.fileUri)  : undefined,
      fileName: replaceSourceType === "file" ? (replaceFileName ?? doc.fileName) : undefined,
      fileSize: replaceSourceType === "file" ? (replaceFileSize ?? doc.fileSize) : undefined,
      linkUrl:  replaceSourceType === "link" ? (replaceLinkUrl.trim() || undefined) : undefined,
    };
    await updateLegalDoc(doc.id, updates);
    // Update replaceDoc so the detail sheet shows fresh data if user goes back
    const updated = { ...doc, ...updates };
    setReplaceDoc(updated);
    setShowReplace(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Replaced", "Document has been updated successfully.");
  };

  const handleDelete = (doc: LegalAdminDoc) => {
    Alert.alert("Delete Document", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setShowDetail(null);
          await deleteLegalDoc(doc.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const FileSourcePicker = ({
    sourceType, setSourceType,
    fileUri, fileName, fileSize,
    linkUrl, setLinkUrl,
    onPickDoc, onPickImg, onClearFile,
  }: {
    sourceType: SourceType; setSourceType: (s: SourceType) => void;
    fileUri: string | null; fileName: string | null; fileSize: string | null;
    linkUrl: string; setLinkUrl: (v: string) => void;
    onPickDoc: () => void; onPickImg: () => void; onClearFile: () => void;
  }) => (
    <View>
      <View style={[styles.sourceToggle, { backgroundColor: colors.muted }]}>
        {(["file", "link"] as SourceType[]).map(s => (
          <Pressable
            key={s}
            style={[styles.sourceToggleBtn, sourceType === s && { backgroundColor: colors.primary }]}
            onPress={() => setSourceType(s)}
          >
            <Ionicons name={s === "file" ? "cloud-upload-outline" : "link-outline"} size={14} color={sourceType === s ? "#FFF" : colors.mutedForeground} />
            <Text style={[styles.sourceToggleBtnText, { color: sourceType === s ? "#FFF" : colors.mutedForeground }]}>
              {s === "file" ? "Upload File" : "External Link"}
            </Text>
          </Pressable>
        ))}
      </View>

      {sourceType === "file" ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          {fileUri || fileName ? (
            <View style={[styles.fileAttached, { backgroundColor: "#DBEAFE", borderColor: colors.primary }]}>
              <View style={[styles.fileIconBox, { backgroundColor: colors.primary }]}>
                <Ionicons name="document" size={18} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fileAttachedName, { color: colors.primary }]} numberOfLines={1}>{fileName || "Document"}</Text>
                {fileSize ? <Text style={[styles.fileAttachedSize, { color: colors.mutedForeground }]}>{fileSize}</Text> : null}
              </View>
              <Pressable onPress={onClearFile}>
                <Ionicons name="close-circle" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {FILE_FORMAT_GROUPS.map(g => (
                <Pressable
                  key={g.label}
                  style={[styles.pickFormatBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
                  onPress={g.label === "Image" ? onPickImg : onPickDoc}
                >
                  <View style={[styles.pickFormatIcon, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                    <Ionicons name={g.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickFormatLabel, { color: colors.foreground }]}>{g.label}</Text>
                    <Text style={[styles.pickFormatExt, { color: colors.mutedForeground }]}>{g.ext}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <View style={[styles.linkInputRow, { borderColor: linkUrl.trim() && isValidUrl(linkUrl.trim()) ? "#10B981" : colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="link-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.linkInput, { color: colors.foreground }]}
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://drive.google.com/..."
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {linkUrl.trim() && isValidUrl(linkUrl.trim()) && (
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            )}
          </View>
          {linkUrl.trim() && (
            <View style={[styles.linkBrandRow, { backgroundColor: linkBrand(linkUrl).bg }]}>
              <Ionicons name={linkBrand(linkUrl).icon} size={14} color={linkBrand(linkUrl).color} />
              <Text style={[styles.linkBrandText, { color: linkBrand(linkUrl).color }]}>{linkBrand(linkUrl).label} detected</Text>
            </View>
          )}
          <Text style={[styles.linkHint, { color: colors.mutedForeground }]}>
            Supported: Google Drive, Dropbox, OneDrive, or any public URL
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Legal & Waivers"
        onBack={() => router.back()}
      />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 16, paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats — based on association docs only */}
        <View style={styles.statsRow}>
          {[
            { label: "Documents",    value: assocDocs.length, color: colors.primary, bg: "rgba(30,58,138,0.1)" },
            { label: "Mandatory",    value: mandatoryCount,   color: colors.primary, bg: "rgba(30,58,138,0.1)" },
            { label: "High Priority",value: priorityCount,    color: colors.primary, bg: "rgba(30,58,138,0.1)" },
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: s.color }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── ASSOCIATION DOCUMENTS ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Association Documents</Text>
          <Pressable style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => { resetAddForm(); setShowAdd(true); }}>
            <Ionicons name="add" size={16} color="#FFF" />
            <Text style={styles.addBtnText}>Add New</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {assocDocs.map((doc, i) => {
            const info = legalTypeInfo(doc.type, colors);
            const hasFile = !!doc.fileUri || !!doc.fileName;
            const hasLink = !!doc.linkUrl;
            return (
              <Pressable
                key={doc.id}
                style={[styles.docRow, i < assocDocs.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                onPress={() => setShowDetail(doc)}
              >
                <View style={[styles.docIcon, { backgroundColor: info.bg }]}>
                  <Ionicons name={info.icon} size={18} color={info.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docTitle, { color: colors.foreground }]}>{doc.title}</Text>
                  <View style={styles.docBadges}>
                    <View style={[styles.typeBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    {doc.highPriority && (
                      <View style={[styles.flagBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                        <Ionicons name="alert-circle" size={9} color={colors.primary} />
                        <Text style={[styles.flagText, { color: colors.primary }]}>High Priority</Text>
                      </View>
                    )}
                    {doc.mandatorySignature && (
                      <View style={[styles.flagBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                        <Ionicons name="lock-closed" size={9} color={colors.primary} />
                        <Text style={[styles.flagText, { color: colors.primary }]}>Mandatory</Text>
                      </View>
                    )}
                    {hasFile && (
                      <View style={[styles.flagBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                        <Ionicons name="document" size={9} color={colors.primary} />
                        <Text style={[styles.flagText, { color: colors.primary }]}>File</Text>
                      </View>
                    )}
                    {hasLink && (
                      <View style={[styles.flagBadge, { backgroundColor: "rgba(30,58,138,0.1)" }]}>
                        <Ionicons name="link" size={9} color={colors.primary} />
                        <Text style={[styles.flagText, { color: colors.primary }]}>{linkBrand(doc.linkUrl!).label}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </Pressable>
            );
          })}
          {assocDocs.length === 0 && (
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <Ionicons name="document-outline" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No documents yet</Text>
              <Text style={[styles.emptySubText, { color: colors.mutedForeground }]}>Tap "Add New" to create your first association document</Text>
            </View>
          )}
        </View>

        {mandatoryCount > 0 && (
          <View style={[styles.callout, { backgroundColor: "#EDE9FE" }]}>
            <Ionicons name="lock-closed-outline" size={18} color="#7C3AED" />
            <Text style={[styles.calloutText, { color: "#5B21B6" }]}>
              {mandatoryCount} mandatory document{mandatoryCount !== 1 ? "s" : ""} will block member access until signed.
            </Text>
          </View>
        )}

        {/* ── STRIDE PLATFORM AGREEMENTS ── */}
        {strideDocs.length > 0 && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 24, marginBottom: 10, marginHorizontal: 4 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="shield-checkmark" size={15} color="#92400E" />
              </View>
              <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: "#92400E", flex: 1 }}>STRIDE PLATFORM AGREEMENTS</Text>
              <View style={{ backgroundColor: "#FEF3C7", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#92400E" }}>READ-ONLY</Text>
              </View>
            </View>
            <View style={{ backgroundColor: "#FFFBEB", borderRadius: 16, borderWidth: 1.5, borderColor: "#FCD34D", marginBottom: 4 }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                <Text style={{ fontSize: 12, color: "#92400E", lineHeight: 17 }}>
                  These are the agreements you accepted when joining the Stride platform. They cannot be edited or deleted.
                </Text>
              </View>
              {strideDocs.map((doc, i) => {
                const info = legalTypeInfo(doc.type, colors);
                return (
                  <Pressable
                    key={doc.id}
                    style={[styles.docRow, i < strideDocs.length - 1 && { borderBottomWidth: 1, borderBottomColor: "#FCD34D" }]}
                    onPress={() => setShowDetail(doc)}
                  >
                    <View style={[styles.docIcon, { backgroundColor: "#FEF3C7" }]}>
                      <Ionicons name={info.icon} size={18} color="#92400E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docTitle, { color: "#78350F" }]}>{doc.title}</Text>
                      <View style={styles.docBadges}>
                        <View style={[styles.typeBadge, { backgroundColor: "#FEF3C7" }]}>
                          <Text style={[styles.typeBadgeText, { color: "#92400E" }]}>{info.label}</Text>
                        </View>
                        <View style={[styles.flagBadge, { backgroundColor: "#FEF3C7" }]}>
                          <Ionicons name="lock-closed" size={9} color="#92400E" />
                          <Text style={[styles.flagText, { color: "#92400E" }]}>Platform</Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#B45309" />
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* ── CONSENT AUDIT LOG ── */}
        <Pressable
          style={({ pressed }) => [styles.placeholderCard, { backgroundColor: colors.card, borderColor: "#1E3A8A", opacity: pressed ? 0.85 : 1, marginTop: 16 }]}
          onPress={async () => {
            setAuditLoading(true);
            setShowAuditLog(true);
            try {
              const rows = await api.legalAuditLog();
              setAuditLog(rows ?? []);
            } catch { setAuditLog([]); }
            finally { setAuditLoading(false); }
          }}
        >
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#1E3A8A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Consent Audit Log</Text>
            <Text style={[styles.placeholderDesc, { color: colors.mutedForeground }]}>SHA-256 tamper-evident signature history</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </Pressable>
      </ScrollView>

      {/* ════════════════════════════════════════════════════
          AUDIT LOG MODAL
      ════════════════════════════════════════════════════ */}
      <Modal visible={showAuditLog} transparent animationType="slide" onRequestClose={() => setShowAuditLog(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, maxHeight: "90%", paddingBottom: 0 }]}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="shield-checkmark" size={20} color="#1E3A8A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetTitle, { color: colors.foreground, marginBottom: 0 }]}>Signature Audit Log</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Tamper-evident SHA-256 ledger</Text>
              </View>
              <Pressable onPress={() => setShowAuditLog(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {auditLoading ? (
              <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
                <Ionicons name="hourglass-outline" size={32} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Loading audit records…</Text>
              </View>
            ) : auditLog.length === 0 ? (
              <View style={{ padding: 40, alignItems: "center", gap: 12 }}>
                <Ionicons name="document-outline" size={32} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center" }}>No signatures recorded yet. Records appear here once users complete mandatory signing.</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }} showsVerticalScrollIndicator>
                {auditLog.map(row => (
                  <View key={row.id} style={{ backgroundColor: colors.background, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="person-circle-outline" size={16} color="#1E3A8A" />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flex: 1 }} numberOfLines={1}>
                        {row.user_email ?? `User ${row.user_id}`}
                      </Text>
                      {row.selected_option && (
                        <View style={{ backgroundColor: "#EDE9FE", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: "#7C3AED" }}>{row.selected_option.replace("_", " ")}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="document-text-outline" size={12} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 11, color: colors.mutedForeground, flex: 1 }} numberOfLines={1}>Doc: {row.document_id} · v{row.document_version}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {new Date(row.timestamp).toLocaleString()}
                      </Text>
                    </View>
                    {row.ip_address && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Ionicons name="globe-outline" size={12} color={colors.mutedForeground} />
                        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>IP: {row.ip_address} · {row.device_operating_system ?? "Unknown OS"}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 2 }}>
                      <Ionicons name="lock-closed-outline" size={12} color="#059669" />
                      <Text style={{ fontSize: 10, color: "#059669", flex: 1, fontFamily: "monospace" }} numberOfLines={2}>
                        SHA-256: {row.document_text_hash}
                      </Text>
                    </View>
                  </View>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          ADD DOCUMENT MODAL
      ════════════════════════════════════════════════════ */}
      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.overlay}>
          <ScrollView
            style={[styles.sheet, { backgroundColor: colors.card }]}
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.primary }]}>Add Document</Text>
              <Pressable onPress={() => setShowAdd(false)}>
                <Ionicons name="close" size={24} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary }]}>Document Title</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Terms & Conditions 2026"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 14 }]}>Document Type</Text>
            <View style={styles.typeRow}>
              {LEGAL_TYPES.map(t => (
                <Pressable
                  key={t.value}
                  style={[styles.typeBtn, newType === t.value && { backgroundColor: "rgba(30,58,138,0.1)", borderColor: colors.primary }]}
                  onPress={() => setNewType(t.value)}
                >
                  <Ionicons name={t.icon} size={16} color={newType === t.value ? colors.primary : colors.mutedForeground} />
                  <Text style={[styles.typeBtnText, { color: newType === t.value ? colors.primary : colors.mutedForeground }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 14 }]}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, height: 72 }]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="Brief summary of the document..."
              placeholderTextColor={colors.mutedForeground}
              multiline
            />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 14 }]}>Full Document Text (shown during signing)</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground, height: 140 }]}
              value={newContent}
              onChangeText={setNewContent}
              placeholder="Paste the full legal text here. Users will be required to scroll through this before signing."
              placeholderTextColor={colors.mutedForeground}
              multiline
              textAlignVertical="top"
            />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 14 }]}>Version</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
              value={newVersion}
              onChangeText={setNewVersion}
              placeholder="1"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 16 }]}>Document Source</Text>
            <FileSourcePicker
              sourceType={newSourceType}
              setSourceType={setNewSourceType}
              fileUri={newFileUri}
              fileName={newFileName}
              fileSize={newFileSize}
              linkUrl={newLinkUrl}
              setLinkUrl={setNewLinkUrl}
              onPickDoc={() => pickDocument((uri, name, size) => { setNewFileUri(uri); setNewFileName(name); setNewFileSize(size); })}
              onPickImg={() => pickImage((uri, name, size) => { setNewFileUri(uri); setNewFileName(name); setNewFileSize(size); })}
              onClearFile={() => { setNewFileUri(null); setNewFileName(null); setNewFileSize(null); }}
            />

            <View style={{ gap: 14, marginTop: 20 }}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="list-outline" size={16} color="#7C3AED" />
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Requires Option Selection</Text>
                  </View>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Signer must choose Option A, B, or C</Text>
                </View>
                <Switch
                  value={newHasOptions}
                  onValueChange={setNewHasOptions}
                  trackColor={{ false: colors.muted, true: "#EDE9FE" }}
                  thumbColor={newHasOptions ? "#7C3AED" : "#9CA3AF"}
                />
              </View>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>High Priority</Text>
                  </View>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Shown with a red alert indicator</Text>
                </View>
                <Switch
                  value={newHighPriority}
                  onValueChange={setNewHighPriority}
                  trackColor={{ false: colors.muted, true: "#FEE2E2" }}
                  thumbColor={newHighPriority ? "#EF4444" : "#9CA3AF"}
                />
              </View>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="lock-closed-outline" size={16} color="#7C3AED" />
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Mandatory Signature</Text>
                  </View>
                  <Text style={[styles.toggleDesc, { color: colors.mutedForeground }]}>Blocks app access until signed</Text>
                </View>
                <Switch
                  value={newMandatory}
                  onValueChange={setNewMandatory}
                  trackColor={{ false: colors.muted, true: "#EDE9FE" }}
                  thumbColor={newMandatory ? "#7C3AED" : "#9CA3AF"}
                />
              </View>
            </View>

            {newMandatory && (
              <View style={[styles.callout, { backgroundColor: "#EDE9FE", marginTop: 12 }]}>
                <Ionicons name="information-circle-outline" size={16} color="#7C3AED" />
                <Text style={[styles.calloutText, { color: "#5B21B6" }]}>
                  All users will see a blocking screen until they sign this document.
                </Text>
              </View>
            )}

            <View style={styles.sheetBtns}>
              <Pressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={() => setShowAdd(false)}>
                <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleAdd}>
                <Ionicons name="add-circle" size={16} color="#FFF" />
                <Text style={styles.saveBtnText}>Add Document</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          DOCUMENT DETAIL MODAL
      ════════════════════════════════════════════════════ */}
      <Modal visible={!!showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(null)}>
        <View style={styles.overlay}>
          {showDetail && (() => {
            const doc = showDetail;
            const info = legalTypeInfo(doc.type, colors);
            const hasFile = !!doc.fileUri || !!doc.fileName;
            const hasLink = !!doc.linkUrl;
            const brand = hasLink ? linkBrand(doc.linkUrl!) : null;
            return (
              <View style={[styles.sheet, { backgroundColor: colors.card }]}>
                <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.sheetHeader}>
                    <View style={[styles.detailIcon, { backgroundColor: info.bg }]}>
                      <Ionicons name={info.icon} size={24} color={info.color} />
                    </View>
                    <Pressable onPress={() => setShowDetail(null)}>
                      <Ionicons name="close" size={24} color={colors.mutedForeground} />
                    </Pressable>
                  </View>

                  <Text style={[styles.detailTitle, { color: colors.primary }]}>{doc.title}</Text>
                  {doc.description ? (
                    <Text style={[styles.detailDesc, { color: colors.mutedForeground }]}>{doc.description}</Text>
                  ) : null}

                  <View style={styles.docBadges}>
                    <View style={[styles.typeBadge, { backgroundColor: info.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: info.color }]}>{info.label}</Text>
                    </View>
                    {doc.highPriority && (
                      <View style={[styles.flagBadge, { backgroundColor: "#FEE2E2" }]}>
                        <Ionicons name="alert-circle" size={9} color="#EF4444" />
                        <Text style={[styles.flagText, { color: "#EF4444" }]}>High Priority</Text>
                      </View>
                    )}
                    {doc.mandatorySignature && (
                      <View style={[styles.flagBadge, { backgroundColor: "#EDE9FE" }]}>
                        <Ionicons name="lock-closed" size={9} color="#7C3AED" />
                        <Text style={[styles.flagText, { color: "#7C3AED" }]}>Mandatory Signature</Text>
                      </View>
                    )}
                  </View>

                  {(hasFile || hasLink) && (
                    <View style={[styles.sourceInfoBox, { backgroundColor: hasLink ? brand!.bg : "#DBEAFE", borderColor: hasLink ? brand!.color : colors.primary }]}>
                      <Ionicons
                        name={hasLink ? brand!.icon : "document"}
                        size={20}
                        color={hasLink ? brand!.color : colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sourceInfoLabel, { color: hasLink ? brand!.color : colors.primary }]}>
                          {hasLink ? brand!.label : doc.fileName || "Uploaded File"}
                        </Text>
                        {hasLink && (
                          <Text style={[styles.sourceInfoUrl, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {doc.linkUrl}
                          </Text>
                        )}
                        {hasFile && doc.fileSize ? (
                          <Text style={[styles.sourceInfoUrl, { color: colors.mutedForeground }]}>{doc.fileSize}</Text>
                        ) : null}
                      </View>
                      {hasLink && (
                        <Pressable
                          style={[styles.openLinkBtn, { backgroundColor: brand!.color }]}
                          onPress={() => handleOpenLink(doc.linkUrl!)}
                        >
                          <Ionicons name="open-outline" size={14} color="#FFF" />
                          <Text style={styles.openLinkBtnText}>Open</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  <View style={[styles.metaRow, { borderColor: colors.border }]}>
                    <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Added</Text>
                    <Text style={[styles.metaValue, { color: colors.foreground }]}>{doc.createdAt}</Text>
                  </View>

                  {/* Action buttons — all fully wired */}
                  <View style={styles.actionRow}>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#D1FAE5" }]}
                      onPress={() => handleOpenView(doc)}
                    >
                      <Ionicons name="eye-outline" size={16} color="#10B981" />
                      <Text style={[styles.actionBtnText, { color: "#10B981" }]}>View</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#DBEAFE" }]}
                      onPress={() => handleOpenReplace(doc)}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />
                      <Text style={[styles.actionBtnText, { color: colors.primary }]}>Replace</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { backgroundColor: "#FEE2E2" }]}
                      onPress={() => handleDelete(doc)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>Delete</Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <Pressable
                      style={[styles.toggleSmall, { backgroundColor: doc.highPriority ? "#FEE2E2" : colors.muted }]}
                      onPress={() => { updateLegalDoc(doc.id, { highPriority: !doc.highPriority }); setShowDetail({ ...doc, highPriority: !doc.highPriority }); }}
                    >
                      <Ionicons name="alert-circle-outline" size={13} color={doc.highPriority ? "#EF4444" : colors.mutedForeground} />
                      <Text style={[styles.toggleSmallText, { color: doc.highPriority ? "#EF4444" : colors.mutedForeground }]}>
                        {doc.highPriority ? "Remove Priority" : "Set Priority"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.toggleSmall, { backgroundColor: doc.mandatorySignature ? "#EDE9FE" : colors.muted }]}
                      onPress={() => { updateLegalDoc(doc.id, { mandatorySignature: !doc.mandatorySignature }); setShowDetail({ ...doc, mandatorySignature: !doc.mandatorySignature }); }}
                    >
                      <Ionicons name="lock-closed-outline" size={13} color={doc.mandatorySignature ? "#7C3AED" : colors.mutedForeground} />
                      <Text style={[styles.toggleSmallText, { color: doc.mandatorySignature ? "#7C3AED" : colors.mutedForeground }]}>
                        {doc.mandatorySignature ? "Remove Mandatory" : "Make Mandatory"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          DOCUMENT VIEWER MODAL
          Uses viewerDoc (not showDetail) so it survives modal transition
      ════════════════════════════════════════════════════ */}
      <Modal visible={showViewer} transparent animationType="slide" onRequestClose={() => setShowViewer(false)}>
        <View style={styles.overlay}>
          {viewerDoc && (() => {
            const doc = viewerDoc;
            const info = legalTypeInfo(doc.type, colors);
            const hasLink = !!doc.linkUrl;
            const brand = hasLink ? linkBrand(doc.linkUrl!) : null;
            return (
              <View style={[styles.sheet, { backgroundColor: colors.card }]}>
                <View style={{ padding: 24 }}>
                  <View style={styles.sheetHeader}>
                    <View style={[styles.detailIcon, { backgroundColor: info.bg }]}>
                      <Ionicons name={info.icon} size={24} color={info.color} />
                    </View>
                    <Pressable onPress={() => { setShowViewer(false); setTimeout(() => setShowDetail(viewerDoc), 200); }}>
                      <Ionicons name="close" size={24} color={colors.mutedForeground} />
                    </Pressable>
                  </View>

                  <Text style={[styles.detailTitle, { color: colors.primary }]}>{doc.title}</Text>
                  <Text style={[styles.viewerSubtitle, { color: colors.mutedForeground }]}>Added {doc.createdAt}</Text>

                  {hasLink ? (
                    <View style={{ gap: 12, marginTop: 16 }}>
                      <View style={[styles.sourceInfoBox, { backgroundColor: brand!.bg, borderColor: brand!.color }]}>
                        <Ionicons name={brand!.icon} size={22} color={brand!.color} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.sourceInfoLabel, { color: brand!.color }]}>{brand!.label}</Text>
                          <Text style={[styles.sourceInfoUrl, { color: colors.mutedForeground }]} numberOfLines={2}>{doc.linkUrl}</Text>
                        </View>
                      </View>
                      <Pressable
                        style={[styles.openFullBtn, { backgroundColor: brand!.color }]}
                        onPress={() => handleOpenLink(doc.linkUrl!)}
                      >
                        <Ionicons name="open-outline" size={18} color="#FFF" />
                        <Text style={styles.openFullBtnText}>Open in Browser</Text>
                      </Pressable>
                    </View>
                  ) : doc.fileUri || doc.fileName ? (
                    <View style={{ gap: 12, marginTop: 16 }}>
                      <View style={[styles.sourceInfoBox, { backgroundColor: "#DBEAFE", borderColor: colors.primary }]}>
                        <Ionicons name="document" size={22} color={colors.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.sourceInfoLabel, { color: colors.primary }]}>{doc.fileName || "Uploaded Document"}</Text>
                          {doc.fileSize ? <Text style={[styles.sourceInfoUrl, { color: colors.mutedForeground }]}>{doc.fileSize}</Text> : null}
                        </View>
                      </View>
                      <Pressable
                        style={[styles.openFullBtn, { backgroundColor: colors.primary }]}
                        onPress={() => {
                          if (doc.fileUri) Linking.openURL(doc.fileUri);
                          else Alert.alert("Preview", "File preview is only available for documents with a stored URI.");
                        }}
                      >
                        <Ionicons name="document-text-outline" size={18} color="#FFF" />
                        <Text style={styles.openFullBtnText}>Open File</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={[styles.noSourceBox, { backgroundColor: colors.muted }]}>
                      <Ionicons name="document-outline" size={32} color={colors.mutedForeground} />
                      <Text style={[styles.noSourceText, { color: colors.mutedForeground }]}>
                        No file or link attached to this document.
                      </Text>
                      <Pressable
                        style={[styles.attachBtn, { backgroundColor: colors.primary }]}
                        onPress={() => { setShowViewer(false); setTimeout(() => handleOpenReplace(doc), 200); }}
                      >
                        <Ionicons name="cloud-upload-outline" size={16} color="#FFF" />
                        <Text style={styles.attachBtnText}>Attach File or Link</Text>
                      </Pressable>
                    </View>
                  )}

                  {doc.description ? (
                    <View style={[styles.descriptionBox, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.descriptionText, { color: colors.foreground }]}>{doc.description}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════
          REPLACE DOCUMENT MODAL
          Uses replaceDoc (not showDetail) so it survives modal transition
      ════════════════════════════════════════════════════ */}
      <Modal visible={showReplace} transparent animationType="slide" onRequestClose={() => setShowReplace(false)}>
        <View style={styles.overlay}>
          {replaceDoc && (
            <ScrollView
              style={[styles.sheet, { backgroundColor: colors.card }]}
              contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={[styles.sheetTitle, { color: colors.primary }]}>Replace Document</Text>
                  <Text style={[styles.sheetSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{replaceDoc.title}</Text>
                </View>
                <Pressable onPress={() => { setShowReplace(false); setTimeout(() => setShowDetail(replaceDoc), 200); }}>
                  <Ionicons name="close" size={24} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <View style={[styles.callout, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
                <Text style={[styles.calloutText, { color: "#92400E" }]}>
                  The current document will be replaced and the upload date updated to today.
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.primary, marginTop: 12 }]}>New Document Source</Text>
              <FileSourcePicker
                sourceType={replaceSourceType}
                setSourceType={setReplaceSourceType}
                fileUri={replaceFileUri}
                fileName={replaceFileName}
                fileSize={replaceFileSize}
                linkUrl={replaceLinkUrl}
                setLinkUrl={setReplaceLinkUrl}
                onPickDoc={() => pickDocument((uri, name, size) => { setReplaceFileUri(uri); setReplaceFileName(name); setReplaceFileSize(size); })}
                onPickImg={() => pickImage((uri, name, size) => { setReplaceFileUri(uri); setReplaceFileName(name); setReplaceFileSize(size); })}
                onClearFile={() => { setReplaceFileUri(null); setReplaceFileName(null); setReplaceFileSize(null); }}
              />

              <View style={styles.sheetBtns}>
                <Pressable
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setShowReplace(false); setTimeout(() => setShowDetail(replaceDoc), 200); }}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleSaveReplace(replaceDoc)}
                >
                  <Ionicons name="cloud-upload-outline" size={16} color="#FFF" />
                  <Text style={styles.saveBtnText}>Save Replacement</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pageTitle: { fontSize: 22, fontWeight: "800" },
  pageSubtitle: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  statCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 11 },
  addBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  docRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontWeight: "600", marginBottom: 5 },
  docBadges: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 2 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },
  flagBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  flagText: { fontSize: 10, fontWeight: "700" },
  emptyText: { fontSize: 15, fontWeight: "600" },
  emptySubText: { fontSize: 12, textAlign: "center", lineHeight: 17 },
  callout: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, padding: 14, marginBottom: 14 },
  calloutText: { flex: 1, fontSize: 13, lineHeight: 18 },
  placeholderCard: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", padding: 16, marginBottom: 10 },
  placeholderTitle: { fontSize: 14, fontWeight: "600" },
  placeholderDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  soonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  soonText: { fontSize: 10, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: "800" },
  sheetSubtitle: { fontSize: 13, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeBtn: { flex: 1, minWidth: 68, alignItems: "center", gap: 4, borderRadius: 12, padding: 10, backgroundColor: "#F3F4F6", borderWidth: 2, borderColor: "transparent" },
  typeBtnText: { fontSize: 11, fontWeight: "700" },
  sourceToggle: { flexDirection: "row", borderRadius: 12, padding: 3, gap: 4 },
  sourceToggleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10 },
  sourceToggleBtnText: { fontSize: 13, fontWeight: "600" },
  fileAttached: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12 },
  fileIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  fileAttachedName: { fontSize: 14, fontWeight: "700" },
  fileAttachedSize: { fontSize: 11, marginTop: 2 },
  pickFormatBtn: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  pickFormatIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pickFormatLabel: { fontSize: 14, fontWeight: "600" },
  pickFormatExt: { fontSize: 11, marginTop: 2 },
  linkInputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  linkInput: { flex: 1, fontSize: 14 },
  linkBrandRow: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  linkBrandText: { fontSize: 12, fontWeight: "600" },
  linkHint: { fontSize: 11, marginTop: 8, lineHeight: 15 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleLabel: { fontSize: 15, fontWeight: "500" },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  sheetBtns: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  cancelBtnText: { fontWeight: "600", fontSize: 14 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  saveBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  detailIcon: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailTitle: { fontSize: 20, fontWeight: "800", marginTop: 10, marginBottom: 4 },
  detailDesc: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  viewerSubtitle: { fontSize: 13, marginBottom: 4 },
  sourceInfoBox: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, padding: 14 },
  sourceInfoLabel: { fontSize: 14, fontWeight: "700" },
  sourceInfoUrl: { fontSize: 11, marginTop: 2 },
  openLinkBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  openLinkBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  openFullBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14 },
  openFullBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
  noSourceBox: { borderRadius: 14, padding: 24, alignItems: "center", gap: 10, marginTop: 12 },
  noSourceText: { fontSize: 13, textAlign: "center", lineHeight: 18 },
  attachBtn: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  attachBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  descriptionBox: { borderRadius: 12, padding: 14, marginTop: 12 },
  descriptionText: { fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, marginBottom: 16, marginTop: 10 },
  metaLabel: { fontSize: 13 },
  metaValue: { fontSize: 13, fontWeight: "700" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, paddingVertical: 11 },
  actionBtnText: { fontWeight: "700", fontSize: 13 },
  toggleSmall: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, paddingVertical: 9 },
  toggleSmallText: { fontSize: 11, fontWeight: "700" },
});
