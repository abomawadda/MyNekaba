// Account flows: public (register, recover) and admin (list, approve, reject, set-role,
// set-status, link-member, reset-password, create-staff). Uses the service role internally;
// admin actions verify the caller's JWT and require an active admin profile.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MEMBER_DOMAIN = "member.mynekaba.internal";
const STAFF_DOMAIN = "staff.mynekaba.internal";
const ROLES = ["admin", "treasurer", "dataEntry", "auditor", "viewer", "member"];
const MAX_ATTEMPTS_PER_HOUR = 5;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const fail = (message: string, status = 400, code = "bad_request") => json({ ok: false, code, message }, status);

const digits = (v: unknown) =>
  String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/\D/g, "");

function passwordProblem(password: string, forbidden: string[]): string {
  if (typeof password !== "string" || password.length < 8) return "كلمة المرور يجب ألا تقل عن 8 أحرف.";
  if (password.length > 72) return "كلمة المرور طويلة جداً.";
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/\d/.test(password)) return "كلمة المرور يجب أن تحتوي على حروف وأرقام.";
  if (forbidden.some((f) => f && password.includes(f))) return "كلمة المرور لا يجب أن تحتوي على كودك الوظيفي أو رقمك القومي أو هاتفك.";
  return "";
}

function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + "7a";
}

async function tooManyAttempts(kind: string, subject: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind).eq("subject", subject).eq("ok", false).gte("created_at", since);
  return (count ?? 0) >= MAX_ATTEMPTS_PER_HOUR;
}
const recordAttempt = (kind: string, subject: string, ok: boolean) =>
  admin.from("auth_attempts").insert({ kind, subject, ok });

const audit = (actor_id: string | null, action: string, target_id: string | null, risk_level = "low", details = {}) =>
  admin.from("audit_logs").insert({ actor_id, action, target_id, risk_level, details, page: "fn:accounts" });

async function findMember(jobCode: string, nationalId: string) {
  const { data } = await admin
    .from("members").select("id, name, job_id, national_id, phone")
    .eq("job_id", jobCode).maybeSingle();
  if (!data || digits(data.national_id) !== nationalId) return null;
  return data;
}

