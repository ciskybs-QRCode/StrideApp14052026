import { useContext } from "react";
import { useColorScheme } from "react-native";

import { AuthContext } from "@/context/AuthContext";
import { BrandingContext } from "@/context/BrandingContext";
import colors from "@/constants/colors";

/**
 * Resolves the active colour palette.
 *
 * Priority (highest → lowest):
 *   1. BrandingContext — org-level white-label colours saved by Admin
 *   2. user.primaryColor / user.secondaryColor — per-user overrides
 *   3. constants/colors.ts defaults (Navy Blue / Goldenrod)
 */
export function useColors() {
  const scheme   = useColorScheme();
  const auth     = useContext(AuthContext);
  const branding = useContext(BrandingContext);

  const user = auth?.user;

  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as Record<string, typeof colors.light>).dark
      : colors.light;

  return {
    ...palette,
    primary:   branding?.branding.primaryColor   ?? user?.primaryColor   ?? palette.primary,
    secondary: branding?.branding.secondaryColor ?? user?.secondaryColor ?? palette.secondary,
    radius:    colors.radius,
  };
}
