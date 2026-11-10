import { createClient } from "@supabase/supabase-js";

/**
 * Backend switch for the Firebase -> Supabase migration.
 * VITE_BACKEND=supabase runs the migrated modules against Supabase; anything else keeps Firebase.
 */
export const USE_SUPABASE = import.meta.env.VITE_BACKEND === "supabase";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigError = USE_SUPABASE && (!url || !key)
  ? "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY غير مضبوطة."
  : "";

export const supabase = USE_SUPABASE && url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

const MEMBER_DOMAIN = "member.mynekaba.internal";
const STAFF_DOMAIN = "staff.mynekaba.internal";

export const toLatinDigits = (value = "") =>
  String(value ?? "")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));

/**
 * Supabase Auth needs an email. Members sign in with their job code and staff with a username,
 * so both map deterministically to an internal alias address (no lookup => no account enumeration).
 */
export function loginIdentifierToEmail(identifier = "") {
  const value = toLatinDigits(identifier).trim().toLowerCase();
  if (!value) return "";
  if (value.includes("@")) return value;
  if (/^\d+$/.test(value)) return `${value}@${MEMBER_DOMAIN}`;
  return `${value.replace(/\s+/g, "")}@${STAFF_DOMAIN}`;
}

/** Calls the `accounts` edge function and throws an Error carrying the Arabic message on failure. */
export async function callAccounts(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("accounts", { body: { action, ...payload } });
  if (error) {
    let message = "تعذر تنفيذ العملية. حاول مرة أخرى.";
    let code = "request_failed";
    try {
      const body = await error.context?.json?.();
      if (body?.message) message = body.message;
      if (body?.code) code = body.code;
    } catch { /* keep generic message */ }
    const err = new Error(message);
    err.code = code;
    throw err;
  }
  if (data?.ok === false) throw new Error(data.message || "تعذر تنفيذ العملية.");
  return data;
}
