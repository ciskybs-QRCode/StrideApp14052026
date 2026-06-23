import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

const { width, height } = Dimensions.get("window");

export default function SplashScreen() {
  const colors = useColors();
  const styles = make_styles(colors.primary, colors.secondary);
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const arcAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(arcAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(arcAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();

    const timer = setTimeout(() => {
      router.replace("/login");
    }, 2800);

    return () => clearTimeout(timer);
  }, []);

  const arcTranslateY = arcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Animated.View style={[styles.iconContainer, { transform: [{ translateY: arcTranslateY }] }]}>
          <View style={styles.arcOuter} />
          <View style={styles.arcMiddle} />
          <View style={styles.arcInner} />
        </Animated.View>
        <Text style={styles.title}>Stride</Text>
      </Animated.View>
      <Text style={styles.footer}>Powered by Stride Platform</Text>
    </View>
  );
}

const make_styles = (primary: string, secondary: string) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  iconContainer: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  arcOuter: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#E5E7EB",
    borderTopColor: secondary,
    borderRightColor: secondary,
    backgroundColor: "transparent",
    transform: [{ rotate: "-30deg" }],
  },
  arcMiddle: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 4,
    borderColor: "#E5E7EB",
    borderTopColor: primary,
    borderLeftColor: primary,
    backgroundColor: "transparent",
    transform: [{ rotate: "30deg" }],
  },
  arcInner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 4,
    borderColor: "#E5E7EB",
    borderBottomColor: secondary,
    borderRightColor: secondary,
    backgroundColor: "transparent",
    transform: [{ rotate: "60deg" }],
  },
  title: {
    fontSize: 48,
    fontWeight: "800",
    color: primary,
    fontStyle: "italic",
    letterSpacing: 2,
  },
  footer: {
    position: "absolute",
    bottom: 50,
    color: "rgba(30,58,138,0.3)",
    fontSize: 12,
  },
});
