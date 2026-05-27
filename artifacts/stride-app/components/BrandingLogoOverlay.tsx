/**
 * BrandingLogoOverlay
 *
 * Renders the org's dynamic logo at the top-left corner of any screen,
 * overlaid absolutely so it appears consistently above all content.
 *
 * Rules:
 * - Only renders when a logoUrl is set; shows nothing otherwise (no crash).
 * - Uses pointerEvents="none" so it never blocks taps on content beneath.
 * - Sized to fit within the status bar / header area without overflow.
 * - On image load failure, silently hides itself.
 */

import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBranding } from "@/context/BrandingContext";

interface Props {
  /** Extra horizontal offset from the left edge (default: 14) */
  leftOffset?: number;
  /** Extra vertical offset below the safe-area top (default: 8) */
  topOffset?: number;
  /** Height of the logo image (default: 34) */
  height?: number;
}

export function BrandingLogoOverlay({
  leftOffset = 14,
  topOffset  = 8,
  height     = 34,
}: Props) {
  const insets = useSafeAreaInsets();
  const { branding } = useBranding();
  const [failed, setFailed] = useState(false);

  if (!branding.logoUrl || failed) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFillObject,
        { zIndex: 500, pointerEvents: "none" },
      ]}
    >
      <Image
        source={{ uri: branding.logoUrl }}
        style={[
          styles.logo,
          {
            top:    insets.top + topOffset,
            left:   leftOffset,
            height,
            width:  height * 3,   // allow wide logos (3:1 aspect), contained
          },
        ]}
        resizeMode="contain"
        onError={() => setFailed(true)}
        accessibilityLabel="School logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    position: "absolute",
  },
});