// ---------------- public: register ----------------
async function register(body: Record<string, unknown>, ip: string) {
  const jobCode = digits(body.jobCode), nationalId = digits(body.nationalId), phone = digits(body.phone);
  const password = String(body.password ?? "");
  if (!jobCode || nationalId.length !== 14 || !/^01\d{9}$/.test(phone)) return fail("راجع البيانات المدخلة.");
  const problem = passwordProblem(password, [jobCode, nationalId, phone]);
  if (problem) return fail(problem, 400, "weak_password");

  if (await tooManyAttempts("register", jobCode) || await tooManyAttempts("register", `ip:${ip}`)) {
    return fail("محاولات كثيرة. حاول مرة أخرى بعد ساعة.", 429, "rate_limited");
  }
  const member = await findMember(jobCode, nationalId);
  if (!member) {
    await recordAttempt("register", jobCode, false);
    await recordAttempt("register", `ip:${ip}`, false);
    await audit(null, "account.register_verify_failed", jobCode, "medium");
    return fail("البيانات غير مطابقة لسجلات النقابة. راجع الكود الوظيفي والرقم القومي.", 400, "no_match");
  }
  const { data: existing } = await admin.from("profiles").select("id").eq("member_id", member.id).maybeSingle();
  if (existing) return fail("يوجد حساب مسجل لهذا العضو بالفعل. استخدم تسجيل الدخول أو استعادة الحساب.", 409, "exists");

  const { data: created, error } = await admin.auth.admin.createUser({
    email: `${jobCode}@${MEMBER_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { display_name: member.name },
  });
  if (error || !created?.user) {
    if (/already/i.test(error?.message ?? "")) return fail("يوجد حساب بهذا الكود بالفعل.", 409, "exists");
    return fail("تعذر إنشاء الحساب. حاول لاحقاً.", 500, "create_failed");
  }
  const { error: linkError } = await admin.from("profiles").update({
    member_id: member.id, username: jobCode, display_name: member.name, phone,
    role: "member", account_status: "pending_approval",
  }).eq("id", created.user.id);
  if (linkError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail("تعذر إنشاء الحساب. حاول لاحقاً.", 500, "link_failed");
  }
  await recordAttempt("register", jobCode, true);
  await audit(created.user.id, "account.registered", created.user.id, "medium");
  return json({ ok: true, name: member.name });
}

// ---------------- public: recovery request ----------------
async function recover(body: Record<string, unknown>, ip: string) {
  const jobCode = digits(body.jobCode), nationalId = digits(body.nationalId);
  if (!jobCode || nationalId.length !== 14) return fail("راجع البيانات المدخلة.");
  if (await tooManyAttempts("recover", jobCode) || await tooManyAttempts("recover", `ip:${ip}`)) {
    return fail("محاولات كثيرة. حاول مرة أخرى بعد ساعة.", 429, "rate_limited");
  }
  // Same answer whether or not it matched, so the form cannot be used to probe records.
  const generic = json({ ok: true });
  const member = await findMember(jobCode, nationalId);
  if (!member) {
    await recordAttempt("recover", jobCode, false);
    await recordAttempt("recover", `ip:${ip}`, false);
    return generic;
  }
  const { data: profile } = await admin.from("profiles").select("id").eq("member_id", member.id).maybeSingle();
  if (profile) {
    await admin.from("recovery_requests").insert({ profile_id: profile.id }); // unique index ignores duplicates
    await audit(profile.id, "account.recovery_requested", profile.id, "medium");
  }
  await recordAttempt("recover", jobCode, true);
  return generic;
}

// ---------------- admin ----------------
async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (!data?.user) return null;
  const { data: profile } = await admin.from("profiles").select("id, role, account_status").eq("id", data.user.id).maybeSingle();
  return profile && profile.role === "admin" && profile.account_status === "active" ? profile : null;
}

async function adminAction(action: string, body: Record<string, unknown>, actorId: string) {
  const profileId = String(body.profileId ?? "");

  if (action === "list") {
    const [{ data: profiles }, { data: recoveries }] = await Promise.all([
      admin.from("profiles")
        .select("id, role, account_status, username, display_name, phone, title, member_id, must_change_password, created_at, members(name, job_id, membership_status)")
        .order("created_at", { ascending: false }).limit(1000),
      admin.from("recovery_requests").select("id, profile_id, created_at").eq("status", "pending"),
    ]);
    return json({ ok: true, profiles: profiles ?? [], recoveries: recoveries ?? [] });
  }

  if (action === "create-staff") {
    const username = String(body.username ?? "").trim().toLowerCase();
    const displayName = String(body.displayName ?? "").trim().slice(0, 120);
    const role = String(body.role ?? "");
    if (!/^[a-z][a-z0-9._-]{2,30}$/.test(username)) return fail("اسم المستخدم: حروف إنجليزية وأرقام، من 3 إلى 31 حرفاً، ويبدأ بحرف.");
    if (!displayName || !ROLES.includes(role) || role === "member") return fail("أدخل الاسم واختر دوراً إدارياً.");
    const password = tempPassword();
    const { data: created, error } = await admin.auth.admin.createUser({
      email: `${username}@${STAFF_DOMAIN}`, password, email_confirm: true, user_metadata: { display_name: displayName },
    });
    if (error || !created?.user) return fail(/already/i.test(error?.message ?? "") ? "اسم المستخدم مستخدم بالفعل." : "تعذر إنشاء الحساب.", 409);
    await admin.from("profiles").update({
      username, display_name: displayName, role, account_status: "active", must_change_password: true,
      approved_by: actorId, approved_at: new Date().toISOString(),
    }).eq("id", created.user.id);
    await audit(actorId, "account.staff_created", created.user.id, "high", { role });
    return json({ ok: true, tempPassword: password });
  }

  if (!profileId) return fail("الحساب غير محدد.");
  const { data: target } = await admin.from("profiles").select("id, role, account_status").eq("id", profileId).maybeSingle();
  if (!target) return fail("الحساب غير موجود.", 404);
  const isSelf = profileId === actorId;

  if (action === "approve") {
    await admin.from("profiles").update({ account_status: "active", approved_by: actorId, approved_at: new Date().toISOString() }).eq("id", profileId);
    await audit(actorId, "account.approved", profileId, "medium");
    return json({ ok: true });
  }
  if (action === "reject") {
    if (target.account_status !== "pending_approval") return fail("يمكن رفض الحسابات قيد المراجعة فقط.");
    await admin.auth.admin.deleteUser(profileId); // cascades to profile
    await audit(actorId, "account.rejected", profileId, "medium");
    return json({ ok: true });
  }
  if (action === "set-status") {
    const status = String(body.status ?? "");
    if (!["active", "suspended"].includes(status)) return fail("حالة غير صالحة.");
    if (isSelf) return fail("لا يمكنك إيقاف حسابك.");
    await admin.from("profiles").update({ account_status: status }).eq("id", profileId);
    if (status === "suspended") await admin.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });
    else await admin.auth.admin.updateUserById(profileId, { ban_duration: "none" });
    await audit(actorId, `account.${status}`, profileId, "high");
    return json({ ok: true });
  }
  if (action === "set-role") {
    const role = String(body.role ?? "");
    if (!ROLES.includes(role)) return fail("دور غير صالح.");
    if (isSelf) return fail("لا يمكنك تغيير دورك.");
    await admin.from("profiles").update({ role }).eq("id", profileId);
    await audit(actorId, "account.role_changed", profileId, "high", { from: target.role, to: role });
    return json({ ok: true });
  }
  if (action === "link-member") {
    const jobCode = digits(body.jobCode);
    const { data: member } = await admin.from("members").select("id, name").eq("job_id", jobCode).maybeSingle();
    if (!member) return fail("لا يوجد عضو بهذا الكود الوظيفي.", 404);
    const { data: taken } = await admin.from("profiles").select("id").eq("member_id", member.id).neq("id", profileId).maybeSingle();
    if (taken) return fail("هذا العضو مرتبط بحساب آخر.", 409);
    await admin.from("profiles").update({ member_id: member.id }).eq("id", profileId);
    await audit(actorId, "account.member_linked", profileId, "high", { member_id: member.id });
    return json({ ok: true, memberName: member.name });
  }
  if (action === "reset-password") {
    const password = tempPassword();
    const { error } = await admin.auth.admin.updateUserById(profileId, { password });
    if (error) return fail("تعذر إعادة تعيين كلمة المرور.", 500);
    await admin.from("profiles").update({ must_change_password: true }).eq("id", profileId);
    await admin.from("recovery_requests").update({ status: "done", handled_by: actorId, handled_at: new Date().toISOString() })
      .eq("profile_id", profileId).eq("status", "pending");
    await audit(actorId, "account.password_reset", profileId, "high");
    return json({ ok: true, tempPassword: password });
  }
  return fail("إجراء غير معروف.", 404);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Method not allowed", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("Invalid JSON"); }
  const action = String(body.action ?? "");
  const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  try {
    if (action === "register") return await register(body, ip);
    if (action === "recover") return await recover(body, ip);
    const actor = await requireAdmin(req);
    if (!actor) return fail("غير مصرح.", 403, "forbidden");
    return await adminAction(action, body, actor.id);
  } catch (e) {
    console.error("accounts fn error", e);
    return fail("حدث خطأ غير متوقع.", 500, "internal");
  }
});
