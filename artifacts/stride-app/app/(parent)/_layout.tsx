import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import React, { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "@/context/AppDataContext";
import { useRealtime } from "@/context/RealtimeContext";
import { useColors } from "@/hooks/useColors";
import { BrandingLogoOverlay } from "@/components/BrandingLogoOverlay";
import { SecurityAlarmOverlay } from "@/components/SecurityAlarmOverlay";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useTerminology } from "@/context/TerminologyContext";
import { useUnread } from "@/context/UnreadContext";

function DocsTabIcon({ color, size }: { color: string; size: number }) {
  const { hasUnreadDocs } = useUnread();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name="settings-sharp" size={size} color={color} />
      {hasUnreadDocs && (
        <View style={{
          position: "absolute",
          top: -3,
          right: -6,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: "#FBBF24",
          borderWidth: 1.5,
          borderColor: "#FFFFFF",
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
          position: "absolute",
          top: -4,
          right: -8,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: "#FBBF24",
          borderWidth: 2,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 2,
        }}>
          <Text style={{ color: "#1E3A8A", fontSize: 8, fontWeight: "800", lineHeight: 12 }}>
            {count > 9 ? "9+" : String(count)}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ParentTabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { cartBadgeCount } = useRealtime();
  const { legalAdminDocs, signedAdminDocIds, signAdminDoc } = useAppData();
  const { secondaryRoleName } = useTerminology();
  const [signingDoc, setSigningDoc] = useState<string | null>(null);

  const unsignedMandatoryDocs = legalAdminDocs.filter(
    d => d.mandatorySignature && !signedAdminDocIds.includes(d.id)
  );
  const blocked = unsignedMandatoryDocs.length > 0;

  const handleSign = async (id: string) => {
    setSigningDoc(id);
    await signAdminDoc(id);
    setSigningDoc(null);
  };

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
        <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
        <Tabs.Screen name="children" options={{ title: "Members", tabBarIcon: ({ color, size }) => <Ionicons name="people-circle-outline" size={size} color={color} /> }} />
        <Tabs.Screen name="courses" options={{ title: "Courses", tabBarIcon: ({ color, size }) => <Ionicons name="musical-notes" size={size} color={color} /> }} />
        <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: ({ color, size }) => <Ionicons name="wallet" size={size} color={color} /> }} />
        <Tabs.Screen name="cart" options={{ title: "Cart", tabBarIcon: ({ color, size }) => <CartTabIcon color={color} size={size} count={cartBadgeCount} /> }} />
        <Tabs.Screen name="documents" options={{ title: "Settings", tabBarIcon: ({ color, size }) => <DocsTabIcon color={color} size={size} /> }} />
        <Tabs.Screen name="checkout" options={{ href: null }} />
        <Tabs.Screen name="book-lesson" options={{ href: null }} />
        <Tabs.Screen name="alerts" options={{ href: null }} />
      </Tabs>

      <SecurityAlarmOverlay alertsRoute="/(parent)/alerts" />
      <RoleSwitcher />
      <BrandingLogoOverlay />

      {/* Mandatory signature blocking overlay */}
      <Modal visible={blocked} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[styles.blockCard, { backgroundColor: colors.card }]}>
            <View style={[styles.lockIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="lock-closed" size={32} color="#FFF" />
            </View>
            <Text style={[styles.blockTitle, { color: colors.primary }]}>Signature Required</Text>
            <Text style={[styles.blockSubtitle, { color: colors.mutedForeground }]}>
              Please read and sign the following documents to access the app.
            </Text>

            <ScrollView style={{ width: "100%", maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {unsignedMandatoryDocs.map(doc => {
                const isSigning = signingDoc === doc.id;
                return (
                  <View key={doc.id} style={[styles.docItem, { borderColor: colors.border }]}>
                    <View style={[styles.docIconBox, { backgroundColor: doc.highPriority ? "#FEE2E2" : "#EDE9FE" }]}>
                      <Ionicons name={doc.highPriority ? "alert-circle" : "document-text-outline"} size={20} color={doc.highPriority ? "#EF4444" : "#7C3AED"} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docTitle, { color: colors.foreground }]}>{doc.title}</Text>
                      {doc.description ? (
                        <Text style={[styles.docDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{doc.description}</Text>
                      ) : null}
                      {doc.highPriority && (
                        <View style={styles.highPriorityBadge}>
                          <Ionicons name="alert-circle" size={10} color="#EF4444" />
                          <Text style={styles.highPriorityText}>High Priority</Text>
                        </View>
                      )}
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.signBtn, { backgroundColor: isSigning ? "#D1FAE5" : colors.primary, opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => handleSign(doc.id)}
                      disabled={isSigning}
                    >
                      <Ionicons name={isSigning ? "checkmark-circle" : "pencil"} size={14} color="#FFF" />
                      <Text style={styles.signBtnText}>{isSigning ? "Signed!" : "Sign"}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

            <View style={[styles.progressRow]}>
              <View style={[styles.progressBar, { backgroundColor: colors.muted }]}>
                <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${((legalAdminDocs.filter(d => d.mandatorySignature).length - unsignedMandatoryDocs.length) / legalAdminDocs.filter(d => d.mandatorySignature).length) * 100}%` as `${number}%` }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.mutedForeground }]}>
                {legalAdminDocs.filter(d => d.mandatorySignature).length - unsignedMandatoryDocs.length} / {legalAdminDocs.filter(d => d.mandatorySignature).length} signed
              </Text>
            </View>

            <Text style={[styles.blockNote, { color: colors.mutedForeground }]}>
              You must sign all mandatory documents before accessing the app. Contact your school for more information.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center", padding: 24 },
  blockCard: { width: "100%", maxWidth: 400, borderRadius: 24, padding: 28, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  lockIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  blockTitle: { fontSize: 22, fontWeight: "800", marginBottom: 8, textAlign: "center" },
  blockSubtitle: { fontSize: 14, textAlign: "center", marginBottom: 20, lineHeight: 20 },
  docItem: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderWidth: 1.5, borderRadius: 14, padding: 12, marginBottom: 10, width: "100%" },
  docIconBox: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docTitle: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  docDesc: { fontSize: 12, lineHeight: 16 },
  highPriorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  highPriorityText: { fontSize: 10, fontWeight: "700", color: "#EF4444" },
  signBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  signBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  progressRow: { width: "100%", flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 12 },
  progressBar: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  progressText: { fontSize: 12, fontWeight: "600" },
  blockNote: { fontSize: 11, textAlign: "center", lineHeight: 16 },
});
