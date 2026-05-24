import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type AccessVerdict = "suspended" | "grace_allowed" | "overdue_denied";

interface QRAccessAlertProps {
  verdict: AccessVerdict;
  childName: string;
  blockReason?: string;
}

const CONFIG: Record<
  AccessVerdict,
  {
    bg: string;
    border: string;
    icon: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    label: string;
    labelColor: string;
    title: string;
    body: string;
    badge: string;
    badgeBg: string;
  }
> = {
  suspended: {
    bg: "#450A0A",
    border: "#DC2626",
    icon: "ban-outline",
    iconColor: "#FCA5A5",
    label: "ACCESSO NEGATO",
    labelColor: "#FCA5A5",
    title: "Account Sospeso",
    body: "Il codice QR è sospeso. Contattare l'amministrazione/ufficio per ulteriori informazioni.",
    badge: "SOSPESO",
    badgeBg: "#DC2626",
  },
  grace_allowed: {
    bg: "#451A03",
    border: "#F59E0B",
    icon: "warning-outline",
    iconColor: "#FCD34D",
    label: "ACCESSO TEMPORANEO",
    labelColor: "#FCD34D",
    title: "Abbonamento Scaduto — Ultimo Accesso",
    body: "L'abbonamento è scaduto. Questo è l'unico accesso consentito come eccezione. Rinnovare l'abbonamento immediatamente per continuare a frequentare le lezioni.",
    badge: "ACCESSO UNA TANTUM",
    badgeBg: "#D97706",
  },
  overdue_denied: {
    bg: "#450A0A",
    border: "#DC2626",
    icon: "close-circle-outline",
    iconColor: "#FCA5A5",
    label: "ACCESSO NEGATO",
    labelColor: "#FCA5A5",
    title: "Pagamento Scaduto",
    body: "Il pagamento è in ritardo. Accesso negato. Contattare l'amministrazione/ufficio per ulteriori informazioni.",
    badge: "NON PAGATO",
    badgeBg: "#DC2626",
  },
};

export default function QRAccessAlert({ verdict, childName, blockReason }: QRAccessAlertProps) {
  const c = CONFIG[verdict];
  return (
    <View style={[styles.container, { backgroundColor: c.bg, borderColor: c.border }]}>
      <View style={styles.header}>
        <Ionicons name={c.icon} size={32} color={c.iconColor} />
        <View style={styles.headerText}>
          <Text style={[styles.label, { color: c.labelColor }]}>{c.label}</Text>
          <Text style={styles.name} numberOfLines={1}>{childName}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: c.badgeBg }]}>
          <Text style={styles.badgeText}>{c.badge}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: c.border }]} />

      <Text style={[styles.title, { color: c.iconColor }]}>{c.title}</Text>
      <Text style={styles.body}>{c.body}</Text>

      {blockReason ? (
        <View style={[styles.reasonBox, { borderColor: c.border }]}>
          <Text style={styles.reasonLabel}>Motivo:</Text>
          <Text style={styles.reasonText}>{blockReason}</Text>
        </View>
      ) : null}

      <Text style={styles.dismiss}>Questo avviso verrà inviato anche al genitore.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  headerText: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  divider: { height: 1, marginBottom: 10, opacity: 0.4 },
  title: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  body: {
    color: "#E5E7EB",
    fontSize: 13,
    lineHeight: 19,
  },
  reasonBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    opacity: 0.85,
  },
  reasonLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 2,
  },
  reasonText: { color: "#F9FAFB", fontSize: 13 },
  dismiss: {
    color: "#6B7280",
    fontSize: 11,
    marginTop: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
});
