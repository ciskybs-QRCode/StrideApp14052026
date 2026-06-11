import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useRealtime } from "@/context/RealtimeContext";
import { useColors } from "@/hooks/useColors";
import { BackButton } from "@/components/BackButton";
import { BrandingLogoOverlay } from "@/components/BrandingLogoOverlay";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";
import { SignaturePad } from "@/components/SignaturePad";
import { useTerminology } from "@/context/TerminologyContext";
import { useUnread } from "@/context/UnreadContext";

function DocsTabIcon({ color, size }: { color: string; size: number }) {
  const { hasUnreadDocs } = useUnread();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name="settings-sharp" size={size} color={color} />
      {hasUnreadDocs && (
        <View style={{
          position: "absolute", top: -3, right: -6,
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: "#FBBF24", borderWidth: 1.5, borderColor: "#FFFFFF",
        }} />
      )}
    </View>
  );
}

function CartTabIcon({ color, size, count }: { color: string; size: number; count: number }) {
  return (
    <View>
      <Ionicons name="cart" size={size} color={color} />
      {count > 0 && (
        <View style={{
          position: "absolute", top: -4, right: -8, minWidth: 16, height: 16,
          borderRadius: 8, backgroundColor: "#FBBF24", borderWidth: 2,
          borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", paddingHorizontal: 2,
        }}>
          <Text style={{ color: "#1E3A8A", fontSize: 8, fontWeight: "800", lineHeight: 12 }}>
            {count > 9 ? "9+" : String(count)}
          </Text>
        </View>
      )}
    </View>
  );
}

const OPTION_KEYS = ["OPTION_A", "OPTION_B", "OPTION_C"] as const;

