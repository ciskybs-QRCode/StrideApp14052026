import { NAVY, GOLD, BG, DANGER, SUCCESS } from "@/lib/theme";

const colors = {
  light: {
    text: NAVY,
    tint: NAVY,
    background: BG,
    foreground: NAVY,
    card: "#FFFFFF",
    cardForeground: NAVY,
    primary: NAVY,
    primaryForeground: "#FFFFFF",
    secondary: GOLD,
    secondaryForeground: NAVY,
    muted: `${NAVY}12`,
    mutedForeground: "#6B7080",
    accent: GOLD,
    accentForeground: NAVY,
    destructive: DANGER,
    destructiveForeground: "#FFFFFF",
    border: "#E2E8F0",
    input: `${NAVY}0A`,
    success: SUCCESS,
    warning: "#F59E0B",
    navyBlue: NAVY,
    goldenrod: GOLD,
    navyLight: `${NAVY}CC`,
    goldLight: `${GOLD}AA`,
    surface: "#FFFFFF",
    surfaceElevated: BG,
  },
  radius: 12,
};

export default colors;
