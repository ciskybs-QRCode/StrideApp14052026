import { useContext } from "react";
import { useColorScheme } from "react-native";

import { AuthContext } from "@/context/AuthContext";
import colors from "@/constants/colors";

export function useColors() {
  const scheme = useColorScheme();
  const auth = useContext(AuthContext);
  const user = auth?.user;

  const palette =
    scheme === "dark" && "dark" in colors
      ? (colors as Record<string, typeof colors.light>).dark
      : colors.light;

  return {
    ...palette,
    primary: user?.primaryColor || palette.primary,
    secondary: user?.secondaryColor || palette.secondary,
    radius: colors.radius,
  };
}