export default function ParentTabLayout() {
  const colors    = useColors();
  const insets    = useSafeAreaInsets();
  const isIOS     = Platform.OS === "ios";
  const isWeb     = Platform.OS === "web";
  const { user }                                       = useAuth();
  const { cartBadgeCount }                            = useRealtime();
  const { legalAdminDocs, signedAdminDocIds, signAdminDoc } = useAppData();
  const { secondaryRoleName }                         = useTerminology();

  // ── Gate state ───────────────────────────────────────────────────────────────
  const [gatePhase,     setGatePhase]     = useState<"index" | "signing">("index");
  const [currentDocIdx, setCurrentDocIdx] = useState(0);
  const [hasScrolled,   setHasScrolled]   = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [checkboxTicked, setCheckboxTicked] = useState(false);
  const [signatureSvg,  setSignatureSvg]  = useState<string | null>(null);
  const [padHasContent, setPadHasContent] = useState(false);
  const [isSaving,      setIsSaving]      = useState(false);
  const [padKey,        setPadKey]        = useState(0);

  const scrollContentH = useRef(0);
  const scrollVisibleH = useRef(0);

  const unsignedMandatoryDocs = legalAdminDocs.filter(
    d => d.mandatorySignature && !signedAdminDocIds.includes(d.id)
  );
  const totalMandatory = legalAdminDocs.filter(d => d.mandatorySignature).length;
  const blocked = unsignedMandatoryDocs.length > 0 && !user?.roles?.includes("super_admin");
  const currentDoc = unsignedMandatoryDocs[currentDocIdx] ?? unsignedMandatoryDocs[0];

  const canSign = Boolean(
    hasScrolled &&
    (!currentDoc?.has_options || selectedOption !== null) &&
    checkboxTicked &&
    signatureSvg !== null &&
    !isSaving
  );

  const openSigningDoc = (idx: number) => {
    setCurrentDocIdx(idx);
    setHasScrolled(false);
    setSelectedOption(null);
    setCheckboxTicked(false);
    setSignatureSvg(null);
    setPadHasContent(false);
    setPadKey(k => k + 1);
    scrollContentH.current = 0;
    scrollVisibleH.current = 0;
    setGatePhase("signing");
  };

  const handleConfirmSign = async () => {
    if (!canSign || !currentDoc) return;
    setIsSaving(true);
    const deviceOS = Platform.OS === "ios"
      ? `iOS ${String(Platform.Version)}`
      : Platform.OS === "android"
      ? `Android ${String(Platform.Version)}`
      : "Web";
    try {
      await signAdminDoc(currentDoc.id, {
        signature_svg: signatureSvg!,
        document_content: currentDoc.content,
        document_version: currentDoc.version ?? "1",
        selected_option: selectedOption ?? undefined,
        device_os: deviceOS,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { }
    setIsSaving(false);
    setGatePhase("index");
  };

  // ── Remaining conditions hint ─────────────────────────────────────────────
  const remainingHints: string[] = [];
  if (!hasScrolled)         remainingHints.push("Read the full document");
  if (currentDoc?.has_options && selectedOption === null) remainingHints.push("Select an option");
  if (!checkboxTicked)      remainingHints.push("Tick the confirmation checkbox");
  if (signatureSvg === null) remainingHints.push("Confirm your signature");

  const optionLabel = (key: typeof OPTION_KEYS[number], doc: typeof currentDoc) => {
    if (!doc) return key;
    const map = { OPTION_A: doc.option_labels?.a, OPTION_B: doc.option_labels?.b, OPTION_C: doc.option_labels?.c };
    return map[key] ?? key.replace("_", " ");
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          headerShown: false,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : colors.background,
            borderTopWidth: isWeb ? 1 : 0,
            borderTopColor: colors.border,
            elevation: 0,
            height: isWeb ? 84 : undefined,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
            ) : isWeb ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
            ) : null,
          tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
        }}
      >
        <Tabs.Screen name="home"      options={{ title: "Home",    tabBarIcon: ({ color, size }) => <Ionicons name="home"                   size={size} color={color} /> }} />
        <Tabs.Screen name="children"  options={{ title: "Members", tabBarIcon: ({ color, size }) => <Ionicons name="people-circle-outline"   size={size} color={color} /> }} />
        <Tabs.Screen name="courses"   options={{ title: "Courses", tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes"           size={size} color={color} /> }} />
        <Tabs.Screen name="wallet"      options={{ href: null }} />
        <Tabs.Screen name="marketplace" options={{ href: null }} />
        <Tabs.Screen name="cart"      options={{ title: "Cart",    tabBarIcon: ({ color, size }) => <CartTabIcon color={color} size={size} count={cartBadgeCount} /> }} />
        <Tabs.Screen name="profile"   options={{ href: null }} />
        <Tabs.Screen name="documents" options={{ title: "Settings",tabBarIcon: ({ color, size }) => <DocsTabIcon color={color} size={size} /> }} />
        <Tabs.Screen name="checkout"    options={{ href: null }} />
        <Tabs.Screen name="book-lesson" options={{ href: null }} />
        <Tabs.Screen name="alerts"          options={{ href: null }} />
        <Tabs.Screen name="guardian-circle" options={{ href: null }} />
        <Tabs.Screen name="org-search"      options={{ href: null }} />
        <Tabs.Screen name="pickup-audit"    options={{ href: null }} />
        <Tabs.Screen name="doc-sign"        options={{ href: null }} />
        <Tabs.Screen name="doc-view"        options={{ href: null }} />
        <Tabs.Screen name="doc-consent"     options={{ href: null }} />
      </Tabs>

      <SecurityAlarmOverlay alertsRoute="/(parent)/alerts" />
      <BrandingLogoOverlay />

      {/* ── Mandatory Legal Signature Gate ──────────────────────────────────── */}
      <Modal visible={blocked} transparent={false} animationType="slide" statusBarTranslucent>
        <View style={[styles.gateRoot, { paddingTop: insets.top }]}>

          {/* Header */}
          <View style={styles.gateHeader}>
            {gatePhase === "signing" ? (
              <Pressable onPress={() => setGatePhase("index")} hitSlop={12} style={styles.headerBack}>
                <Ionicons name="chevron-back" size={22} color="#FFF" />
              </Pressable>
            ) : (
              <View style={styles.headerBack}>
                <Ionicons name="lock-closed" size={20} color="#FBBF24" />
              </View>
            )}

            <View style={{ flex: 1 }}>
              {gatePhase === "signing" && currentDoc ? (
                <>
                  <Text style={styles.headerMeta}>
                    Document {unsignedMandatoryDocs.indexOf(currentDoc) + 1} of {unsignedMandatoryDocs.length}
                  </Text>
                  <Text style={styles.headerTitle} numberOfLines={1}>{currentDoc.title}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.headerMeta}>Action Required</Text>
                  <Text style={styles.headerTitle}>Signature Required</Text>
                </>
              )}
            </View>

            <View style={[styles.progressChip]}>
              <Text style={styles.progressChipText}>
                {totalMandatory - unsignedMandatoryDocs.length}/{totalMandatory}
              </Text>
            </View>
          </View>

          {/* Body */}
          <View style={styles.gateBody}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.gateScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={(e) => {
                if (gatePhase !== "signing") return;
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80) {
                  setHasScrolled(true);
                }
              }}
              onContentSizeChange={(_, h) => {
                scrollContentH.current = h;
                if (scrollVisibleH.current > 0 && h <= scrollVisibleH.current + 40) {
                  setHasScrolled(true);
                }
              }}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                scrollVisibleH.current = h;
                if (scrollContentH.current > 0 && scrollContentH.current <= h + 40) {
                  setHasScrolled(true);
                }
              }}
            >
              {/* Progress bar */}
              <View style={styles.progressRow}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {
                    width: `${((totalMandatory - unsignedMandatoryDocs.length) / Math.max(totalMandatory, 1)) * 100}%` as `${number}%`
                  }]} />
                </View>
                <Text style={styles.progressLabel}>
                  {totalMandatory - unsignedMandatoryDocs.length} of {totalMandatory} signed
                </Text>
              </View>

              {/* ── INDEX PHASE ─────────────────────────────────────────────── */}
              {gatePhase === "index" && (
                <>
                  <View style={styles.indexIntro}>
                    <Ionicons name="shield-checkmark" size={36} color="#1E3A8A" />
                    <Text style={styles.indexTitle}>Documents Awaiting Signature</Text>
                    <Text style={styles.indexSubtitle}>
                      You must read and sign all mandatory documents before accessing the app. Each document requires your affirmation and biometric signature.
                    </Text>
                  </View>

                  {unsignedMandatoryDocs.map((doc, idx) => (
                    <View key={doc.id} style={styles.docCard}>
                      <View style={[styles.docIconWrap, { backgroundColor: doc.highPriority ? "#FEE2E2" : "#DBEAFE" }]}>
                        <Ionicons
                          name={doc.highPriority ? "alert-circle" : "document-text-outline"}
                          size={22}
                          color={doc.highPriority ? "#EF4444" : "#1E3A8A"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docCardTitle}>{doc.title}</Text>
                        {doc.description ? (
                          <Text style={styles.docCardDesc} numberOfLines={2}>{doc.description}</Text>
                        ) : null}
                        <View style={styles.docCardMeta}>
                          {doc.has_options && (
                            <View style={styles.optionsBadge}>
                              <Ionicons name="list-outline" size={10} color="#7C3AED" />
                              <Text style={styles.optionsBadgeText}>Options required</Text>
                            </View>
                          )}
                          {doc.highPriority && (
                            <View style={styles.urgentBadge}>
                              <Ionicons name="alert-circle" size={10} color="#EF4444" />
                              <Text style={styles.urgentBadgeText}>High priority</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Pressable
                        style={({ pressed }) => [styles.reviewBtn, pressed && { opacity: 0.8 }]}
                        onPress={() => openSigningDoc(idx)}
                      >
                        <Text style={styles.reviewBtnText}>Review{"\n"}&amp; Sign</Text>
                        <Ionicons name="chevron-forward" size={14} color="#1E3A8A" />
                      </Pressable>
                    </View>
                  ))}

                  <Text style={styles.indexNote}>
                    Your signature, device information, and a tamper-evident hash of each document are recorded in a secure audit log for legal compliance.
                  </Text>
                </>
              )}

              {/* ── SIGNING PHASE ────────────────────────────────────────────── */}
              {gatePhase === "signing" && currentDoc && (
                <>
                  {/* Document Contents */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="document-text-outline" size={16} color="#1E3A8A" />
                      <Text style={styles.sectionTitle}>Document Contents</Text>
                      {!hasScrolled && (
                        <View style={styles.scrollHint}>
                          <Ionicons name="arrow-down" size={12} color="#FBBF24" />
                          <Text style={styles.scrollHintText}>Scroll to read</Text>
                        </View>
                      )}
                      {hasScrolled && (
                        <View style={[styles.scrollHint, { backgroundColor: "#D1FAE5" }]}>
                          <Ionicons name="checkmark-circle" size={12} color="#059669" />
                          <Text style={[styles.scrollHintText, { color: "#059669" }]}>Read</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.contentBox}>
                      <Text style={styles.contentText}>
                        {currentDoc.content?.trim() || "No document content provided. Please contact your administrator."}
                      </Text>
                    </View>
                  </View>

                  {/* Options */}
                  {currentDoc.has_options && (
                    <View style={styles.section}>
                      <View style={styles.sectionHeader}>
                        <Ionicons name="list-outline" size={16} color="#7C3AED" />
                        <Text style={[styles.sectionTitle, { color: "#7C3AED" }]}>Select Your Option</Text>
                        <Text style={styles.requiredTag}>Required</Text>
                      </View>
                      {OPTION_KEYS.map(key => {
                        const selected = selectedOption === key;
                        return (
                          <Pressable
                            key={key}
                            style={({ pressed }) => [
                              styles.optionCard,
                              selected && styles.optionCardSelected,
                              pressed && !selected && { backgroundColor: "#F5F3FF" },
                            ]}
                            onPress={() => setSelectedOption(key)}
                          >
                            <View style={[styles.optionRadio, selected && styles.optionRadioSelected]}>
                              {selected && <View style={styles.optionRadioDot} />}
                            </View>
                            <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                              {optionLabel(key, currentDoc)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {/* Affirmation Checkbox */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="checkbox-outline" size={16} color="#1E3A8A" />
                      <Text style={styles.sectionTitle}>Affirmation</Text>
                      <Text style={styles.requiredTag}>Required</Text>
                    </View>
                    <Pressable
                      style={[styles.checkboxRow, checkboxTicked && styles.checkboxRowTicked]}
                      onPress={() => setCheckboxTicked(v => !v)}
                    >
                      <View style={[styles.checkbox, checkboxTicked && styles.checkboxChecked]}>
                        {checkboxTicked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                      </View>
                      <Text style={[styles.checkboxLabel, checkboxTicked && { color: "#1E3A8A" }]}>
                        I confirm that I am the legal guardian of all enrolled members, and I have explicitly read, understood, and accept this document in full.
                      </Text>
                    </Pressable>
                  </View>

                  {/* Signature Pad */}
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons name="create-outline" size={16} color="#D97706" />
                      <Text style={[styles.sectionTitle, { color: "#D97706" }]}>Your Signature</Text>
                      {signatureSvg !== null ? (
                        <View style={[styles.scrollHint, { backgroundColor: "#D1FAE5" }]}>
                          <Ionicons name="checkmark-circle" size={12} color="#059669" />
                          <Text style={[styles.scrollHintText, { color: "#059669" }]}>Confirmed</Text>
                        </View>
                      ) : (
                        <Text style={styles.requiredTag}>Required</Text>
                      )}
                    </View>
                    <Text style={styles.padInstruction}>
                      Draw your signature below, then tap <Text style={{ fontWeight: "700" }}>✓ Confirm Signature</Text> to lock it in.
                    </Text>
                    <View style={[styles.padWrapper, signatureSvg !== null && styles.padWrapperConfirmed]}>
                      <SignaturePad
                        key={padKey}
                        onHasSignatureChange={(has) => {
                          setPadHasContent(has);
                          if (!has) setSignatureSvg(null);
                        }}
                        onSave={(svg) => setSignatureSvg(svg)}
                        strokeColor="#1E3A8A"
                      />
                    </View>
                  </View>

                  {/* Confirm & Sign button */}
                  <View style={styles.submitSection}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.submitBtn,
                        !canSign && styles.submitBtnDisabled,
                        pressed && canSign && { opacity: 0.85 },
                      ]}
                      onPress={handleConfirmSign}
                      disabled={!canSign}
                    >
                      {isSaving ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={20} color={canSign ? "#FFF" : "#9CA3AF"} />
                          <Text style={[styles.submitBtnText, !canSign && styles.submitBtnTextDisabled]}>
                            Confirm &amp; Sign
                          </Text>
                        </>
                      )}
                    </Pressable>

                    {!canSign && remainingHints.length > 0 && (
                      <View style={styles.hintBox}>
                        <Text style={styles.hintBoxTitle}>Still required:</Text>
                        {remainingHints.map((h, i) => (
                          <Text key={i} style={styles.hintItem}>• {h}</Text>
                        ))}
                      </View>
                    )}

                    <Text style={styles.legalNote}>
                      By signing, you create a tamper-evident record including a SHA-256 hash of this document, your IP address, and device information.
                    </Text>
                  </View>

                  <View style={{ height: insets.bottom + 24 }} />
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Tab shell ───────────────────────────────────────────────────────────────
  // (no styles needed — all inline)

  // ── Gate ─────────────────────────────────────────────────────────────────────
  gateRoot: {
    flex: 1, backgroundColor: "#1E3A8A",
  },
  gateHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  headerBack: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headerMeta:  { fontSize: 11, color: "#FBBF24", fontWeight: "600", letterSpacing: 0.5 },
  headerTitle: { fontSize: 17, color: "#FFF", fontWeight: "800", marginTop: 2 },
  progressChip: {
    backgroundColor: "#FBBF24", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  progressChipText: { fontSize: 13, fontWeight: "800", color: "#1E3A8A" },

  gateBody: {
    flex: 1, backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: "hidden",
  },
  gateScroll: { padding: 20, paddingTop: 24 },

  progressRow:  { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  progressBar:  { flex: 1, height: 8, backgroundColor: "#E2E8F0", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: "#1E3A8A", borderRadius: 4 },
  progressLabel:{ fontSize: 12, fontWeight: "600", color: "#64748B" },

  // ── Index phase ──────────────────────────────────────────────────────────────
  indexIntro:    { alignItems: "center", gap: 8, marginBottom: 20, paddingHorizontal: 8 },
  indexTitle:    { fontSize: 18, fontWeight: "800", color: "#1E3A8A", textAlign: "center" },
  indexSubtitle: { fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 19 },

  docCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#FFF", borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1.5, borderColor: "#E2E8F0",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  docIconWrap:   { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  docCardTitle:  { fontSize: 14, fontWeight: "700", color: "#1E3A8A", marginBottom: 3 },
  docCardDesc:   { fontSize: 12, color: "#64748B", lineHeight: 17 },
  docCardMeta:   { flexDirection: "row", gap: 6, marginTop: 5, flexWrap: "wrap" },
  optionsBadge:  { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F3E8FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  optionsBadgeText: { fontSize: 10, fontWeight: "600", color: "#7C3AED" },
  urgentBadge:   { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  urgentBadgeText:  { fontSize: 10, fontWeight: "600", color: "#EF4444" },

  reviewBtn: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "#DBEAFE", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
    borderWidth: 1.5, borderColor: "#93C5FD",
  },
  reviewBtnText: { fontSize: 11, fontWeight: "800", color: "#1E3A8A", textAlign: "center" },

  indexNote: {
    fontSize: 11, color: "#94A3B8", textAlign: "center",
    lineHeight: 16, marginTop: 12, paddingHorizontal: 8,
  },

  // ── Signing phase ────────────────────────────────────────────────────────────
  section: {
    backgroundColor: "#FFF", borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#1E3A8A", flex: 1 },
  requiredTag:  {
    fontSize: 10, fontWeight: "700", color: "#7C3AED",
    backgroundColor: "#F3E8FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  scrollHint: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  scrollHintText: { fontSize: 10, fontWeight: "700", color: "#D97706" },

  contentBox: {
    backgroundColor: "#F8FAFC", borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: "#E2E8F0",
  },
  contentText: { fontSize: 12.5, color: "#374151", lineHeight: 20, fontFamily: "monospace" },

  optionCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  optionCardSelected: { borderColor: "#FBBF24", backgroundColor: "#FFFBEB" },
  optionRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: "#CBD5E1",
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  optionRadioSelected: { borderColor: "#FBBF24" },
  optionRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#FBBF24" },
  optionLabel: { flex: 1, fontSize: 13, color: "#374151", lineHeight: 19 },
  optionLabelSelected: { fontWeight: "700", color: "#92400E" },

  checkboxRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: "#E2E8F0",
  },
  checkboxRowTicked: { borderColor: "#1E3A8A", backgroundColor: "#EFF6FF" },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center",
    backgroundColor: "#FFF", marginTop: 1,
  },
  checkboxChecked: { backgroundColor: "#1E3A8A", borderColor: "#1E3A8A" },
  checkboxLabel: { flex: 1, fontSize: 13, color: "#64748B", lineHeight: 19 },

  padInstruction: { fontSize: 12, color: "#64748B", marginBottom: 10, lineHeight: 17 },
  padWrapper: {
    borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 16, overflow: "hidden",
  },
  padWrapperConfirmed: { borderColor: "#FBBF24" },

  submitSection: { marginTop: 4, gap: 12 },
  submitBtn: {
    backgroundColor: "#1E3A8A", borderRadius: 16, height: 56,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  submitBtnDisabled: { backgroundColor: "#E2E8F0" },
  submitBtnText:     { fontSize: 16, fontWeight: "800", color: "#FFF" },
  submitBtnTextDisabled: { color: "#9CA3AF" },

  hintBox: {
    backgroundColor: "#FFF7ED", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#FED7AA",
  },
  hintBoxTitle: { fontSize: 12, fontWeight: "700", color: "#C2410C", marginBottom: 4 },
  hintItem:     { fontSize: 12, color: "#9A3412", lineHeight: 18 },

  legalNote: {
    fontSize: 10.5, color: "#94A3B8", textAlign: "center", lineHeight: 15,
  },
});
