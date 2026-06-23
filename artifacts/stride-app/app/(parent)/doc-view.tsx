import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAppData } from "@/context/AppDataContext";
import { useColors } from "@/hooks/useColors";

const TYPE_LABELS: Record<string, string> = {
  tc: "Terms & Conditions",
  privacy: "Privacy Policy",
  waiver: "Medical Waiver",
  media_release: "Media Release",
  communication: "Communication Consent",
  material: "Course Materials",
};

export default function DocViewScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  const { documents } = useAppData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const doc = documents.find(d => d.id === docId);

  const handleDownload = async () => {
    if (!doc) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (doc.fileUrl) {
      await WebBrowser.openBrowserAsync(doc.fileUrl);
    } else {
      await Share.share({
        message: `Document: ${doc.title}\nSigned: ${doc.signedDate ?? "—"}\nIssued by: Association\nRef: ${doc.id}`,
      });
    }
  };

  if (!doc) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Document" light onBack={() => router.back()} />
        <View style={s.center}>
          <Text style={{ color: colors.mutedForeground }}>Document not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title={doc.title} subtitle="Signed Document — Read Only" light onBack={() => router.back()}
        right={
          <Pressable style={[s.dlBtn, { backgroundColor: colors.primary + "18" }]} onPress={handleDownload} hitSlop={8}>
            <Ionicons name="download-outline" size={20} color={colors.primary} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Signed stamp */}
        <View style={[s.signedBadge, { backgroundColor: "#ECFDF5", borderColor: "#6EE7B7" }]}>
          <View style={s.signedIconWrap}>
            <Ionicons name="shield-checkmark" size={24} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.signedTitle}>Document Signed</Text>
            {doc.signedDate
              ? <Text style={s.signedDate}>Signed on {doc.signedDate}</Text>
              : <Text style={s.signedDate}>Signature on record</Text>
            }
          </View>
          <Ionicons name="checkmark-circle" size={20} color="#059669" />
        </View>

        {/* Meta card */}
        <View style={[s.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MetaRow label="Document" value={doc.title} colors={colors} />
          <MetaDivider color={colors.border} />
          <MetaRow label="Type" value={TYPE_LABELS[doc.type] ?? doc.type.toUpperCase()} colors={colors} />
          <MetaDivider color={colors.border} />
          <MetaRow
            label="Issued By"
            value={doc.sentBy === "admin" ? "Administration" : "Association"}
            colors={colors}
          />
          {doc.sentAt && (
            <>
              <MetaDivider color={colors.border} />
              <MetaRow label="Issued" value={doc.sentAt} colors={colors} />
            </>
          )}
          {doc.signedDate && (
            <>
              <MetaDivider color={colors.border} />
              <MetaRow label="Signed On" value={doc.signedDate} colors={colors} valueGreen />
            </>
          )}
          <MetaDivider color={colors.border} />
          <MetaRow label="Reference" value={doc.id} colors={colors} muted />
        </View>

        {/* Read-only notice */}
        <View style={[s.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
          <Text style={[s.noticeText, { color: colors.mutedForeground }]}>
            This is a read-only view of a signed document. Your acceptance is recorded in the compliance system. Contact the Association administration to request a certified copy.
          </Text>
        </View>

        <Pressable style={[s.downloadBtn, { backgroundColor: colors.primary }]} onPress={handleDownload}>
          <Ionicons name="cloud-download-outline" size={18} color="#FFF" />
          <Text style={s.downloadBtnText}>Download / Share Copy</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function MetaRow({
  label, value, colors, muted, valueGreen,
}: {
  label: string; value: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  muted?: boolean; valueGreen?: boolean;
}) {
  return (
    <View style={s.metaRow}>
      <Text style={[s.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text
        style={[s.metaValue, { color: valueGreen ? "#059669" : muted ? colors.mutedForeground : colors.foreground }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function MetaDivider({ color }: { color: string }) {
  return <View style={[s.metaDivider, { backgroundColor: color }]} />;
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerSub: { fontSize: 11, marginTop: 1 },
  dlBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  signedBadge: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 16 },
  signedIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#D1FAE5", alignItems: "center", justifyContent: "center" },
  signedTitle: { fontSize: 15, fontWeight: "700", color: "#059669" },
  signedDate: { fontSize: 12, color: "#065F46", marginTop: 2 },
  metaCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  metaRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, justifyContent: "space-between" },
  metaLabel: { fontSize: 13, fontWeight: "500" },
  metaValue: { fontSize: 13, fontWeight: "600", maxWidth: "58%", textAlign: "right" },
  metaDivider: { height: 1, marginLeft: 16 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 20 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  downloadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, paddingVertical: 16 },
  downloadBtnText: { color: "#FFF", fontWeight: "700", fontSize: 15 },
});
