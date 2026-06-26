import { useRouter } from "expo-router";
import { useEffect } from "react";

export default function MembershipPolicyRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/(admin)/membership" as never); }, [router]);
  return null;
}
