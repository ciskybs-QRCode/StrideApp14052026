import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";

/**
 * Pick a profile photo and return it as a persistable `data:` URI.
 *
 * Why base64: on web (PWA), expo-image-picker returns an ephemeral `blob:` URI
 * that becomes invalid after a page reload, and expo-file-system cannot read it
 * to convert to base64. Requesting `base64` directly from the picker yields a
 * `data:` URI that works identically on web and native, survives app restarts,
 * and syncs across devices once persisted to the backend.
 *
 * Returns null if the user cancels or denies library permission.
 */
export async function pickAvatarDataUri(): Promise<string | null> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Please allow photo library access in Settings.");
      return null;
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.25,
    allowsEditing: true,
    aspect: [1, 1],
    base64: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  if (asset.base64) {
    const mime = asset.mimeType ?? "image/jpeg";
    return `data:${mime};base64,${asset.base64}`;
  }

  // Fallback (older native picker without base64): return the raw uri.
  // AuthContext.updateUser converts file:// → base64 via expo-file-system.
  return asset.uri;
}
