import { StyleSheet, Text, TextInput, type TextStyle } from "react-native";

/**
 * Maps a resolved fontWeight to the matching loaded Montserrat variant.
 * Custom named fonts ignore the `fontWeight` style, so we must select the
 * correct face explicitly to preserve the visual weight hierarchy.
 */
function montserratFor(weight?: TextStyle["fontWeight"]): string {
  if (weight === "bold") return "Montserrat_700Bold";
  const w = typeof weight === "number" ? weight : parseInt(String(weight ?? "400"), 10);
  if (Number.isNaN(w)) return "Montserrat_400Regular";
  if (w >= 800) return "Montserrat_800ExtraBold";
  if (w >= 700) return "Montserrat_700Bold";
  if (w >= 600) return "Montserrat_600SemiBold";
  return "Montserrat_400Regular";
}

let applied = false;

/**
 * Installs Montserrat as the default app font for <Text> and <TextInput>.
 * Any element that already declares its own `fontFamily` is left untouched,
 * so deliberate overrides still win.
 */
export function applyGlobalFont(): void {
  if (applied) return;
  applied = true;

  for (const Comp of [Text, TextInput] as const) {
    const C = Comp as unknown as { render?: (...args: unknown[]) => unknown };
    const original = C.render;
    if (typeof original !== "function") continue;

    C.render = function patched(this: unknown, ...args: unknown[]) {
      const props = args[0] as { style?: unknown } | undefined;
      const flat = (StyleSheet.flatten(props?.style as TextStyle) ?? {}) as TextStyle;
      if (!flat.fontFamily) {
        const fontFamily = montserratFor(flat.fontWeight);
        args[0] = { ...(props ?? {}), style: [props?.style, { fontFamily }] };
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}
