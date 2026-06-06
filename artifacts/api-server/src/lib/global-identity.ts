import { supabaseAdmin } from "./supabase.js";

interface Log {
  warn(obj: object, msg: string): void;
}

export async function resolveGlobalUserId(
  email: string,
  name: string,
  orgId: number,
  role: string,
  log?: Log,
): Promise<number | null> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const parts = name.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.length > 1 ? parts.slice(1).join(" ") : firstName;

    let globalUserId: number | null = null;

    const { data: existing } = await supabaseAdmin
      .from("global_users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      globalUserId = existing.id as number;
    } else {
      const { data: created, error: createErr } = await supabaseAdmin
        .from("global_users")
        .insert({ first_name: firstName, last_name: lastName, email: normalizedEmail })
        .select("id")
        .single();

      if (createErr || !created) {
        // Race condition: another request inserted first — retry lookup
        const { data: retry } = await supabaseAdmin
          .from("global_users")
          .select("id")
          .eq("email", normalizedEmail)
          .maybeSingle();
        globalUserId = retry ? (retry.id as number) : null;
      } else {
        globalUserId = created.id as number;
      }
    }

    if (globalUserId === null) return null;

    await supabaseAdmin.from("tenant_memberships").upsert(
      {
        global_user_id: globalUserId,
        organization_id: orgId,
        status: "active",
        role,
        activated_at: new Date().toISOString(),
      },
      { onConflict: "global_user_id,organization_id", ignoreDuplicates: true },
    );

    return globalUserId;
  } catch (err) {
    log?.warn({ err }, "[global-identity] resolveGlobalUserId failed — non-critical");
    return null;
  }
}
