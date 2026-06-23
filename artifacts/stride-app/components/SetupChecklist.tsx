import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STORAGE_KEY = "stride_setup_checklist_v1";

interface ChecklistItem {
  id: string;
  icon: string;
  title: string;
  desc: string;
  route: string;
}

const ITEMS: ChecklistItem[] = [
  {
    id: "brand",
    icon: "color-palette-outline",
    title: "Brand your association",
    desc: "Upload logo, set colors & welcome message",
    route: "/(admin)/setup",
  },
  {
    id: "operator",
    icon: "person-add-outline",
    title: "Invite your first operator",
    desc: "Add staff who manage day-to-day activities",
    route: "/(admin)/users",
  },
  {
    id: "discipline",
    icon: "musical-notes-outline",
    title: "Create a discipline or course",
    desc: "Set up your first class or activity",
    route: "/(admin)/disciplines",
  },
  {
    id: "payment",
    icon: "card-outline",
    title: "Set up payments",
    desc: "Connect Stripe to start collecting fees",
    route: "/(admin)/billing/stripe-connect",
  },
  {
    id: "legal",
    icon: "document-text-outline",
    title: "Upload your legal documents",
    desc: "Terms, Privacy Policy & Media Release",
    route: "/(admin)/settings/legal-privacy",
  },
];

export function SetupChecklist() {
  const router = useRouter();
  const colors = useColors();
  const { user } = useAuth();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => {
        if (val) setDone(JSON.parse(val));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggle = useCallback((id: string) => {
    setDone(prev => {
      const next = { ...prev, [id]: !prev[id] };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const navigate = useCallback(
    (item: ChecklistItem) => {
      if (!done[item.id]) toggle(item.id);
      router.push(item.route as never);
    },
    [done, toggle, router],
  );

  if (!loaded) return null;

  // Super-admin without an association: no setup checklist
  if (user?.role === "super_admin" && (user?.orgId === 0 || !user?.orgId)) return null;

  const doneCount = ITEMS.filter(i => done[i.id]).length;
  if (doneCount === ITEMS.length) return null;

  const pct = doneCount / ITEMS.length;

  return (
    <View
      style={{
        marginBottom: 14,
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: ("#FBBF24" + "50"),
      }}
    >
      {/* ── Collapsed header bar ── */}
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpanded(e => !e);
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: "#FFFBEB",
          padding: 12,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="checkmark-done-circle-outline" size={20} color={colors.secondary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400E" }}>
            Association setup — {doneCount}/{ITEMS.length} complete
          </Text>
          <View
            style={{
              height: 3,
              backgroundColor: "#FDE68A",
              borderRadius: 4,
              marginTop: 5,
            }}
          >
            <View
              style={{
                height: 3,
                width: `${pct * 100}%` as `${number}%`,
                backgroundColor: "#FBBF24",
                borderRadius: 4,
              }}
            />
          </View>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#D4AF37" />
      </Pressable>

      {/* ── Expanded list ── */}
      {expanded && (
        <View style={{ backgroundColor: "#FFFDF4" }}>
          {ITEMS.map((item, idx) => {
            const isDone = !!done[item.id];
            return (
              <View
                key={item.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  gap: 10,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: "#FDE68A30",
                }}
              >
                {/* manual checkbox */}
                <Pressable
                  onPress={() => toggle(item.id)}
                  hitSlop={8}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: isDone ? "#10B981" : "#D4AF37",
                    backgroundColor: isDone ? "#10B981" : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isDone && <Ionicons name="checkmark" size={13} color="#FFF" />}
                </Pressable>

                {/* icon */}
                <Ionicons name={item.icon as never} size={16} color={isDone ? "#9CA3AF" : "#D4AF37"} />

                {/* text */}
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: isDone ? "#9CA3AF" : "#92400E",
                      textDecorationLine: isDone ? "line-through" : "none",
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: isDone ? "#D1D5DB" : "#B45309",
                      marginTop: 1,
                    }}
                  >
                    {item.desc}
                  </Text>
                </View>

                {/* Go button — hidden when done */}
                {!isDone && (
                  <Pressable
                    onPress={() => navigate(item)}
                    hitSlop={4}
                    style={({ pressed }) => ({
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      backgroundColor: "#FBBF24",
                      borderRadius: 8,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#78350F" }}>
                      Go →
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {/* footer hint */}
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopWidth: 1,
              borderTopColor: "#FDE68A30",
            }}
          >
            <Text style={{ fontSize: 10, color: "#B45309", textAlign: "center", lineHeight: 14 }}>
              Tap "Go →" to open a section · tap the circle to mark an item done manually
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
