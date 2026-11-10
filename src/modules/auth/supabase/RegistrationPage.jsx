import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { callAccounts, toLatinDigits } from "../../../lib/backend";
import { AuthShell, Field, Notice, SubmitButton } from "./AuthShell";

const digits = (v) => toLatinDigits(v).replace(/\D/g, "");

export default function SupabaseRegistrationPage() {
  const [form, setForm] = useState({ jobCode: "", nationalId: "", phone: "", password: "", confirm: "" });
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdName, setCreatedName] = useState(null);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const errors = useMemo(() => {
    const p = form.password;
    return {
      jobCode: !digits(form.jobCode) ? "أدخل الكود الوظيفي (أرقام)." : "",
      nationalId: digits(form.nationalId).length !== 14 ? "الرقم القومي 14 رقماً." : "",
      phone: !/^01\d{9}$/.test(digits(form.phone)) ? "رقم هاتف مصري من 11 رقماً." : "",
      password: p.length < 8 ? "8 أحرف على الأقل." : !/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p) ? "يجب أن تحتوي على حروف وأرقام." : "",
      confirm: form.confirm !== p ? "كلمتا المرور غير متطابقتين." : "",
    };
  }, [form]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setTouched(true);
    setError("");
    if (Object.values(errors).some(Boolean) || loading) return;
    setLoading(true);
    try {
      const result = await callAccounts("register", {
        jobCode: digits(form.jobCode),
        nationalId: digits(form.nationalId),
        phone: digits(form.phone),
        password: form.password,
      });
      setCreatedName(result.name || "");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  if (createdName !== null) {
    return (
      <AuthShell eyebrow="تم استلام طلبك" title="حسابك قيد المراجعة">
        <div className="text-center">
          <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
          <p className="mt-4 text-sm font-black text-slate-900">مرحباً {createdName}</p>
          <p className="mt-2 text-xs font-semibold leading-6 text-slate-500">
            تم إنشاء حسابك وربطه بسجلك في النقابة. ستراجع الإدارة الطلب وتفعّل الحساب، وبعدها تدخل بكودك الوظيفي وكلمة المرور للحجز وطلب الخدمات.
          </p>
          <Link to="/login" className="mt-6 inline-block rounded-2xl bg-brand-600 px-6 py-3 text-xs font-black text-white hover:bg-brand-700">الذهاب لتسجيل الدخول</Link>
        </div>
      </AuthShell>
    );
  }

  const show = (key) => (touched ? errors[key] : "");

  return (
    <AuthShell
      eyebrow="حساب عضو جديد"
      title="إنشاء حساب"
      subtitle="نتحقق من بياناتك في سجلات النقابة ثم تعتمد الإدارة الحساب."
      footer={<Link to="/login" className="font-black text-brand-700 hover:underline">لديك حساب؟ سجّل الدخول</Link>}
    >
      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field label="الكود الوظيفي" inputMode="numeric" value={form.jobCode} onChange={set("jobCode")} error={show("jobCode")} hint="سيكون هو اسم الدخول" autoComplete="username" />
        <Field label="الرقم القومي" inputMode="numeric" maxLength={14} value={form.nationalId} onChange={set("nationalId")} error={show("nationalId")} />
        <Field label="رقم الهاتف" inputMode="tel" maxLength={11} value={form.phone} onChange={set("phone")} error={show("phone")} />
        <Field label="كلمة المرور" type="password" value={form.password} onChange={set("password")} error={show("password")} hint="8 أحرف على الأقل، حروف وأرقام" autoComplete="new-password" />
        <Field label="تأكيد كلمة المرور" type="password" value={form.confirm} onChange={set("confirm")} error={show("confirm")} autoComplete="new-password" />
        {error && <Notice>{error}</Notice>}
        <SubmitButton loading={loading}>إنشاء الحساب</SubmitButton>
      </form>
    </AuthShell>
  );
}
