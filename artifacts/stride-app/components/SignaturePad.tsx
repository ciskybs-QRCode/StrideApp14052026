import React, { useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

interface SignaturePadProps {
  onHasSignatureChange: (has: boolean) => void;
  onSave?: (svgData: string) => void;
  strokeColor?: string;
  strokeWidth?: number;
}

export function SignaturePad({
  onHasSignatureChange,
  onSave,
  strokeColor = "#1E3A8A",
  strokeWidth = 3,
}: SignaturePadProps) {
  const [completedPaths, setCompletedPaths] = useState<string[]>([]);
  const currentPath = useRef("");
  const [drawTick, setDrawTick] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant(e) {
        const { locationX: x, locationY: y } = e.nativeEvent;
        currentPath.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        setDrawTick(t => t + 1);
      },
      onPanResponderMove(e) {
        const { locationX: x, locationY: y } = e.nativeEvent;
        currentPath.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        setDrawTick(t => t + 1);
      },
      onPanResponderRelease() {
        if (!currentPath.current) return;
        const done = currentPath.current;
        currentPath.current = "";
        setCompletedPaths(prev => {
          const next = [...prev, done];
          onHasSignatureChange(true);
          return next;
        });
        setDrawTick(t => t + 1);
      },
    })
  ).current;

  const handleClear = () => {
    setCompletedPaths([]);
    currentPath.current = "";
    onHasSignatureChange(false);
    setDrawTick(t => t + 1);
  };

  const handleConfirm = () => {
    if (!onSave || !completedPaths.length) return;
    const pathMarkup = completedPaths
      .map(
        d =>
          `<path d="${d}" stroke="${strokeColor}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join("\n");
    onSave(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="170" viewBox="0 0 400 170">\n${pathMarkup}\n</svg>`
    );
  };

  const isEmpty = completedPaths.length === 0 && !currentPath.current;

  return (
    <View style={styles.wrapper}>
      <View style={styles.canvas} {...panResponder.panHandlers}>
        <Svg style={StyleSheet.absoluteFillObject}>
          {completedPaths.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath.current ? (
            <Path
              key={`live-${drawTick}`}
              d={currentPath.current}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
        {isEmpty && (
          <View style={[styles.hint, { pointerEvents: "none" }]}>
            <Text style={styles.hintText}>✍️  Sign here with your finger</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.clearBtn,
            pressed && { opacity: 0.7 },
            isEmpty && styles.clearBtnDisabled,
          ]}
          onPress={handleClear}
          disabled={isEmpty}
        >
          <Text style={[styles.clearText, isEmpty && styles.clearTextDisabled]}>
            Reset
          </Text>
        </Pressable>

        {onSave ? (
          <Pressable
            style={({ pressed }) => [
              styles.confirmBtn,
              pressed && { opacity: 0.85 },
              isEmpty && styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirm}
            disabled={isEmpty}
          >
            <Text style={[styles.confirmText, isEmpty && styles.confirmTextDisabled]}>
              ✓ Confirm Signature
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  canvas: {
    height: 170,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#93C5FD",
    backgroundColor: "#F0F6FF",
    overflow: "hidden",
    marginBottom: 10,
    cursor: "crosshair" as "auto",
  },
  hint: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hintText: {
    fontSize: 15,
    color: "#93C5FD",
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  clearBtnDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  clearText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  clearTextDisabled: {
    color: "#D1D5DB",
  },
  confirmBtn: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#1E3A8A",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnDisabled: {
    backgroundColor: "#E2E8F0",
  },
  confirmText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFF",
  },
  confirmTextDisabled: {
    color: "#94A3B8",
  },
});
