import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { useColors } from "@/hooks/useColors";
import { ScreenHeader } from "@/components/ScreenHeader";
import { api, request, inviteAdmin, ApiChild, ApiOperatorProfile, ApiStudent, type ApiEmploymentConfig, type ApiContractResearch, type ApiAccountantParse } from "@/lib/api";
import { useTerminology } from "@/context/TerminologyContext";

// ── Full member profile (fetched on-demand for admin detail modal) ──────────

interface FullProfileData {
  phone?: string;
  address_street?: string;
  address_city?: string;
  address_zip?: string;
  address_state?: string;
  address_country?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type UserRole   = "parent" | "operator" | "admin" | "student";
type UserStatus = "active" | "pending" | "suspended";
type MediaConsent = "full" | "internal" | "none";

interface UserRecord {
  id:            string;
  name:          string;
  email:         string;
  phone:         string;
  role:          UserRole;
  /** All active roles for this user (multi-role support). Falls back to [role]. */
  roles?:        string[];
  status:        UserStatus;
  joinDate:      string;
  // student safety fields (populated from DB)
  goldStars?:    number;
  allergies?:    string;
  ambulanceCons?: boolean;
  mediaCons?:    MediaConsent;
  // student guardian info
  parentName?:   string;
  parentPhone?:  string;
  // legacy - parent name shown on student card
  childName?:    string;
  preferredName?: string;
}

const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  parent:   { bg: "#DBEAFE", text: "#1E3A8A" },
  operator: { bg: "#EFF6FF", text: "#1E3A8A" },
  admin:    { bg: "#FEF3C7", text: "#B45309" },
  student:  { bg: "#D1FAE5", text: "#059669" },
};

