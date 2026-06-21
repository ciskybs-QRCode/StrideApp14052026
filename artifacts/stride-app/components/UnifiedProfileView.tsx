/**
 * UnifiedProfileView — Single shared profile screen for all roles.
 *
 * Layout is 100% identical across admin / operator / parent.
 * Role-specific panels are gated on `currentRole`.
 *
 * Shared:      Avatar + identity card, Member QR code, AccountSettingsCard, RoleSwitcherRow
 * Admin only:  School Setup quick-link, Promo Codes, Configuration rows
 * Operator:    Schedule quick-links (Availability, Calendar, Courses)
 * Parent:      Dependent members list + Documents summary
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountSettingsCard } from "@/components/AccountSettingsCard";
import { RoleSwitcherRow } from "@/components/RoleSwitcher";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProfileRole = "admin" | "operator" | "parent";

interface Props {
  currentRole: ProfileRole;
}

// ── Admin configuration rows ──────────────────────────────────────────────────

const ADMIN_CONFIG_ROWS = [
  {
    key:   "school-information",
    title: "Organisation Info",
    desc:  "Contact details and campus data",
    icon:  "business-outline"          as const,
    color: "#0D9488",
    bg:    "#CCFBF1",
  },
  {
    key:   "app-configuration",
    title: "App Configuration",
    desc:  "Notifications, invoicing and alerts",
    icon:  "settings-outline"          as const,
    color: "#1E3A8A",
    bg:    "#DBEAFE",
  },
  {
    key:   "fee-settings",
    title: "Membership Fees",
    desc:  "Billing cycle and pro-rata policy",
    icon:  "cash-outline"              as const,
    color: "#D97706",
    bg:    "#FEF3C7",
  },
  {
    key:   "legal-privacy",
    title: "Legal & Privacy",
    desc:  "Terms, policies and signatures",
    icon:  "shield-checkmark-outline"  as const,
    color: "#7C3AED",
    bg:    "#EDE9FE",
  },
] as const;

// ── Operator schedule rows ────────────────────────────────────────────────────

const OPERATOR_SCHEDULE_ROWS = [
  {
    key:   "avail",
    title: "General Availability",
    desc:  "Set discipline-level time slots",
    icon:  "time-outline"              as const,
    color: "#0369A1",
    bg:    "#DBEAFE",
    route: "/(operator)/private-lessons",
  },
  {
    key:   "calendar",
    title: "Calendar",
    desc:  "View upcoming lessons and events",
    icon:  "calendar-outline"          as const,
    color: "#0D9488",
    bg:    "#CCFBF1",
    route: "/(operator)/calendar",
  },
  {
    key:   "courses",
    title: "Regular Courses",
    desc:  "Manage recurring course schedule",
    icon:  "layers-outline"            as const,
    color: "#7C3AED",
    bg:    "#EDE9FE",
    route: "/(operator)/courses",
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function UnifiedProfileView({ currentRole }: Props) {
  const router  = useRouter();
  const { user, allRoles, refreshAllRoles } = useAuth();
  const { children, documents, legalAdminDocs, signedAdminDocIds } = useAppData();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();

  const [provisioningOp, setProvisioningOp] = useState(false);
  const [provisioningPa, setProvisioningPa] = useState(false);

  // ── My Safety (adult member) ──────────────────────────────────────────────
  const [noshowEnabled,       setNoshowEnabled]       = useState(true);
  const [kinName,             setKinName]             = useState("");
  const [kinPhone,            setKinPhone]            = useState("");
  const [kinEmail,            setKinEmail]            = useState("");
  const [kinSaving,           setKinSaving]           = useState(false);
  const [showNoshowModal,     setShowNoshowModal]     = useState(false);
  const [noshowModalChecked,  setNoshowModalChecked]  = useState(false);
  const [noshowModalSaving,   setNoshowModalSaving]   = useState(false);

  // Load next-of-kin and noshow preference from user profile
  useEffect(() => {
    if (currentRole !== "parent") return;
    const u = user as unknown as Record<string, unknown> | null;
    if (!u) return;
    setNoshowEnabled((u["noshow_alerts_enabled"] as boolean | undefined) ?? true);
    setKinName((u["next_of_kin_name"] as string | undefined) ?? "");
    setKinPhone((u["next_of_kin_phone"] as string | undefined) ?? "");
    setKinEmail((u["next_of_kin_email"] as string | undefined) ?? "");
  }, [user, currentRole]);

  const handleNoshowToggle = (value: boolean) => {
    if (!value) {
      setNoshowModalChecked(false);
      setShowNoshowModal(true);
      return;
    }
    // Re-enable directly
    void api.setNoshowPreference(true)
      .then(() => setNoshowEnabled(true))
      .catch(() => Alert.alert("Error", "Could not update preference. Please try again."));
  };

  const handleNoshowModalConfirm = async () => {
    if (!noshowModalChecked) return;
    setNoshowModalSaving(true);
    try {
      await api.setNoshowPreference(false);
      setNoshowEnabled(false);
      setShowNoshowModal(false);
    } catch {
      Alert.alert("Error", "Could not update preference. Please try again.");
    } finally {
      setNoshowModalSaving(false);
    }
  };

  const handleSaveKin = async () => {
    setKinSaving(true);
    try {
      await api.updateNextOfKin({ name: kinName || undefined, phone: kinPhone || undefined, email: kinEmail || undefined });
      Alert.alert("Saved", "Next of kin details updated.");
    } catch {
      Alert.alert("Error", "Could not save next of kin. Please try again.");
    } finally {
      setKinSaving(false);
    }
  };

  const hasRole = (role: string) =>
    allRoles.some(r => r.role === role) || (user?.roles ?? []).includes(role as never);

  const activateOperator = async () => {
    setProvisioningOp(true);
    try {
      await api.activateOperator();
      await refreshAllRoles();
      Alert.alert(
        "Profile Activated",
        "Your Operator/Teacher profile has been activated. You can now switch to that role using the role switcher.",
      );
    } catch (err: unknown) {
      console.error("activateOperator failed:", err);
      Alert.alert(
        "Activation Failed",
        err instanceof Error ? err.message : "Unable to activate the Operator profile. Please try again.",
      );
    } finally {
      setProvisioningOp(false);
    }
  };

  const activateParent = async () => {
    setProvisioningPa(true);
    try {
      await api.activateParent();
      await refreshAllRoles();
      Alert.alert(
        "Profile Activated",
        "Your Parent/Member profile has been activated. You can now switch to that role using the role switcher.",
      );
    } catch (err: unknown) {
      console.error("activateParent failed:", err);
      Alert.alert(
        "Activation Failed",
        err instanceof Error ? err.message : "Unable to activate the Member profile. Please try again.",
      );
    } finally {
      setProvisioningPa(false);
    }
  };

  const initials = (user?.name ?? "?")
    .split(" ")
    .map(w => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const signedCount  = documents.filter(d => d.signed).length;
  const pendingDocs  = legalAdminDocs.filter(d => !signedAdminDocIds.includes(d.id));
  const qrValue      = user ? `MBR-${user.id}` : "MBR-0";

  const backRoute =
    currentRole === "parent"   ? "/(parent)/account"   :
    currentRole === "operator" ? "/(operator)/account" :
                                 "/(admin)/account";

  const nav = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as never);
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Profile"
        onBack={() => router.navigate(backRoute as never)}
      />
      <ScrollView
        contentContainerStyle={[
          s.scroll,
          {
            paddingTop:    20,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HERO IDENTITY CARD ── */}
        <View style={[s.heroCard, { backgroundColor: colors.primary }]}>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View style={s.heroInfo}>
            <Text style={s.heroName} numberOfLines={1}>{user?.name ?? "—"}</Text>
            {!!user?.schoolName && (
              <Text style={s.heroSchool} numberOfLines={1}>{user.schoolName}</Text>
            )}
            {!!user?.email && (
              <Text style={s.heroMeta} numberOfLines={1}>{user.email}</Text>
            )}
            {!!user?.phone && (
              <Text style={s.heroMeta} numberOfLines={1}>{user.phone}</Text>
            )}
          </View>
        </View>

        {/* ── MEMBER ID + QR CODE ── */}
        <View style={[s.qrCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.qrLeft}>
            <Text style={[s.qrLabel, { color: colors.mutedForeground }]}>MEMBER ID</Text>
            <Text style={[s.qrId, { color: colors.primary }]}>{qrValue}</Text>
            <Text style={[s.qrSub, { color: colors.mutedForeground }]}>
              Present for access verification
            </Text>
          </View>
          <View style={[s.qrBox, { borderColor: colors.border }]}>
            <QRCode
              value={qrValue}
              size={78}
              color={colors.primary}
              backgroundColor={colors.card}
            />
          </View>
        </View>

        {/* ── ROLE SWITCHER — top of profile, shown only when user has multiple roles ── */}
        <RoleSwitcherRow />

        {/* ── ACCOUNT (shared across all roles) ── */}
        <AccountSettingsCard />

        {/* ════════════════════════════════════════════════════════════════
            ADMIN-ONLY SECTION
        ════════════════════════════════════════════════════════════════ */}
        {currentRole === "admin" && (
          <>
            <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>ADMINISTRATION</Text>

            {/* School Setup */}
            <Pressable
              style={({ pressed }) => [s.featCard, s.featNavy, { opacity: pressed ? 0.88 : 1 }]}
              onPress={() => nav("/(admin)/setup")}
            >
              <View style={s.featIconNavy}>
                <Ionicons name="qr-code-outline" size={22} color="#FBBF24" />
              </View>
              <View style={s.featText}>
                <Text style={s.featTitleNavy} numberOfLines={1}>Setup & Member QR</Text>
                <Text style={s.featDescNavy}  numberOfLines={1}>Branding, colours and invite code</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
            </Pressable>

            {/* Promo Codes */}
            <Pressable
              style={({ pressed }) => [s.featCard, s.featAmber, { opacity: pressed ? 0.88 : 1 }]}
              onPress={() => nav("/(admin)/settings/promo-codes")}
            >
              <View style={s.featIconAmber}>
                <Ionicons name="pricetag-outline" size={22} color="#92400E" />
              </View>
              <View style={s.featText}>
                <Text style={s.featTitleAmber} numberOfLines={1}>Promo Codes</Text>
                <Text style={s.featDescAmber}  numberOfLines={1}>Generate, target and manage discounts</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#92400E" />
            </Pressable>

            <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>CONFIGURATION</Text>

            <View style={[s.rowGroup, { backgroundColor: colors.card }]}>
              {ADMIN_CONFIG_ROWS.map((item, i) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    s.groupRow,
                    i < ADMIN_CONFIG_ROWS.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={() => nav(`/(admin)/settings/${item.key}`)}
                >
                  <View style={[s.rowIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={s.rowText}>
                    <Text style={[s.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[s.rowDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.desc}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={item.color} />
                </Pressable>
              ))}
            </View>

            {/* ── PROFESSIONAL PROFILE — self-provisioning ── */}
            <Text style={[s.groupLabel, { color: colors.mutedForeground, marginTop: 10 }]}>
              PROFESSIONAL PROFILE
            </Text>
            <View style={[s.infoBox, { backgroundColor: `${colors.primary}08`, borderColor: `${colors.primary}20`, borderWidth: 1, marginBottom: 10 }]}>
              <Ionicons name="information-circle-outline" size={14} color={colors.primary} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                As an Admin, you can provision additional roles on your own account — to teach classes or enroll dependents — without creating a separate account.
              </Text>
            </View>

            {/* Activate Operator / Teacher */}
            <Pressable
              style={({ pressed }) => [
                s.provisionCard,
                {
                  borderColor:     hasRole("operator") ? "#0369A1" : colors.border,
                  backgroundColor: hasRole("operator") ? "#DBEAFE" : colors.card,
                  opacity: pressed || provisioningOp ? 0.8 : 1,
                },
              ]}
              onPress={() => { void activateOperator(); }}
              disabled={provisioningOp || hasRole("operator")}
            >
              <View style={[s.provisionIcon, { backgroundColor: "#0369A120" }]}>
                {provisioningOp
                  ? <ActivityIndicator size="small" color="#0369A1" />
                  : <Ionicons name="school" size={22} color="#0369A1" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.provisionTitle, { color: hasRole("operator") ? "#0369A1" : colors.foreground }]}>
                  {hasRole("operator") ? "Operator Profile Active" : "Activate Operator Profile"}
                </Text>
                <Text style={[s.provisionDesc, { color: colors.mutedForeground }]}>
                  {hasRole("operator")
                    ? "You can now switch to the Operator role"
                    : "Provisions an operator_profiles row for your account"}
                </Text>
              </View>
              {hasRole("operator")
                ? <Ionicons name="checkmark-circle" size={22} color="#0369A1" />
                : <Ionicons name="add-circle-outline" size={22} color="#0369A1" />}
            </Pressable>

            {/* Activate Parent / Member */}
            <Pressable
              style={({ pressed }) => [
                s.provisionCard,
                {
                  borderColor:     hasRole("parent") ? "#047857" : colors.border,
                  backgroundColor: hasRole("parent") ? "#D1FAE5" : colors.card,
                  opacity: pressed || provisioningPa ? 0.8 : 1,
                },
              ]}
              onPress={() => { void activateParent(); }}
              disabled={provisioningPa || hasRole("parent")}
            >
              <View style={[s.provisionIcon, { backgroundColor: "#04785720" }]}>
                {provisioningPa
                  ? <ActivityIndicator size="small" color="#047857" />
                  : <Ionicons name="person-add-outline" size={22} color="#047857" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.provisionTitle, { color: hasRole("parent") ? "#047857" : colors.foreground }]}>
                  {hasRole("parent") ? "Member Profile Active" : "Activate Member Profile"}
                </Text>
                <Text style={[s.provisionDesc, { color: colors.mutedForeground }]}>
                  {hasRole("parent")
                    ? "You can now switch to the Member role"
                    : "Provisions a member profile for your account"}
                </Text>
              </View>
              {hasRole("parent")
                ? <Ionicons name="checkmark-circle" size={22} color="#047857" />
                : <Ionicons name="add-circle-outline" size={22} color="#047857" />}
            </Pressable>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            OPERATOR-ONLY SECTION
        ════════════════════════════════════════════════════════════════ */}
        {currentRole === "operator" && (
          <>
            <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>MY SCHEDULE</Text>

            <View style={[s.rowGroup, { backgroundColor: colors.card }]}>
              {OPERATOR_SCHEDULE_ROWS.map((item, i) => (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    s.groupRow,
                    i < OPERATOR_SCHEDULE_ROWS.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={() => nav(item.route)}
                >
                  <View style={[s.rowIconBox, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                  </View>
                  <View style={s.rowText}>
                    <Text style={[s.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[s.rowDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.desc}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={item.color} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PARENT / MEMBER-ONLY SECTION
        ════════════════════════════════════════════════════════════════ */}
        {currentRole === "parent" && (
          <>
            {/* ── Dependent Members ── */}
            <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>DEPENDENT MEMBERS</Text>

            {children.length === 0 ? (
              <Pressable
                style={({ pressed }) => [
                  s.emptyCard,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => nav("/(parent)/children")}
              >
                <Ionicons name="people-outline" size={28} color={colors.mutedForeground} />
                <Text style={[s.emptyTitle, { color: colors.mutedForeground }]}>No dependents added yet</Text>
                <View style={[s.emptyBtn, { borderColor: colors.primary }]}>
                  <Text style={[s.emptyBtnText, { color: colors.primary }]}>Manage Dependents</Text>
                </View>
              </Pressable>
            ) : (
              <>
                <View style={[s.rowGroup, { backgroundColor: colors.card }]}>
                  {children.slice(0, 4).map((child, i) => {
                    const skillLabel =
                      child.skillLevel ??
                      (child.stars >= 50 ? "Advanced" : child.stars >= 20 ? "Intermediate" : "Beginner");
                    const consentColor =
                      child.mediaConsent === "full"
                        ? "#10B981"
                        : child.mediaConsent === "internal"
                        ? "#F59E0B"
                        : "#EF4444";
                    return (
                      <Pressable
                        key={child.id}
                        style={({ pressed }) => [
                          s.groupRow,
                          i < Math.min(children.length, 4) - 1 && {
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                          },
                          { opacity: pressed ? 0.75 : 1 },
                        ]}
                        onPress={() => nav("/(parent)/children")}
                      >
                        <View style={s.childAvatar}>
                          <Text style={s.childAvatarText}>
                            {child.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={s.rowText}>
                          <Text style={[s.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {child.name}
                          </Text>
                          <Text style={[s.rowDesc, { color: colors.mutedForeground }]} numberOfLines={1}>
                            Age {child.age} · {skillLabel}
                          </Text>
                        </View>
                        <View style={[s.consentDot, { backgroundColor: consentColor }]} />
                        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    );
                  })}
                </View>

                {children.length > 4 && (
                  <Pressable style={s.seeAllRow} onPress={() => nav("/(parent)/children")}>
                    <Text style={[s.seeAllText, { color: colors.primary }]}>
                      See all {children.length} dependents
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                  </Pressable>
                )}
              </>
            )}

            {/* ── My Safety & Next of Kin ── */}
            <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>MY SAFETY</Text>

            <View style={[s.rowGroup, { backgroundColor: colors.card, marginBottom: 24, padding: 16 }]}>
              {/* No-show alert toggle for this adult member */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>My No-Show Alerts</Text>
                    {!noshowEnabled && (
                      <View style={{ backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: "#EF4444" }}>OPT-OUT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2, lineHeight: 17 }}>
                    {noshowEnabled
                      ? "Staff are alerted if you don't check in for a class."
                      : "Disabled — you bear sole responsibility for attendance."}
                  </Text>
                </View>
                <Switch
                  value={noshowEnabled}
                  onValueChange={handleNoshowToggle}
                  trackColor={{ false: "#EF4444", true: colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              {/* Next of kin fields */}
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
                🆘  Next of Kin
              </Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12, lineHeight: 16 }}>
                Staff will contact this person in the event of an emergency or unexplained absence.
              </Text>
              <TextInput
                style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 14, color: colors.foreground, backgroundColor: colors.background }}
                placeholder="Full name"
                placeholderTextColor={colors.mutedForeground}
                value={kinName}
                onChangeText={setKinName}
                autoCapitalize="words"
              />
              <TextInput
                style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 8, fontSize: 14, color: colors.foreground, backgroundColor: colors.background }}
                placeholder="Phone number"
                placeholderTextColor={colors.mutedForeground}
                value={kinPhone}
                onChangeText={setKinPhone}
                keyboardType="phone-pad"
              />
              <TextInput
                style={{ borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 14, color: colors.foreground, backgroundColor: colors.background }}
                placeholder="Email (optional)"
                placeholderTextColor={colors.mutedForeground}
                value={kinEmail}
                onChangeText={setKinEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Pressable
                style={({ pressed }) => ({
                  backgroundColor: colors.primary,
                  borderRadius: 12, paddingVertical: 13, alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
                onPress={handleSaveKin}
                disabled={kinSaving}
              >
                {kinSaving
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 14 }}>Save Next of Kin</Text>
                }
              </Pressable>
            </View>

            {/* ── Documents ── */}
            <Text style={[s.groupLabel, { color: colors.mutedForeground }]}>MY DOCUMENTS</Text>

            <Pressable
              style={({ pressed }) => [
                s.docCard,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={() => nav("/(parent)/documents")}
            >
              {/* Stats row */}
              <View style={s.docStats}>
                <View style={s.docStatItem}>
                  <Text style={[s.docStatValue, { color: "#10B981" }]}>{signedCount}</Text>
                  <Text style={[s.docStatLabel, { color: colors.mutedForeground }]}>Signed</Text>
                </View>
                <View style={[s.docStatDivider, { backgroundColor: colors.border }]} />
                <View style={s.docStatItem}>
                  <Text style={[
                    s.docStatValue,
                    { color: pendingDocs.length > 0 ? "#EF4444" : colors.mutedForeground },
                  ]}>
                    {pendingDocs.length}
                  </Text>
                  <Text style={[s.docStatLabel, { color: colors.mutedForeground }]}>Pending</Text>
                </View>
                <View style={[s.docStatDivider, { backgroundColor: colors.border }]} />
                <View style={s.docStatItem}>
                  <Text style={[s.docStatValue, { color: colors.foreground }]}>{documents.length}</Text>
                  <Text style={[s.docStatLabel, { color: colors.mutedForeground }]}>Total</Text>
                </View>
              </View>

              {/* Warning banner if docs need signing */}
              {pendingDocs.length > 0 && (
                <View style={s.docWarning}>
                  <Ionicons name="alert-circle" size={14} color="#EF4444" />
                  <Text style={s.docWarningText}>
                    {pendingDocs.length} document{pendingDocs.length > 1 ? "s" : ""} require your signature
                  </Text>
                </View>
              )}

              <View style={[s.docCardFooter, { borderTopColor: colors.border }]}>
                <Text style={[s.docCardAction, { color: colors.primary }]}>View all documents</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </View>
            </Pressable>
          </>
        )}

        {/* ── VERSION FOOTER ── */}
        <Text style={[s.version, { color: colors.mutedForeground }]}>
          v1.0.0{user?.schoolName ? ` · ${user.schoolName}` : ""}
        </Text>

      </ScrollView>

      {/* ── Adult No-Show Opt-Out Liability Modal ──────────────────────── */}
      <Modal
        visible={showNoshowModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!noshowModalSaving) setShowNoshowModal(false); }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 20, padding: 24,
            borderColor: "#FBBF24", borderWidth: 2, width: "100%", maxWidth: 420,
          }}>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Text style={{ fontSize: 28 }}>⚠️</Text>
              </View>
              <Text style={{ fontSize: 17, fontWeight: "800", color: "#DC2626", textAlign: "center" }}>
                Disable Your No-Show Alerts?
              </Text>
            </View>

            <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, marginBottom: 12 }}>
              When disabled, <Text style={{ fontWeight: "700" }}>no one will be automatically notified</Text> if you fail to arrive for a scheduled class. You can re-enable this at any time.
            </Text>

            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, borderLeftWidth: 4, borderLeftColor: "#EF4444", marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: "#991B1B", marginBottom: 4 }}>LIABILITY NOTICE</Text>
              <Text style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 17 }}>
                By opting out you assume full and sole responsibility for your own attendance monitoring. The association bears no liability for any consequences arising from missed alerts.
              </Text>
            </View>

            <Pressable
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 22, padding: 2 }}
              onPress={() => setNoshowModalChecked(prev => !prev)}
            >
              <View style={{
                width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                borderColor: noshowModalChecked ? "#EF4444" : "#D1D5DB",
                backgroundColor: noshowModalChecked ? "#EF4444" : "#FFF",
                alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
              }}>
                {noshowModalChecked && <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "900" }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, lineHeight: 18 }}>
                I understand and accept sole responsibility for my own attendance tracking.
              </Text>
            </Pressable>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.muted, alignItems: "center" }}
                onPress={() => setShowNoshowModal(false)}
                disabled={noshowModalSaving}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 12,
                  backgroundColor: noshowModalChecked ? "#EF4444" : "#D1D5DB",
                  alignItems: "center",
                }}
                onPress={handleNoshowModalConfirm}
                disabled={!noshowModalChecked || noshowModalSaving}
              >
                {noshowModalSaving
                  ? <ActivityIndicator color="#FFF" size="small" />
                  : <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFF" }}>Disable</Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll:    { paddingHorizontal: 20 },

  // Hero card
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText:  { color: "#FFF", fontSize: 22, fontWeight: "700" },
  heroInfo:    { flex: 1, minWidth: 0 },
  heroName:    { color: "#FFF",                fontSize: 18, fontWeight: "700", marginBottom: 2 },
  heroSchool:  { color: "#FBBF24",             fontSize: 13, fontWeight: "600" },
  heroMeta:    { color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 2 },

  // QR card
  qrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  qrLeft:  { flex: 1 },
  qrLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, marginBottom: 6 },
  qrId:    { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  qrSub:   { fontSize: 12, lineHeight: 16 },
  qrBox:   { borderRadius: 12, borderWidth: 1, padding: 8 },

  // Shared section label
  groupLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 4,
  },

  // Featured full-width cards (admin)
  featCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 18,
    padding: 18,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featNavy:       { backgroundColor: "#1E3A8A" },
  featIconNavy:   { width: 46, height: 46, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featTitleNavy:  { color: "#FFF",                   fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featDescNavy:   { color: "rgba(255,255,255,0.70)", fontSize: 12 },
  featAmber:      { backgroundColor: "#FFFBEB", borderWidth: 1.5, borderColor: "#FDE68A" },
  featIconAmber:  { width: 46, height: 46, borderRadius: 13, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  featTitleAmber: { color: "#78350F", fontSize: 15, fontWeight: "700", marginBottom: 2 },
  featDescAmber:  { color: "#92400E", fontSize: 12 },
  featText:       { flex: 1, minWidth: 0 },

  // Grouped rows card (shared for admin config + operator schedule)
  rowGroup: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  rowIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText:  { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  rowDesc:  { fontSize: 12 },

  // Dependents - empty state card
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    padding: 28,
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  emptyTitle:   { fontSize: 14, fontWeight: "600" },
  emptyBtn:     { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, marginTop: 4 },
  emptyBtnText: { fontSize: 13, fontWeight: "700" },

  // Dependents - child avatar circle
  childAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  childAvatarText: { color: "#1E3A8A", fontSize: 16, fontWeight: "700" },

  // Consent dot on child row
  consentDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },

  // "See all" link row
  seeAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    marginTop: -18,
    marginBottom: 24,
  },
  seeAllText: { fontSize: 13, fontWeight: "700" },

  // Documents summary card
  docCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  docStats: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  docStatItem:    { flex: 1, alignItems: "center" },
  docStatValue:   { fontSize: 22, fontWeight: "800", marginBottom: 2 },
  docStatLabel:   { fontSize: 11, fontWeight: "600" },
  docStatDivider: { width: 1, height: 36 },
  docWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FEF2F2",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  docWarningText: { fontSize: 12, fontWeight: "600", color: "#EF4444", flex: 1 },
  docCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 13,
    borderTopWidth: 1,
  },
  docCardAction: { fontSize: 13, fontWeight: "700" },

  // Version footer
  version: { fontSize: 12, textAlign: "center", marginTop: 4, marginBottom: 20 },

  // Self-provisioning cards (admin "PROFESSIONAL PROFILE" section)
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  provisionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 10,
  },
  provisionIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  provisionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  provisionDesc:  { fontSize: 12, lineHeight: 16 },
});