const STATUS_CONFIG: Record<UserStatus, { bg: string; dot: string; text: string; label: string }> = {
  active:    { bg: "#D1FAE5", dot: "#10B981", text: "#10B981", label: "Active" },
  pending:   { bg: "#FEF3C7", dot: "#F59E0B", text: "#F59E0B", label: "Pending" },
  suspended: { bg: "#FEE2E2", dot: "#EF4444", text: "#EF4444", label: "Suspended" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function roleLabel(role: UserRole, primary: string, secondary: string): string {
  if (role === "parent")   return primary;
  if (role === "student")  return secondary;
  if (role === "operator") return "Operator";
  return "Admin";
}

function normalizeMediaConsent(raw?: string | null): MediaConsent {
  if (raw === "full")     return "full";
  if (raw === "internal") return "internal";
  return "none";
}

function apiUserToRecord(u: { id: string | number; name: string; email: string; phone?: string; role?: string; roles?: string; blocked?: boolean; created_at?: string }): UserRecord {
  const role: UserRole   = (["parent", "operator", "admin", "student"].includes(u.role ?? "") ? u.role : "parent") as UserRole;
  const status: UserStatus = u.blocked ? "suspended" : "active";
  let joinDate = "";
  if (u.created_at) { try { joinDate = new Date(u.created_at).toLocaleDateString("en-AU"); } catch { joinDate = ""; } }
  let roles: string[] | undefined;
  if (u.roles) { try { roles = JSON.parse(u.roles); } catch { /* ignore */ } }
  if (!roles || roles.length === 0) roles = [role];
  return { id: String(u.id), name: u.name, email: u.email, phone: u.phone ?? "", role, roles, status, joinDate };
}

function apiStudentToRecord(s: ApiStudent, childById: Map<number, ApiChild>): UserRecord {
  const name       = s.name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "Unknown";
  const parentName = s.parent?.name  ?? "";
  const parentPhone = s.parent?.phone ?? "";
  const matched    = childById.get(s.id);
  return {
    id: `child-${s.id}`,
    name,
    email:        "",
    phone:        parentPhone,
    role:         "student",
    status:       "active",
    joinDate:     "",
    childName:    parentName,
    goldStars:    s.gold_stars ?? 0,
    allergies:    s.allergies  ?? "None",
    ambulanceCons: s.ambulance_consent ?? false,
    mediaCons:    normalizeMediaConsent(matched?.media_consent),
    parentName,
    parentPhone,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const colors  = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const insets  = useSafeAreaInsets();
  const router  = useRouter();
  const { primaryRoleName, secondaryRoleName } = useTerminology();

  const [users,         setUsers]         = useState<UserRecord[]>([]);
  const [loadingUsers,  setLoadingUsers]  = useState(true);
  const [loadError,     setLoadError]     = useState(false);
  const [search,        setSearch]        = useState("");
  const [filter,        setFilter]        = useState<"all" | "parent" | "operator" | "admin" | "student">("all");
  const [selected,      setSelected]      = useState<UserRecord | null>(null);
  const [showContact,   setShowContact]   = useState(false);
  const [showGuardian,  setShowGuardian]  = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "suspend" | "reactivate" | "approve" | "role_change";
    user: UserRecord;
    newRole?: UserRole;
    /** Full set of roles after the toggle (multi-role). */
    newRoles?: string[];
    /** Whether the toggle is enabling (true) or disabling (false) a role. */
    enabling?: boolean;
  } | null>(null);
  const [operatorProfile,    setOperatorProfile]    = useState<ApiOperatorProfile | null>(null);
  const [opProfileType,      setOpProfileType]      = useState<"paid" | "volunteer">("paid");
  const [opProfileTypeSaving,setOpProfileTypeSaving]= useState(false);
  const [fullProfile,        setFullProfile]        = useState<FullProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Employment / Wages-Contractor state ──────────────────────────────────────
  const [empConfig,          setEmpConfig]          = useState<ApiEmploymentConfig | null>(null);
  const [empSaving,          setEmpSaving]          = useState(false);
  const [empType,            setEmpType]            = useState<"wages" | "contractor">("contractor");
  const [empSubType,         setEmpSubType]         = useState<"on_call" | "part_time" | "full_time" | "casual">("full_time");
  const [contractorRate,     setContractorRate]     = useState("");
  const [contractorBilling,  setContractorBilling]  = useState("hourly");
  const [empCountry,         setEmpCountry]         = useState("");
  const [empCity,            setEmpCity]            = useState("");
  const [jurisdictionLoading,setJurisdictionLoading]= useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [researchResult,     setResearchResult]     = useState<ApiContractResearch | null>(null);
  const [researchLoading,    setResearchLoading]    = useState(false);
  const [showAccountantModal,setShowAccountantModal]= useState(false);
  const [showInviteModal,    setShowInviteModal]    = useState(false);
  const [inviteEmail,        setInviteEmail]        = useState("");
  const [inviteName,         setInviteName]         = useState("");
  const [inviting,           setInviting]           = useState(false);
  const [accountantEmail,    setAccountantEmail]    = useState("");
  const [accountantSubject,  setAccountantSubject]  = useState("");
  const [accountantBody,     setAccountantBody]     = useState("");
  const [accountantReplyText,setAccountantReplyText]= useState("");
  const [parsingReply,       setParsingReply]       = useState(false);
  const [parseResult,        setParseResult]        = useState<ApiAccountantParse | null>(null);

  // ── Data fetch ───────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingUsers(true);
    Promise.allSettled([
      api.getUsers(),
      api.getStudents(),
      api.getOperatorProfiles(),
      api.getChildren(),
    ]).then(([usersRes, studentsRes, profilesRes, childrenRes]) => {
      // Build operator ID set
      const operatorUserIds = new Set<string>(
        profilesRes.status === "fulfilled"
          ? profilesRes.value.map(p => String(p.user_id))
          : []
      );

      // Build child lookup by id for media_consent cross-reference
      const childById = new Map<number, ApiChild>(
        childrenRes.status === "fulfilled"
          ? (childrenRes.value as ApiChild[]).map(c => [c.id, c])
          : []
      );

      const userRecords = usersRes.status === "fulfilled"
        ? usersRes.value.map(u => {
            const record = apiUserToRecord(u);
            if (operatorUserIds.has(String(u.id)) && record.role !== "operator") {
              return { ...record, role: "operator" as UserRole };
            }
            return record;
          })
        : [];

      const studentRecords = studentsRes.status === "fulfilled"
        ? (studentsRes.value as ApiStudent[]).map(s => apiStudentToRecord(s, childById))
        : [];

      setUsers([...userRecords, ...studentRecords]);
    }).catch(() => setLoadError(true)).finally(() => setLoadingUsers(false));
  }, []);

  // Operator profile for detail modal
  useEffect(() => {
    if (selected?.role === "operator") {
      setOperatorProfile(null);
      api.getOperatorProfiles().then(profiles => {
        const profile = profiles.find(p => String(p.user_id) === selected.id);
        setOperatorProfile(profile ?? null);
        setOpProfileType(profile?.profile_type ?? "paid");
      }).catch(() => {});
    }
  }, [selected?.id, selected?.role]);

  // Load employment config when an operator profile is loaded
  useEffect(() => {
    if (!operatorProfile) { setEmpConfig(null); setResearchResult(null); setParseResult(null); return; }
    api.getEmploymentConfig(operatorProfile.id)
      .then(cfg => {
        setEmpConfig(cfg);
        setEmpType(cfg.employment_type ?? "contractor");
        setEmpSubType(cfg.employment_sub_type ?? "full_time");
        setContractorRate(cfg.contractor_rate_cents ? (cfg.contractor_rate_cents / 100).toFixed(2) : "");
        setContractorBilling(cfg.contractor_billing_unit ?? "hourly");
        setEmpCountry(cfg.primary_country ?? "");
        setEmpCity(cfg.primary_city ?? "");
        setResearchResult(null);
        setParseResult(null);
      })
      .catch(() => setEmpConfig(null));
  }, [operatorProfile?.id]);

  // Full profile (phone + address + emergency contacts) for non-student users
  useEffect(() => {
    if (!selected || selected.id.startsWith("child-")) {
      setFullProfile(null);
      return;
    }
    setFullProfile(null);
    setProfileLoading(true);
    request<FullProfileData>("GET", `/api/users/${selected.id}/profile`)
      .then(p => setFullProfile(p))
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [selected?.id]);

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || u.role === filter;
    return matchSearch && matchFilter;
  });

  const counts = {
    total:     users.length,
    admins:    users.filter(u => u.role === "admin").length,
    parents:   users.filter(u => u.role === "parent").length,
    operators: users.filter(u => u.role === "operator").length,
    students:  users.filter(u => u.role === "student").length,
    suspended: users.filter(u => u.status === "suspended").length,
  };

  // ── Contact helpers ────────────────────────────────────────────────────────

  const openContact = (phone: string, email: string, type: "whatsapp" | "sms" | "email" | "call") => {
    const cleaned = phone.replace(/\D/g, "");
    let url = "";
    switch (type) {
      case "whatsapp": url = `whatsapp://send?phone=${cleaned}`; break;
      case "sms":      url = `sms:${phone}`;                    break;
      case "email":    url = `mailto:${email}`;                 break;
      case "call":     url = `tel:${phone}`;                    break;
    }
    Linking.canOpenURL(url).then(ok => {
      if (ok) { Linking.openURL(url); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
      else Alert.alert("Not available", "This app is not installed on your device.");
    }).catch(() => Alert.alert("Error", "Could not open the app."));
  };

  const handleContactAction = (type: "whatsapp" | "sms" | "email" | "call") => {
    if (!selected) return;
    setShowContact(false);
    openContact(selected.phone, selected.email, type);
  };

  const handleGuardianAction = (type: "whatsapp" | "sms" | "email" | "call") => {
    if (!selected) return;
    setShowGuardian(false);
    openContact(selected.parentPhone ?? "", "", type);
  };

  // ── Status mutations ─────────────────────────────────────────────────────

  const updateUserStatus = (id: string, status: UserStatus) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status } : u));
    setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
  };

  const handleSuspend    = (user: UserRecord) => setConfirmAction({ type: "suspend",    user });
  const handleReactivate = (user: UserRecord) => setConfirmAction({ type: "reactivate", user });
  const handleApprove    = (user: UserRecord) => setConfirmAction({ type: "approve",    user });

  // ── Employment handlers ───────────────────────────────────────────────────────
  const handleOpProfileTypeChange = async (newType: "paid" | "volunteer") => {
    if (!operatorProfile || opProfileTypeSaving) return;
    setOpProfileType(newType);
    setOpProfileTypeSaving(true);
    try {
      await api.updateOperatorProfile(operatorProfile.id, { profileType: newType });
      setOperatorProfile(prev => prev ? { ...prev, profile_type: newType } : prev);
    } catch {
      setOpProfileType(operatorProfile.profile_type);
    } finally { setOpProfileTypeSaving(false); }
  };

  const handleSaveEmployment = async () => {
    if (!operatorProfile) return;
    setEmpSaving(true);
    try {
      const cfg = await api.updateEmploymentConfig(operatorProfile.id, {
        employment_type: empType,
        employment_sub_type: empType === "wages" ? empSubType : null,
        contractor_rate_cents: Math.round(parseFloat(contractorRate || "0") * 100),
        contractor_billing_unit: contractorBilling,
        primary_country: empCountry.trim() || undefined,
        primary_city: empCity.trim() || undefined,
      });
      setEmpConfig(cfg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Save failed", "Could not save employment settings."); }
    finally { setEmpSaving(false); }
  };

  const handleResearchContract = async () => {
    if (!empCountry.trim()) { Alert.alert("Enter the operator's primary residence country first."); return; }
    setResearchLoading(true);
    setResearchResult(null);
    try {
      const result = await api.aiResearchContract({
        country: empCountry,
        city: empCity || undefined,
        employment_sub_type: empSubType,
        org_name: selected?.name,
      });
      setResearchResult(result);
      const opName = selected?.name ?? "this operator";
      const subLabel = empSubType === "on_call" ? "On-Call" : empSubType === "part_time" ? "Part Time" : empSubType === "full_time" ? "Full Time" : "Casual";
      const subj = `Employment Contract Review Request — ${opName}`;
      const body = [
        `Dear [Accountant Name],`,
        ``,
        `We are engaging ${opName} at our association (${subLabel}, On Wages) in ${empCountry}${empCity ? `, ${empCity}` : ""} and would appreciate your professional review.`,
        ``,
        `AI Research Summary:`,
        result.summary,
        ``,
        `Required documents flagged: ${(result.required_ids ?? []).map(r => r.label).join(", ") || "see attachment"}`,
        `Leave entitlements identified: ${(result.leave_entitlements ?? []).map(l => l.days_per_year ? `${l.label} (${l.days_per_year} days/yr)` : l.label).join(", ") || "see attachment"}`,
        `Tax obligations: ${(result.tax_obligations ?? []).map(t => `${t.label} ${t.rate}%`).join(", ") || "see attachment"}`,
        ``,
        `We kindly ask you to review:`,
        `1. Whether this engagement is legally compliant in our jurisdiction.`,
        `2. Which deductions to include or exclude and at what rates.`,
        `3. Leave entitlements, overtime clauses, and public holiday rules.`,
        `4. Any other obligations (INPS, INAIL, TFR, Superannuation, GST, etc.).`,
        ``,
        `Please reply with your recommendations — we will paste your response directly into our payroll configuration assistant.`,
        ``,
        `Kind regards,`,
        `[Admin Name]`,
        `[Association Name]`,
      ].join("\n");
      setAccountantSubject(subj);
      setAccountantBody(body);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("AI Research failed", "Check internet connection and try again."); }
    finally { setResearchLoading(false); }
  };

  const handleParseAccountantReply = async () => {
    if (!accountantReplyText.trim()) { Alert.alert("Paste the accountant's email reply first."); return; }
    setParsingReply(true);
    setParseResult(null);
    try {
      const result = await api.aiParseAccountantReply({
        email_text: accountantReplyText,
        country: empCountry || undefined,
        employment_sub_type: empSubType,
      });
      setParseResult(result);
      if (result.deductions?.length > 0 && operatorProfile) {
        const chips = result.deductions.map(d => ({ label: d.label, rate: String(d.rate) }));
        await api.updateEmploymentConfig(operatorProfile.id, { contractor_extra_chips: chips });
        const cfg = await api.getEmploymentConfig(operatorProfile.id);
        setEmpConfig(cfg);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { Alert.alert("Parsing failed", "Check internet connection and try again."); }
    finally { setParsingReply(false); }
  };

  const handleAiJurisdiction = async () => {
    if (!empCountry.trim()) { Alert.alert("Enter the operator's primary residence country first."); return; }
    setJurisdictionLoading(true);
    try {
      const result = await api.aiJurisdictionSuggestion({ country: empCountry, city: empCity || undefined, employment_type: empType });
      const chips  = result.suggestions.map(s => ({ label: s.label, rate: String(s.rate) }));
      const body   = result.suggestions.map(s => `• ${s.label}: ${s.rate}%${s.note ? ` — ${s.note}` : ""}`).join("\n");
      Alert.alert(`AI Jurisdiction · ${empCountry}`, body + "\n\nApplied as info chips. Save to confirm.", [{ text: "OK" }]);
      if (operatorProfile) {
        await api.updateEmploymentConfig(operatorProfile.id, { contractor_extra_chips: chips });
        const cfg = await api.getEmploymentConfig(operatorProfile.id);
        setEmpConfig(cfg);
      }
    } catch { Alert.alert("AI lookup failed", "Check your internet connection and try again."); }
    finally { setJurisdictionLoading(false); }
  };

  const handleGenerateContract = async () => {
    if (!operatorProfile) return;
    setGeneratingContract(true);
    try {
      await api.generateEmploymentContract(operatorProfile.id);
      const cfg = await api.getEmploymentConfig(operatorProfile.id);
      setEmpConfig(cfg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Contract Generated", "The operator will see the contract in their Invoicing → Contract screen and must sign it digitally.");
    } catch { Alert.alert("Generate failed", "Save employment settings first, then generate the contract."); }
    finally { setGeneratingContract(false); }
  };

  const executeConfirmAction = () => {
    if (!confirmAction) return;
    const { type, user, newRole, newRoles } = confirmAction;
    setConfirmAction(null);
    switch (type) {
      case "suspend":
        updateUserStatus(user.id, "suspended");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "reactivate":
      case "approve":
        updateUserStatus(user.id, "active");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "role_change":
        if (newRoles && newRoles.length > 0) {
          const PRIORITY = ["admin", "operator", "parent"] as UserRole[];
          const primaryRole = PRIORITY.find(r => newRoles.includes(r)) ?? "parent" as UserRole;
          // Optimistic update
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: primaryRole, roles: newRoles } : u));
          setSelected(prev => prev?.id === user.id ? { ...prev, role: primaryRole, roles: newRoles } : prev);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Persist to backend (sends email + bell notification automatically)
          api.setUserRoles(user.id, newRoles).catch(() => {
            Alert.alert("Sync Error", "Role updated locally but failed to sync. Please refresh.");
          });
        } else if (newRole) {
          // Legacy fallback
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole, roles: [newRole] } : u));
          setSelected(prev => prev?.id === user.id ? { ...prev, role: newRole, roles: [newRole] } : prev);
          api.setUserRoles(user.id, [newRole]).catch(() => {});
        }
        break;
    }
  };

  const handleRoleToggle = (user: UserRecord, role: UserRole, enabled: boolean) => {
    const currentRoles: string[] = user.roles ?? [user.role];
    const newRoles = enabled
      ? [...new Set([...currentRoles, role as string])]
      : currentRoles.filter(r => r !== role);
    if (newRoles.length === 0) {
      Alert.alert("Cannot remove", "A user must have at least one active role.");
      return;
    }
    setConfirmAction({ type: "role_change", user, newRole: role, newRoles, enabling: enabled });
  };

  // ── Grouped list ─────────────────────────────────────────────────────────

  const grouped: Record<string, UserRecord[]> = {
    Admins:                        filtered.filter(u => u.role === "admin"),
    Operators:                     filtered.filter(u => u.role === "operator"),
    [`${primaryRoleName}s`]:       filtered.filter(u => u.role === "parent"),
    [`${secondaryRoleName}s`]:     filtered.filter(u => u.role === "student"),
  };
  const showGrouped = filter === "all";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Members"
        subtitle="User management"
        onBack={() => router.push("/(admin)/members-hub")}
        right={
          <Pressable
            style={[styles.badgePdfBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(admin)/pdf-badges" as Parameters<typeof router.push>[0])}
          >
            <Ionicons name="print-outline" size={20} color={colors.secondary} />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Invite Admin shortcut ── */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: "#FEF9EC", borderColor: "#FDE68A", marginBottom: 8 }]}
          onPress={() => { setInviteEmail(""); setInviteName(""); setShowInviteModal(true); }}
        >
          <Ionicons name="person-add-outline" size={20} color="#B45309" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "#B45309" }}>Invite Admin</Text>
            <Text style={{ fontSize: 12, color: "#92400E", marginTop: 1 }}>Add another administrator to co-manage this association</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#B45309" />
        </Pressable>

        {/* ── Import Members shortcut ── */}
        <Pressable
          style={[styles.importBanner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}
          onPress={() => router.push("/(admin)/import-members" as never)}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: "${colors.primary}" }}>Bulk Import Members</Text>
            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 1 }}>Upload CSV or XLSX to add members in bulk</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </Pressable>

        {/* ── Load error banner ── */}
        {loadError && (
          <View style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#FCA5A5" }}>
            <Text style={{ fontSize: 13, color: "#991B1B", fontWeight: "600" }}>Failed to load members</Text>
            <Pressable
              onPress={() => {
                setLoadError(false);
                setLoadingUsers(true);
                Promise.allSettled([api.getUsers(), api.getStudents(), api.getOperatorProfiles(), api.getChildren()])
                  .then(() => {})
                  .catch(() => setLoadError(true))
                  .finally(() => setLoadingUsers(false));
              }}
              style={{ backgroundColor: "#991B1B", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
            >
              <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Stats strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          {[
            { label: "Total",                          value: counts.total,     bg: colors.primary },
            ...(counts.admins > 0 ? [{ label: "Admins", value: counts.admins, bg: "#B45309" }] : []),
            { label: "Operators",                      value: counts.operators, bg: colors.primary },
            { label: `${primaryRoleName}s`,            value: counts.parents,   bg: "#10B981" },
            { label: `${secondaryRoleName}s`,          value: counts.students,  bg: "#F59E0B" },
            ...(counts.suspended > 0 ? [{ label: "Suspended", value: counts.suspended, bg: "#EF4444" }] : []),
          ].map(s => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
              <Text style={styles.statNum}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or email..."
            placeholderTextColor={colors.mutedForeground}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={[styles.filterBar, { backgroundColor: colors.muted }]}>
            {(["all", "admin", "operator", "parent", "student"] as const).map(f => (
              <Pressable key={f} style={[styles.filterBtn, filter === f && { backgroundColor: colors.primary }]} onPress={() => setFilter(f)}>
                <Text style={[styles.filterText, filter === f && { color: "#FFF" }]}>
                  {f === "all" ? "All" : f === "admin" ? "Admins" : f === "operator" ? "Operators" : f === "parent" ? `${primaryRoleName}s` : `${secondaryRoleName}s`}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* User list */}
        {showGrouped
          ? Object.entries(grouped).map(([groupName, groupUsers]) =>
              groupUsers.length > 0 ? (
                <View key={groupName}>
                  <View style={styles.groupHeader}>
                    <View style={[styles.groupDot, { backgroundColor: groupName === "Admins" ? "#B45309" : groupName === "Operators" ? colors.primary : groupName === `${primaryRoleName}s` ? "#10B981" : "#F59E0B" }]} />
                    <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>{groupName} ({groupUsers.length})</Text>
                  </View>
                  {groupUsers.map(user => (
                    <UserCard
                      key={user.id}
                      user={user}
                      colors={colors}
                      primaryRoleName={primaryRoleName}
                      secondaryRoleName={secondaryRoleName}
                      onPress={() => { setSelected(user); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    />
                  ))}
                </View>
              ) : null
            )
          : filtered.map(user => (
              <UserCard
                key={user.id}
                user={user}
                colors={colors}
                primaryRoleName={primaryRoleName}
                secondaryRoleName={secondaryRoleName}
                onPress={() => { setSelected(user); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              />
            ))
        }
      </ScrollView>

      {/* ══════════════════════════════════════════════════
          USER DETAIL MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            {selected && (() => {
              const user = selected;
              const sc   = STATUS_CONFIG[user.status];
              const rc   = ROLE_COLORS[user.role];
              const hasAllergy = user.allergies && user.allergies !== "None" && user.allergies !== "";
              return (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: "center", paddingBottom: 24 }}>
                  {/* Suspended banner */}
                  {user.status === "suspended" && (
                    <View style={styles.suspendedBanner}>
                      <Ionicons name="ban" size={14} color="#FFF" />
                      <Text style={styles.suspendedBannerText}>Access Suspended — user cannot log in</Text>
                    </View>
                  )}

                  <View style={[styles.modalAvatar, { backgroundColor: rc.bg }]}>
                    <Text style={[styles.modalAvatarText, { color: rc.text }]}>{user.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.modalName, { color: colors.primary }]}>{user.name}</Text>
                  {!!user.email && <Text style={[styles.modalEmail, { color: colors.mutedForeground }]}>{user.email}</Text>}
                  {!!user.phone && <Text style={[styles.modalPhone, { color: colors.mutedForeground }]}>{user.phone}</Text>}

                  <View style={styles.modalBadgeRow}>
                    <View style={[styles.roleBadge, { backgroundColor: rc.bg }]}>
                      <Text style={[styles.roleText, { color: rc.text }]}>
                        {roleLabel(user.role, primaryRoleName, secondaryRoleName)}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
                      <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                    </View>
                  </View>

                  {!!user.joinDate && <Text style={[styles.joinDateText, { color: colors.mutedForeground }]}>Joined {user.joinDate}</Text>}

                  {/* ── PHONE ACTION ROW (non-student, has phone) ────────── */}
                  {user.role !== "student" && !!user.phone && (
                    <View style={styles.phoneActionRow}>
                      {[
                        { icon: "call"          as const, label: "Call",     color: "#10B981", bg: "#D1FAE5", action: "call"     as const },
                        { icon: "chatbubble"    as const, label: "SMS",      color: colors.primary, bg: "#EEF2FF", action: "sms"      as const },
                        { icon: "logo-whatsapp" as const, label: "WhatsApp", color: "#25D366", bg: "#DCFCE7", action: "whatsapp" as const },
                        { icon: "mail-outline"  as const, label: "Email",    color: colors.primary, bg: "#EFF6FF", action: "email"    as const },
                      ].map(opt => (
                        <Pressable
                          key={opt.action}
                          style={[styles.phoneActionBtn, { backgroundColor: opt.bg }]}
                          onPress={() => openContact(user.phone, user.email, opt.action)}
                        >
                          <Ionicons name={opt.icon} size={18} color={opt.color} />
                          <Text style={[styles.phoneActionLabel, { color: opt.color }]}>{opt.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {/* ── FULL PROFILE: address + emergency contact ──────────
                       Fetched on-demand via GET /users/:id/profile.
                       Only shown for non-student (child) records.          */}
                  {user.role !== "student" && (
                    profileLoading ? (
                      <View style={styles.profileLoadingRow}>
                        <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
                        <Text style={[styles.profileLoadingText, { color: colors.mutedForeground }]}>Loading profile…</Text>
                      </View>
                    ) : fullProfile ? (
                      <>
                        {/* Address */}
                        {(fullProfile.address_street || fullProfile.address_city) && (
                          <View style={[styles.profileSection, { borderColor: colors.border }]}>
                            <View style={styles.profileSectionHeader}>
                              <Ionicons name="location-outline" size={14} color={colors.primary} />
                              <Text style={[styles.profileSectionTitle, { color: colors.primary }]}>Indirizzo</Text>
                            </View>
                            {!!fullProfile.address_street && (
                              <Text style={[styles.profileSectionValue, { color: colors.foreground }]}>{fullProfile.address_street}</Text>
                            )}
                            {!!(fullProfile.address_zip || fullProfile.address_city) && (
                              <Text style={[styles.profileSectionValue, { color: colors.foreground }]}>
                                {[fullProfile.address_zip, fullProfile.address_city].filter(Boolean).join(" ")}
                              </Text>
                            )}
                            {!!(fullProfile.address_state || fullProfile.address_country) && (
                              <Text style={[styles.profileSectionMuted, { color: colors.mutedForeground }]}>
                                {[fullProfile.address_state, fullProfile.address_country].filter(Boolean).join(", ")}
                              </Text>
                            )}
                          </View>
                        )}

                        {/* Emergency contact */}
                        {!!fullProfile.emergency_contact_name && (
                          <View style={[styles.profileSection, { borderColor: colors.border }]}>
                            <View style={styles.profileSectionHeader}>
                              <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                              <Text style={[styles.profileSectionTitle, { color: "#DC2626" }]}>Contatto Emergenza</Text>
                            </View>
                            <Text style={[styles.profileSectionValue, { color: colors.foreground }]}>{fullProfile.emergency_contact_name}</Text>
                            {!!fullProfile.emergency_contact_relationship && (
                              <Text style={[styles.profileSectionMuted, { color: colors.mutedForeground }]}>{fullProfile.emergency_contact_relationship}</Text>
                            )}
                            {!!fullProfile.emergency_contact_phone && (
                              <Pressable
                                style={styles.emergencyPhoneBtn}
                                onPress={() => openContact(fullProfile.emergency_contact_phone!, "", "call")}
                              >
                                <Ionicons name="call" size={14} color="#FFF" />
                                <Text style={styles.emergencyPhoneBtnText}>{fullProfile.emergency_contact_phone}</Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      </>
                    ) : null
                  )}

                  {/* ── SAFETY & LEGAL SECTION ──────────────────────────── */}
                  {user.role === "student" && (
                    <View style={[styles.safetySection, { borderColor: colors.border }]}>
                      <View style={styles.safetySectionHeader}>
                        <Ionicons name="shield-checkmark-outline" size={15} color={colors.primary} />
                        <Text style={[styles.safetySectionTitle, { color: colors.primary }]}>Safety & Legal</Text>
                      </View>

                      {/* Allergy row */}
                      <View style={[styles.safetyRow, { borderBottomColor: colors.border }]}>
                        <View style={styles.safetyRowLeft}>
                          <View style={[styles.safetyIcon, { backgroundColor: hasAllergy ? "#FEF2F2" : "#F0FDF4" }]}>
                            <Ionicons name="warning" size={14} color={hasAllergy ? "#DC2626" : "#16A34A"} />
                          </View>
                          <Text style={[styles.safetyRowLabel, { color: colors.foreground }]}>Allergies</Text>
                        </View>
                        <View style={[styles.safetyRowValueWrap, { backgroundColor: hasAllergy ? "#FEF2F2" : "#F0FDF4" }]}>
                          <Text style={[styles.safetyRowValue, { color: hasAllergy ? "#DC2626" : "#16A34A" }]}>
                            {hasAllergy ? user.allergies : "None"}
                          </Text>
                        </View>
                      </View>

                      {/* Photo consent row */}
                      <View style={[styles.safetyRow, { borderBottomColor: colors.border }]}>
                        <View style={styles.safetyRowLeft}>
                          <View style={[styles.safetyIcon, { backgroundColor: user.mediaCons === "full" ? "#F0FDF4" : user.mediaCons === "internal" ? "#FFFBEB" : "#FEF2F2" }]}>
                            <Ionicons
                              name={user.mediaCons === "full" ? "camera" : user.mediaCons === "internal" ? "camera-outline" : "eye-off-outline"}
                              size={14}
                              color={user.mediaCons === "full" ? "#16A34A" : user.mediaCons === "internal" ? "#D97706" : "#DC2626"}
                            />
                          </View>
                          <Text style={[styles.safetyRowLabel, { color: colors.foreground }]}>Media Release</Text>
                        </View>
                        <View style={[styles.safetyRowValueWrap, { backgroundColor: user.mediaCons === "full" ? "#F0FDF4" : user.mediaCons === "internal" ? "#FFFBEB" : "#FEF2F2" }]}>
                          <Text style={[styles.safetyRowValue, { color: user.mediaCons === "full" ? "#16A34A" : user.mediaCons === "internal" ? "#D97706" : "#DC2626" }]}>
                            {user.mediaCons === "full" ? "Approved" : user.mediaCons === "internal" ? "Internal Only" : "Denied"}
                          </Text>
                        </View>
                      </View>

                      {/* Ambulance consent row */}
                      <View style={[styles.safetyRow, { borderBottomColor: colors.border }]}>
                        <View style={styles.safetyRowLeft}>
                          <View style={[styles.safetyIcon, { backgroundColor: user.ambulanceCons ? "#F0FDF4" : "#FEF2F2" }]}>
                            <Ionicons name="medkit" size={14} color={user.ambulanceCons ? "#16A34A" : "#DC2626"} />
                          </View>
                          <Text style={[styles.safetyRowLabel, { color: colors.foreground }]}>Ambulance Consent</Text>
                        </View>
                        <View style={[styles.safetyRowValueWrap, { backgroundColor: user.ambulanceCons ? "#F0FDF4" : "#FEF2F2" }]}>
                          <Text style={[styles.safetyRowValue, { color: user.ambulanceCons ? "#16A34A" : "#DC2626" }]}>
                            {user.ambulanceCons ? "Authorized" : "Call Guardian Only"}
                          </Text>
                        </View>
                      </View>

                      {/* Stars row */}
                      <View style={[styles.safetyRow, { borderBottomWidth: 0 }]}>
                        <View style={styles.safetyRowLeft}>
                          <View style={[styles.safetyIcon, { backgroundColor: "#FFFBEB" }]}>
                            <Ionicons name="star" size={14} color="#D97706" />
                          </View>
                          <Text style={[styles.safetyRowLabel, { color: colors.foreground }]}>Achievement Stars</Text>
                        </View>
                        <View style={styles.starsRow}>
                          {Array.from({ length: Math.min(user.goldStars ?? 0, 5) }).map((_, i) => (
                            <Ionicons key={i} name="star" size={14} color="#F59E0B" />
                          ))}
                          <Text style={[styles.starsCount, { color: colors.mutedForeground }]}>{user.goldStars ?? 0}</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* ── GUARDIAN CONTACT (students) ──────────────────────── */}
                  {user.role === "student" && !!user.parentName && (
                    <View style={[styles.guardianSection, { borderColor: colors.border }]}>
                      <View style={styles.safetySectionHeader}>
                        <Ionicons name="people-outline" size={15} color={colors.primary} />
                        <Text style={[styles.safetySectionTitle, { color: colors.primary }]}>Guardian</Text>
                      </View>
                      <View style={styles.guardianInfo}>
                        <View style={styles.guardianAvatar}>
                          <Text style={styles.guardianAvatarText}>{user.parentName.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.guardianName, { color: colors.foreground }]}>{user.parentName}</Text>
                          {!!user.parentPhone && (
                            <Text style={[styles.guardianPhone, { color: colors.mutedForeground }]}>{user.parentPhone}</Text>
                          )}
                        </View>
                      </View>
                      {!!user.parentPhone && (
                        <Pressable
                          style={[styles.guardianContactBtn, { backgroundColor: colors.primary }]}
                          onPress={() => setShowGuardian(true)}
                        >
                          <Ionicons name="call-outline" size={16} color="#FFF" />
                          <Text style={styles.guardianContactBtnText}>Contact Guardian</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {/* ── OPERATOR PROFILE ──────────────────────────────────── */}
                  {user.role === "operator" && (
                    <View style={[styles.disciplinesSection, { borderColor: colors.border }]}>
                      {operatorProfile && (
                        <View style={{ gap: 6 }}>
                          <Text style={[styles.disciplinesSectionTitle, { color: colors.primary, marginBottom: 2 }]}>Staff Type</Text>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {(["paid", "volunteer"] as const).map(t => (
                              <Pressable key={t}
                                onPress={() => { void handleOpProfileTypeChange(t); void Haptics.selectionAsync(); }}
                                disabled={opProfileTypeSaving}
                                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 2,
                                  borderColor: opProfileType === t ? (t === "paid" ? "#B45309" : colors.primary) : colors.border,
                                  backgroundColor: opProfileType === t ? (t === "paid" ? "#FEF9C3" : "#EFF6FF") : "transparent",
                                  opacity: opProfileTypeSaving ? 0.6 : 1 }}>
                                <Ionicons name={t === "paid" ? "cash-outline" : "heart-outline"} size={14}
                                  color={opProfileType === t ? (t === "paid" ? "#92400E" : colors.primary) : colors.mutedForeground} />
                                <Text style={{ fontSize: 11, fontWeight: "800", marginTop: 3,
                                  color: opProfileType === t ? (t === "paid" ? "#92400E" : colors.primary) : colors.mutedForeground }}>
                                  {t === "paid" ? "Paid" : "Volunteer"}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* ── Employment Type Section ── */}
                      {operatorProfile && (
                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}>
                          <Text style={[styles.disciplinesSectionTitle, { color: colors.primary, marginBottom: 2 }]}>Employment Type</Text>

                          {/* Toggle: On Wages / Contractor */}
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {(["wages", "contractor"] as const).map(t => (
                              <Pressable key={t}
                                onPress={() => { setEmpType(t); void Haptics.selectionAsync(); }}
                                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 2,
                                  borderColor: empType === t ? colors.primary : colors.border,
                                  backgroundColor: empType === t ? colors.primary : "transparent" }}>
                                <Text style={{ fontSize: 12, fontWeight: "800", color: empType === t ? "#FFF" : colors.mutedForeground }}>
                                  {t === "wages" ? "On Wages" : "Contractor"}
                                </Text>
                              </Pressable>
                            ))}
                          </View>

                          {/* Contractor rate + billing unit */}
                          {empType === "contractor" && (
                            <View style={{ gap: 8 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                <Text style={{ fontSize: 11, color: colors.mutedForeground, fontWeight: "700", minWidth: 34 }}>Rate</Text>
                                <TextInput
                                  style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                                    paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: colors.foreground }}
                                  placeholder="e.g. 45.00"
                                  value={contractorRate}
                                  onChangeText={setContractorRate}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {(["hourly", "per_lesson", "daily", "weekly", "monthly"] as const).map(u => {
                                  const lbl = u === "hourly" ? "/ hr" : u === "per_lesson" ? "/ lesson" : u === "daily" ? "/ day" : u === "weekly" ? "/ week" : "/ month";
                                  return (
                                    <Pressable key={u}
                                      onPress={() => { setContractorBilling(u); void Haptics.selectionAsync(); }}
                                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                                        backgroundColor: contractorBilling === u ? colors.primary : "transparent",
                                        borderColor: contractorBilling === u ? colors.primary : colors.border }}>
                                      <Text style={{ fontSize: 11, fontWeight: "700", color: contractorBilling === u ? "#FFF" : colors.foreground }}>{lbl}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                              {empConfig?.contractor_extra_chips && empConfig.contractor_extra_chips.length > 0 && (
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                  {empConfig.contractor_extra_chips.map((chip, i) => (
                                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#EFF6FF",
                                      borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#BFDBFE" }}>
                                      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{chip.label} {chip.rate}%</Text>
                                    </View>
                                  ))}
                                  <Text style={{ fontSize: 10, color: colors.mutedForeground, alignSelf: "center" }}>info chips (from AI lookup)</Text>
                                </View>
                              )}
                            </View>
                          )}

                          {/* Wages: sub-type selector + AI research */}
                          {empType === "wages" && (
                            <View style={{ gap: 8 }}>
                              {/* Sub-type selector */}
                              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground }}>ENGAGEMENT TYPE</Text>
                              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                                {(["on_call", "part_time", "full_time", "casual"] as const).map(sub => {
                                  const lbl = sub === "on_call" ? "On Call" : sub === "part_time" ? "Part Time" : sub === "full_time" ? "Full Time" : "Casual";
                                  return (
                                    <Pressable key={sub}
                                      onPress={() => { setEmpSubType(sub); setResearchResult(null); void Haptics.selectionAsync(); }}
                                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5,
                                        backgroundColor: empSubType === sub ? colors.primary : "transparent",
                                        borderColor: empSubType === sub ? colors.primary : colors.border }}>
                                      <Text style={{ fontSize: 11, fontWeight: "800", color: empSubType === sub ? "#FFF" : colors.foreground }}>{lbl}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>

                              {/* AI Research Contract button */}
                              <Pressable onPress={() => { void handleResearchContract(); }}
                                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                                  borderRadius: 10, paddingVertical: 9,
                                  backgroundColor: researchResult ? "#D1FAE5" : "#EFF6FF",
                                  borderWidth: 1, borderColor: researchResult ? "#6EE7B7" : "#BFDBFE" }}>
                                {researchLoading
                                  ? <ActivityIndicator size="small" color={colors.primary} />
                                  : <Ionicons name={researchResult ? "checkmark-circle" : "search-outline"} size={14} color={researchResult ? "#059669" : colors.primary} />}
                                <Text style={{ fontSize: 12, fontWeight: "800", color: researchResult ? "#059669" : colors.primary }}>
                                  {researchResult ? "Research Complete — Tap to Refresh" : "AI Research Contract Requirements"}
                                </Text>
                              </Pressable>

                              {/* Research results */}
                              {researchResult && (
                                <View style={{ gap: 6 }}>
                                  {/* Summary */}
                                  <View style={{ backgroundColor: "#EFF6FF", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#BFDBFE" }}>
                                    <Text style={{ fontSize: 11, color: colors.primary, lineHeight: 16, fontStyle: "italic" }}>
                                      {researchResult.summary}
                                    </Text>
                                  </View>

                                  {/* Required IDs */}
                                  {researchResult.required_ids?.length > 0 && (
                                    <View style={{ gap: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>REQUIRED DOCUMENTS</Text>
                                      {researchResult.required_ids.map((item, i) => (
                                        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6,
                                          backgroundColor: item.mandatory ? "#FEF3C7" : "#F9FAFB",
                                          borderRadius: 6, padding: 7, borderWidth: 1,
                                          borderColor: item.mandatory ? "#FDE68A" : colors.border }}>
                                          <Ionicons name={item.mandatory ? "alert-circle" : "document-outline"} size={12}
                                            color={item.mandatory ? "#92400E" : colors.mutedForeground} style={{ marginTop: 1 }} />
                                          <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 11, fontWeight: "700", color: item.mandatory ? "#92400E" : colors.foreground }}>{item.label}</Text>
                                            <Text style={{ fontSize: 10, color: colors.mutedForeground, lineHeight: 14 }}>{item.note}</Text>
                                          </View>
                                        </View>
                                      ))}
                                    </View>
                                  )}

                                  {/* Leave entitlements */}
                                  {researchResult.leave_entitlements?.length > 0 && (
                                    <View style={{ gap: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>LEAVE ENTITLEMENTS</Text>
                                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                                        {researchResult.leave_entitlements.map((l, i) => (
                                          <View key={i} style={{ backgroundColor: "#EFF6FF", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
                                            borderWidth: 1, borderColor: "#BFDBFE" }}>
                                            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                                              {l.label}{l.days_per_year ? ` · ${l.days_per_year}d/yr` : ""}
                                            </Text>
                                            <Text style={{ fontSize: 9, color: colors.mutedForeground }}>{l.note}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    </View>
                                  )}

                                  {/* Overtime rules */}
                                  {researchResult.overtime_rules?.length > 0 && (
                                    <View style={{ gap: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>OVERTIME RULES</Text>
                                      {researchResult.overtime_rules.map((o, i) => (
                                        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8,
                                          backgroundColor: "#F9FAFB", borderRadius: 6, padding: 7, borderWidth: 1, borderColor: colors.border }}>
                                          <View style={{ backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                                            <Text style={{ fontSize: 10, fontWeight: "800", color: "#FFF" }}>{o.multiplier}x</Text>
                                          </View>
                                          <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.foreground }}>{o.threshold}</Text>
                                            <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{o.note}</Text>
                                          </View>
                                        </View>
                                      ))}
                                    </View>
                                  )}

                                  {/* Tax obligations */}
                                  {researchResult.tax_obligations?.length > 0 && (
                                    <View style={{ gap: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>TAX OBLIGATIONS</Text>
                                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                                        {researchResult.tax_obligations.map((t, i) => (
                                          <View key={i} style={{ backgroundColor: "#EFF6FF", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
                                            borderWidth: 1, borderColor: "#BFDBFE" }}>
                                            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>{t.label} {t.rate}%</Text>
                                            <Text style={{ fontSize: 9, color: colors.primary }}>{t.payer} · {t.note}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    </View>
                                  )}

                                  {/* Contract references */}
                                  {researchResult.contract_references?.length > 0 && (
                                    <View style={{ gap: 4 }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>REFERENCE CONTRACTS</Text>
                                      {researchResult.contract_references.map((ref, i) => (
                                        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6,
                                          backgroundColor: "#FFFBEB", borderRadius: 6, padding: 7, borderWidth: 1, borderColor: "#FDE68A" }}>
                                          <Ionicons name="library-outline" size={12} color="#92400E" />
                                          <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 11, fontWeight: "700", color: "#92400E" }}>{ref.name}</Text>
                                            <Text style={{ fontSize: 10, color: "#B45309" }}>{ref.source} · {ref.note}</Text>
                                          </View>
                                        </View>
                                      ))}
                                    </View>
                                  )}

                                  {/* Legal disclaimer */}
                                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6,
                                    backgroundColor: "#FEF9C3", borderRadius: 6, padding: 8, borderWidth: 1, borderColor: "#FDE68A" }}>
                                    <Ionicons name="warning-outline" size={12} color="#92400E" style={{ marginTop: 1 }} />
                                    <Text style={{ fontSize: 10, color: "#92400E", flex: 1, lineHeight: 14 }}>
                                      AI research is a starting point only. Always verify with a licensed accountant or employment lawyer before finalising any contract.
                                    </Text>
                                  </View>

                                  {/* Send to Accountant */}
                                  <Pressable onPress={() => setShowAccountantModal(true)}
                                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                                      borderRadius: 10, paddingVertical: 9, backgroundColor: colors.primary }}>
                                    <Ionicons name="mail-outline" size={14} color="#FFF" />
                                    <Text style={{ fontSize: 12, fontWeight: "800", color: "#FFF" }}>Send to Accountant for Review</Text>
                                  </Pressable>
                                </View>
                              )}

                              {/* Parse accountant reply section */}
                              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 6, marginTop: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground }}>PASTE ACCOUNTANT REPLY</Text>
                                <TextInput
                                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                                    paddingHorizontal: 10, paddingVertical: 8, fontSize: 11, color: colors.foreground,
                                    minHeight: 70, textAlignVertical: "top" }}
                                  placeholder="Paste the accountant's reply email here..."
                                  multiline
                                  value={accountantReplyText}
                                  onChangeText={setAccountantReplyText}
                                />
                                <Pressable onPress={() => { void handleParseAccountantReply(); }}
                                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                                    borderRadius: 10, paddingVertical: 8, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" }}>
                                  {parsingReply
                                    ? <ActivityIndicator size="small" color="#92400E" />
                                    : <Ionicons name="sparkles-outline" size={13} color="#92400E" />}
                                  <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400E" }}>Apply Accountant Reply to Payroll</Text>
                                </Pressable>
                                {parseResult && (
                                  <View style={{ gap: 5 }}>
                                    <View style={{ backgroundColor: "#D1FAE5", borderRadius: 8, padding: 9, borderWidth: 1, borderColor: "#6EE7B7" }}>
                                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#059669", marginBottom: 3 }}>Accountant Guidance Applied</Text>
                                      <Text style={{ fontSize: 11, color: "#065F46", lineHeight: 15 }}>{parseResult.summary}</Text>
                                    </View>
                                    {parseResult.special_notes?.map((note, i) => (
                                      <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 5,
                                        backgroundColor: "#FEF3C7", borderRadius: 6, padding: 7, borderWidth: 1, borderColor: "#FDE68A" }}>
                                        <Ionicons name="alert-circle-outline" size={12} color="#92400E" style={{ marginTop: 1 }} />
                                        <Text style={{ fontSize: 10, color: "#92400E", flex: 1, lineHeight: 14 }}>{note}</Text>
                                      </View>
                                    ))}
                                    {parseResult.required_ids_confirmed?.length > 0 && (
                                      <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
                                        IDs confirmed: {parseResult.required_ids_confirmed.join(", ")}
                                      </Text>
                                    )}
                                  </View>
                                )}
                              </View>
                            </View>
                          )}

                          {/* Country / City */}
                          <View style={{ gap: 6 }}>
                            <TextInput
                              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                                paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: colors.foreground }}
                              placeholder="Residence country"
                              value={empCountry}
                              onChangeText={setEmpCountry}
                            />
                            <TextInput
                              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                                paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: colors.foreground }}
                              placeholder="City"
                              value={empCity}
                              onChangeText={setEmpCity}
                            />
                          </View>

                          {/* Action buttons */}
                          <Pressable onPress={() => { void handleAiJurisdiction(); }}
                            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                              borderRadius: 10, paddingVertical: 9, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" }}>
                            {jurisdictionLoading
                              ? <ActivityIndicator size="small" color={colors.primary} />
                              : <Ionicons name="globe-outline" size={14} color={colors.primary} />}
                            <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>AI Jurisdiction Lookup</Text>
                          </Pressable>

                          <Pressable onPress={() => { void handleSaveEmployment(); }}
                            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                              borderRadius: 10, paddingVertical: 9, backgroundColor: colors.primary }}>
                            {empSaving
                              ? <ActivityIndicator size="small" color="#FFF" />
                              : <Ionicons name="checkmark-circle-outline" size={14} color="#FFF" />}
                            <Text style={{ fontSize: 12, fontWeight: "800", color: "#FFF" }}>Save Employment Settings</Text>
                          </Pressable>

                          <Pressable onPress={() => { void handleGenerateContract(); }}
                            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                              borderRadius: 10, paddingVertical: 9, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A" }}>
                            {generatingContract
                              ? <ActivityIndicator size="small" color="#92400E" />
                              : <Ionicons name="document-text-outline" size={14} color="#92400E" />}
                            <Text style={{ fontSize: 12, fontWeight: "800", color: "#92400E" }}>
                              {empConfig?.contract_generated_at ? "Regenerate Contract" : "Generate Contract"}
                            </Text>
                          </Pressable>

                          {empConfig?.contract_generated_at && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                              backgroundColor: empConfig.signed_at ? "#D1FAE5" : "#FEF9C3",
                              borderWidth: 1, borderColor: empConfig.signed_at ? "#6EE7B7" : "#FDE68A" }}>
                              <Ionicons name={empConfig.signed_at ? "checkmark-circle" : "time-outline"} size={14}
                                color={empConfig.signed_at ? "#059669" : "#92400E"} />
                              <Text style={{ fontSize: 12, fontWeight: "700", flex: 1, color: empConfig.signed_at ? "#059669" : "#92400E" }}>
                                {empConfig.signed_at
                                  ? `Signed ${new Date(empConfig.signed_at).toLocaleDateString()}`
                                  : "Awaiting operator signature"}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      <Text style={[styles.disciplinesSectionTitle, { color: colors.primary, marginTop: operatorProfile ? 10 : 0 }]}>Disciplines</Text>
                      {!operatorProfile ? (
                        <Text style={[styles.disciplinesEmpty, { color: colors.mutedForeground }]}>No operator profile yet</Text>
                      ) : !operatorProfile.rates || operatorProfile.rates.length === 0 ? (
                        <Text style={[styles.disciplinesEmpty, { color: colors.mutedForeground }]}>No disciplines assigned yet</Text>
                      ) : (
                        <View style={styles.disciplinesChips}>
                          {operatorProfile.rates.filter(r => r.discipline?.name).map(r => (
                            <View key={r.id} style={[styles.disciplineChip, { backgroundColor: colors.primary }]}>
                              <Text style={[styles.disciplineChipText, { color: "#FFF" }]}>{r.discipline?.name}</Text>
                              <Ionicons name="checkmark" size={11} color="#FFF" />
                            </View>
                          ))}
                        </View>
                      )}
                      <Pressable style={[styles.manageProfileBtn, { borderColor: colors.primary }]} onPress={() => { setSelected(null); router.push("/(admin)/lessons"); }}>
                        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
                        <Text style={[styles.manageProfileBtnText, { color: colors.primary }]}>
                          {operatorProfile ? "Edit Profile in Activity" : "Create Profile in Activity"}
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Contact button */}
                  {user.status !== "suspended" && user.role !== "student" && !!user.phone && (
                    <Pressable style={[styles.contactBtn, { backgroundColor: colors.primary }]} onPress={() => setShowContact(true)}>
                      <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
                      <Text style={styles.contactBtnText}>Contact {user.name.split(" ")[0]}</Text>
                    </Pressable>
                  )}

                  {/* Role/status actions */}
                  <View style={styles.modalActions}>
                    {user.status === "pending" && (
                      <Pressable style={[styles.modalActionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => handleApprove(user)}>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#059669" />
                        <Text style={[styles.modalActionText, { color: "#059669" }]}>Approve Access</Text>
                      </Pressable>
                    )}
                    {/* ── Multi-role switches ── */}
                    {user.status !== "suspended" && user.role !== "student" && (
                      <View style={styles.roleSwitchSection}>
                        <Text style={[styles.roleSwitchHeader, { color: colors.mutedForeground }]}>ROLES</Text>
                        {(
                          [
                            { role: "parent"   as UserRole, label: "Member",   color: colors.primary },
                            { role: "operator" as UserRole, label: "Operator", color: colors.primary },
                            { role: "admin"    as UserRole, label: "Admin",    color: "#B45309" },
                          ] as const
                        ).map(({ role: r, label, color: c }) => {
                          const active = (user.roles ?? [user.role]).includes(r);
                          return (
                            <View key={r} style={[styles.roleSwitchRow, { borderColor: colors.border }]}>
                              <View style={styles.roleSwitchLeft}>
                                <View style={[styles.roleDot, { backgroundColor: c }]} />
                                <Text style={[styles.roleSwitchLabel, { color: colors.foreground }]}>{label}</Text>
                              </View>
                              <Switch
                                value={active}
                                onValueChange={(val) => handleRoleToggle(user, r, val)}
                                trackColor={{ true: c, false: colors.border }}
                                thumbColor="#FFF"
                                ios_backgroundColor={colors.border}
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {user.status === "suspended" ? (
                      <Pressable style={[styles.modalActionBtn, { backgroundColor: "#D1FAE5" }]} onPress={() => handleReactivate(user)}>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#059669" />
                        <Text style={[styles.modalActionText, { color: "#059669" }]}>Reactivate Account</Text>
                      </Pressable>
                    ) : (
                      user.role !== "student" && (
                        <Pressable style={[styles.modalActionBtn, { backgroundColor: "#FEE2E2" }]} onPress={() => handleSuspend(user)}>
                          <Ionicons name="ban" size={18} color="#EF4444" />
                          <Text style={[styles.modalActionText, { color: "#EF4444" }]}>Suspend Access</Text>
                        </Pressable>
                      )
                    )}
                  </View>

                  {/* Inline confirmation */}
                  {confirmAction && confirmAction.user.id === user.id && (() => {
                    const msgs: Record<string, { title: string; body: string; confirmLabel: string; confirmColor: string }> = {
                      suspend:     { title: "Suspend User",    body: `Suspend ${user.name}? They will immediately lose app access.`, confirmLabel: "Suspend",    confirmColor: "#EF4444" },
                      reactivate:  { title: "Reactivate User", body: `Restore full access for ${user.name}?`,                        confirmLabel: "Reactivate", confirmColor: "#10B981" },
                      approve:     { title: "Approve User",    body: `Approve ${user.name} and grant full access?`,                  confirmLabel: "Approve",    confirmColor: "#10B981" },
                      role_change: { title: confirmAction.enabling ? "Grant Role" : "Remove Role", body: `${confirmAction.enabling ? "Add" : "Remove"} the ${confirmAction.newRole === "parent" ? "Member" : confirmAction.newRole === "operator" ? "Operator" : "Admin"} role for ${user.name}?`, confirmLabel: "Confirm", confirmColor: colors.primary },
                    };
                    const m = msgs[confirmAction.type];
                    return (
                      <View style={styles.confirmPanel}>
                        <Text style={styles.confirmTitle}>{m.title}</Text>
                        <Text style={styles.confirmBody}>{m.body}</Text>
                        <View style={styles.confirmButtons}>
                          <Pressable style={[styles.confirmBtn, { backgroundColor: colors.muted }]} onPress={() => setConfirmAction(null)}>
                            <Text style={[styles.confirmBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                          </Pressable>
                          <Pressable style={[styles.confirmBtn, { backgroundColor: m.confirmColor }]} onPress={executeConfirmAction}>
                            <Text style={[styles.confirmBtnText, { color: "#FFF" }]}>{m.confirmLabel}</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })()}

                  <Pressable style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => { setConfirmAction(null); setSelected(null); }}>
                    <Text style={[styles.closeBtnText, { color: colors.primary }]}>Close</Text>
                  </Pressable>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Contact Options Modal */}
      <Modal visible={showContact} transparent animationType="fade" onRequestClose={() => setShowContact(false)}>
        <Pressable style={styles.contactOverlay} onPress={() => setShowContact(false)}>
          <View style={[styles.contactSheet, { backgroundColor: colors.card }]}>
            <View style={styles.contactHandle} />
            <Text style={[styles.contactTitle, { color: colors.primary }]}>Contact {selected?.name.split(" ")[0]}</Text>
            <Text style={[styles.contactSubtitle, { color: colors.mutedForeground }]}>{selected?.phone}</Text>
            {[
              { type: "whatsapp" as const, label: "WhatsApp",   icon: "logo-whatsapp" as const, bg: "#25D366", fg: "#FFF" },
              { type: "sms"      as const, label: "Send SMS",   icon: "chatbubble"    as const, bg: "#007AFF", fg: "#FFF" },
              { type: "email"    as const, label: "Send Email", icon: "mail"          as const, bg: colors.primary, fg: "#FFF" },
              { type: "call"     as const, label: "Phone Call", icon: "call"          as const, bg: colors.primary, fg: "#FFF" },
            ].map(opt => (
              <Pressable key={opt.type} style={[styles.contactOption, { backgroundColor: opt.bg }]} onPress={() => handleContactAction(opt.type)}>
                <Ionicons name={opt.icon} size={22} color={opt.fg} />
                <Text style={[styles.contactOptionText, { color: opt.fg }]}>{opt.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.contactCancelBtn, { backgroundColor: colors.muted }]} onPress={() => setShowContact(false)}>
              <Text style={[styles.contactCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Send to Accountant Modal */}
      <Modal visible={showAccountantModal} transparent animationType="slide" onRequestClose={() => setShowAccountantModal(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "90%" }}>
            <View style={{ width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.primary, marginBottom: 4 }}>Send to Accountant</Text>
            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 14, lineHeight: 17 }}>
              Review and edit the email below, then open it in your mail app. The accountant's reply can be pasted into the "Parse Accountant Reply" field.
            </Text>

            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground, marginBottom: 4 }}>ACCOUNTANT EMAIL ADDRESS</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.foreground, marginBottom: 10 }}
              placeholder="accountant@firm.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={accountantEmail}
              onChangeText={setAccountantEmail}
            />

            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground, marginBottom: 4 }}>SUBJECT</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.foreground, marginBottom: 10 }}
              value={accountantSubject}
              onChangeText={setAccountantSubject}
            />

            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.mutedForeground, marginBottom: 4 }}>EMAIL BODY (EDITABLE)</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: colors.foreground,
                  minHeight: 160, textAlignVertical: "top" }}
                multiline
                value={accountantBody}
                onChangeText={setAccountantBody}
              />
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Pressable onPress={() => setShowAccountantModal(false)}
                style={{ flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center",
                  borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.mutedForeground }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const subject = encodeURIComponent(accountantSubject);
                  const body    = encodeURIComponent(accountantBody);
                  const to      = encodeURIComponent(accountantEmail);
                  void Linking.openURL(`mailto:${to}?subject=${subject}&body=${body}`);
                  setShowAccountantModal(false);
                }}
                style={{ flex: 2, borderRadius: 10, paddingVertical: 11, alignItems: "center",
                  backgroundColor: colors.primary, flexDirection: "row", justifyContent: "center", gap: 6 }}>
                <Ionicons name="mail-outline" size={15} color="#FFF" />
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#FFF" }}>Open in Mail App</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Guardian Contact Modal */}
      <Modal visible={showGuardian} transparent animationType="fade" onRequestClose={() => setShowGuardian(false)}>
        <Pressable style={styles.contactOverlay} onPress={() => setShowGuardian(false)}>
          <View style={[styles.contactSheet, { backgroundColor: colors.card }]}>
            <View style={styles.contactHandle} />
            <Text style={[styles.contactTitle, { color: colors.primary }]}>Contact Guardian</Text>
            <Text style={[styles.contactSubtitle, { color: colors.mutedForeground }]}>{selected?.parentName} · {selected?.parentPhone}</Text>
            {[
              { type: "whatsapp" as const, label: "WhatsApp",   icon: "logo-whatsapp" as const, bg: "#25D366", fg: "#FFF" },
              { type: "sms"      as const, label: "Send SMS",   icon: "chatbubble"    as const, bg: "#007AFF", fg: "#FFF" },
              { type: "call"     as const, label: "Phone Call", icon: "call"          as const, bg: colors.primary, fg: "#FFF" },
            ].map(opt => (
              <Pressable key={opt.type} style={[styles.contactOption, { backgroundColor: opt.bg }]} onPress={() => handleGuardianAction(opt.type)}>
                <Ionicons name={opt.icon} size={22} color={opt.fg} />
                <Text style={[styles.contactOptionText, { color: opt.fg }]}>{opt.label}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.contactCancelBtn, { backgroundColor: colors.muted }]} onPress={() => setShowGuardian(false)}>
              <Text style={[styles.contactCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ══════════════════════════════════════════════════
          INVITE ADMIN MODAL
      ══════════════════════════════════════════════════ */}
      <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => setShowInviteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, maxHeight: "70%" }]}>
            <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: colors.primary }}>Invite Admin</Text>
                  <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>
                    They'll receive login credentials by email
                  </Text>
                </View>
                <Pressable onPress={() => setShowInviteModal(false)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {/* Info banner */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FEF9EC", borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: "#FDE68A" }}>
                <Ionicons name="information-circle-outline" size={16} color="#B45309" style={{ marginTop: 1 }} />
                <Text style={{ color: "#92400E", fontSize: 12, flex: 1, lineHeight: 18 }}>
                  A new admin account will be created with a temporary password. The invite email contains their login credentials. They should change their password after first login.
                </Text>
              </View>

              {/* Name field */}
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 6 }}>
                FULL NAME (OPTIONAL)
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.foreground, backgroundColor: colors.background, marginBottom: 14 }}
                value={inviteName}
                onChangeText={setInviteName}
                placeholder="e.g. Sarah Johnson"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
                returnKeyType="next"
              />

              {/* Email field */}
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.mutedForeground, letterSpacing: 0.5, marginBottom: 6 }}>
                EMAIL ADDRESS *
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.foreground, backgroundColor: colors.background, marginBottom: 24 }}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="admin@example.com"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  style={{ flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.muted }}
                  onPress={() => setShowInviteModal(false)}
                >
                  <Text style={{ fontWeight: "700", fontSize: 14, color: colors.mutedForeground }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[{ flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#B45309" }, inviting && { opacity: 0.6 }]}
                  disabled={inviting}
                  onPress={async () => {
                    const email = inviteEmail.trim();
                    if (!email || !email.includes("@")) {
                      Alert.alert("Invalid Email", "Please enter a valid email address.");
                      return;
                    }
                    setInviting(true);
                    try {
                      const result = await inviteAdmin({ email, name: inviteName.trim() || undefined });
                      setShowInviteModal(false);
                      setInviteEmail("");
                      setInviteName("");
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert(
                        "Admin Invited",
                        `Login credentials have been sent to ${result.email}. They can now sign in to the Stride app.`,
                      );
                      // Reload users list
                      const updated = await api.getUsers();
                      setUsers(updated.map(apiUserToRecord));
                    } catch (err) {
                      Alert.alert("Error", (err as Error).message ?? "Failed to invite admin. Please try again.");
                    } finally {
                      setInviting(false);
                    }
                  }}
                >
                  {inviting
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={{ fontWeight: "800", fontSize: 14, color: "#FFF" }}>Send Invite</Text>
                  }
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── UserCard ───────────────────────────────────────────────────────────────────

type Colors = { card: string; primary: string; mutedForeground: string; foreground: string; muted: string; border: string; background: string; secondary: string };

function UserCard({ user, colors, primaryRoleName, secondaryRoleName, onPress }: {
  user: UserRecord;
  colors: Colors;
  primaryRoleName: string;
  secondaryRoleName: string;
  onPress: () => void;
}) {
  const styles = make_styles(colors.primary, colors.secondary);
  const rc = ROLE_COLORS[user.role];
  const sc = STATUS_CONFIG[user.status];

  const hasAllergy       = !!user.allergies && user.allergies !== "None" && user.allergies !== "";
  const hasPhotoConsent  = user.mediaCons !== undefined;
  const hasAmbulance     = user.ambulanceCons !== undefined;
  const showSafety       = user.role === "student" && (hasAllergy || hasPhotoConsent || hasAmbulance || (user.goldStars ?? 0) > 0 || !!user.parentName);

  return (
    <Pressable
      style={[
        styles.userCard,
        { backgroundColor: colors.card },
        user.status === "suspended" && { opacity: 0.75, borderLeftWidth: 3, borderLeftColor: "#EF4444" },
        hasAllergy && { borderLeftWidth: 3, borderLeftColor: "#DC2626" },
      ]}
      onPress={onPress}
    >
      <View style={[styles.userAvatar, { backgroundColor: rc.bg }]}>
        <Text style={[styles.userAvatarText, { color: rc.text }]}>{user.name.charAt(0)}</Text>
      </View>

      <View style={styles.userInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.userName, { color: colors.primary }]}>{user.name}</Text>
          {user.status === "suspended" && <Ionicons name="ban" size={12} color="#EF4444" />}
        </View>
        {!!user.email
          ? <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user.email}</Text>
          : !!user.parentName && (
              <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>Guardian: {user.parentName}</Text>
            )
        }
        <View style={styles.userMeta}>
          <View style={[styles.roleBadge, { backgroundColor: rc.bg }]}>
            <Text style={[styles.roleText, { color: rc.text }]}>{roleLabel(user.role, primaryRoleName, secondaryRoleName)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: sc.dot }]} />
            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>

        {/* Safety indicator row — students only */}
        {showSafety && (
          <View style={styles.safetyIndicatorRow}>
            {/* Allergy indicator */}
            {hasAllergy && (
              <View style={styles.safetyChip}>
                <Ionicons name="warning" size={10} color="#DC2626" />
                <Text style={[styles.safetyChipText, { color: "#DC2626" }]} numberOfLines={1}>{user.allergies}</Text>
              </View>
            )}

            {/* Photo consent icon */}
            {hasPhotoConsent && (
              <Ionicons
                name={user.mediaCons === "full" ? "camera" : user.mediaCons === "internal" ? "camera-outline" : "eye-off-outline"}
                size={14}
                color={user.mediaCons === "full" ? "#16A34A" : user.mediaCons === "internal" ? "#D97706" : "#DC2626"}
              />
            )}

            {/* Ambulance icon */}
            {hasAmbulance && (
              <Ionicons
                name={user.ambulanceCons ? "medkit" : "medkit-outline"}
                size={14}
                color={user.ambulanceCons ? "#16A34A" : "#DC2626"}
              />
            )}

            {/* Stars */}
            {(user.goldStars ?? 0) > 0 && (
              <View style={styles.safetyChip}>
                <Ionicons name="star" size={10} color="#F59E0B" />
                <Text style={[styles.safetyChipText, { color: "#F59E0B" }]}>{user.goldStars}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  pageHeaderRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  pageTitle:      { fontSize: 28, fontWeight: "800" },
  pageSub:        { fontSize: 13, marginTop: 2 },
  badgePdfBtn:    { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  importBanner:   { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },

  statCard:  { borderRadius: 14, padding: 16, alignItems: "center", marginRight: 10, minWidth: 80 },
  statNum:   { fontSize: 26, fontWeight: "800", color: "#FFF" },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 2 },

  searchBar:   { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, padding: 14, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15 },

  filterBar:  { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
  filterBtn:  { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignItems: "center" },
  filterText: { fontSize: 13, fontWeight: "600", color: "#6B7BA4" },

  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 },
  groupDot:    { width: 8, height: 8, borderRadius: 4 },
  groupLabel:  { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },

  userCard:      { flexDirection: "row", alignItems: "center", borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  userAvatar:    { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 },
  userAvatarText:{ fontSize: 20, fontWeight: "700" },
  userInfo:      { flex: 1, minWidth: 0 },
  userName:      { fontSize: 16, fontWeight: "700" },
  userEmail:     { fontSize: 12, marginTop: 2 },
  userMeta:      { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" },

  safetyIndicatorRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
  safetyChip:         { flexDirection: "row", alignItems: "center", gap: 3 },
  safetyChipText:     { fontSize: 10, fontWeight: "700" },

  roleBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText:   { fontSize: 11, fontWeight: "700" },
  statusBadge:{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600" },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard:    { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: 0, overflow: "hidden", maxHeight: "90%" },
  modalAvatar:  { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 14, marginTop: 24 },
  modalAvatarText: { fontSize: 34, fontWeight: "700" },
  modalName:    { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  modalEmail:   { fontSize: 13, marginBottom: 2 },
  modalPhone:   { fontSize: 13, marginBottom: 14 },
  modalBadgeRow:{ flexDirection: "row", gap: 10, marginBottom: 12 },

  suspendedBanner:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EF4444", alignSelf: "stretch", paddingVertical: 10, paddingHorizontal: 20, marginBottom: 8 },
  suspendedBannerText:{ color: "#FFF", fontWeight: "700", fontSize: 13 },

  joinDateText: { fontSize: 12, marginBottom: 16 },

  // Safety section
  safetySection: { width: "88%", borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
  safetySectionHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 },
  safetySectionTitle:  { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },

  safetyRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  safetyRowLeft:  { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  safetyIcon:     { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  safetyRowLabel: { fontSize: 13, fontWeight: "500" },
  safetyRowValueWrap: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  safetyRowValue: { fontSize: 12, fontWeight: "700" },

  starsRow:   { flexDirection: "row", alignItems: "center", gap: 3 },
  starsCount: { fontSize: 12, fontWeight: "700", marginLeft: 4 },

  // Guardian section
  guardianSection: { width: "88%", borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 14 },
  guardianInfo:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  guardianAvatar:  { width: 36, height: 36, borderRadius: 18, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  guardianAvatarText: { fontSize: 16, fontWeight: "700", color: primary },
  guardianName:    { fontSize: 14, fontWeight: "700" },
  guardianPhone:   { fontSize: 12, marginTop: 2 },
  guardianContactBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 11 },
  guardianContactBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },

  contactBtn:     { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16, width: "85%", justifyContent: "center" },
  contactBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },

  roleSwitchSection: { width: "85%", marginBottom: 12, gap: 4 },
  roleSwitchHeader:  { fontSize: 9, fontWeight: "800", letterSpacing: 1.5, marginBottom: 6 },
  roleSwitchRow:     { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  roleSwitchLeft:    { flexDirection: "row", alignItems: "center", gap: 10 },
  roleDot:           { width: 10, height: 10, borderRadius: 5 },
  roleSwitchLabel:   { fontSize: 15, fontWeight: "600" },

  modalActions:    { flexDirection: "column", gap: 10, width: "85%", marginBottom: 12 },
  modalActionBtn:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 15 },
  modalActionText: { fontWeight: "700", fontSize: 15 },
  closeBtn:        { borderRadius: 14, paddingVertical: 14, alignItems: "center", width: "85%", marginTop: 4 },
  closeBtnText:    { fontWeight: "700", fontSize: 15 },

  confirmPanel:   { width: "85%", backgroundColor: "#FFF8F0", borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#FDE8C8", gap: 10 },
  confirmTitle:   { fontWeight: "700", fontSize: 15, color: "#111827" },
  confirmBody:    { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  confirmButtons: { flexDirection: "row", gap: 10 },
  confirmBtn:     { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  confirmBtnText: { fontWeight: "700", fontSize: 14 },

  contactOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  contactSheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  contactHandle:      { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 20 },
  contactTitle:       { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 4 },
  contactSubtitle:    { fontSize: 14, textAlign: "center", marginBottom: 20 },
  contactOption:      { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 10 },
  contactOptionText:  { fontSize: 16, fontWeight: "700" },
  contactCancelBtn:   { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  contactCancelText:  { fontWeight: "700", fontSize: 15 },

  disciplinesSection:      { width: "85%", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  disciplinesSectionTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  disciplinesEmpty:        { fontSize: 12, marginBottom: 8 },
  disciplinesChips:        { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  disciplineChip:          { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  disciplineChipText:      { fontSize: 12, fontWeight: "600" },
  profileTypePill:         { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  profileTypePillText:     { fontSize: 12, fontWeight: "700" },
  manageProfileBtn:        { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "center", marginTop: 6 },
  manageProfileBtnText:    { fontSize: 12, fontWeight: "700" },

  phoneActionRow: { flexDirection: "row", gap: 8, width: "90%", marginTop: 10, marginBottom: 4 },
  phoneActionBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 12, paddingVertical: 10 },
  phoneActionLabel: { fontSize: 10, fontWeight: "700" },

  profileLoadingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, marginBottom: 4 },
  profileLoadingText: { fontSize: 12 },

  profileSection: { width: "90%", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  profileSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  profileSectionTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  profileSectionValue: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  profileSectionMuted: { fontSize: 12, marginTop: 2 },

  emergencyPhoneBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DC2626", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: "flex-start", marginTop: 8 },
  emergencyPhoneBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
});
