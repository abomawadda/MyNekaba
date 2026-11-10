import React, { useState } from "react";
import { Link } from "react-router-dom";
import { callAccounts, toLatinDigits } from "../../../lib/backend";
import { AuthShell, Field, Notice, SubmitButton } from "./AuthShell";

const digits = (v) => toLatinDigits(v).replace(/\D/g, "");

export default function SupabaseRecoveryPage() {
  const [form, setForm] = useState({ jobCode: "", nationalId: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!digits(form.jobCode) || digits(form.nationalId).length !== 14) {
      setError("أدخل الكود الوظيفي والرقم القومي (14 رقماً).");
      return;
    }
    setLoading(true);
    try {
      await callAccounts("recover", { jobCode: digits(form.jobCode), nationalId: digits(form.nationalId) });
      setSent(true);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="استعادة الحساب"
      title="نسيت كلمة المرور؟"
      subtitle="نتحقق من بياناتك ونرسل طلباً لإدارة النقابة لإعادة تعيين كلمة المرور."
      footer={<Link to="/login" className="font-black text-brand-700 hover:underline">العودة لتسجيل الدخول</Link>}
    >
      {sent ? (
        <Notice tone="emerald">
          إذا كانت البيانات مطابقة لحساب مسجل، فقد وصل طلبك للإدارة. ستتواصل معك النقابة بكلمة مرور مؤقتة، وسيُطلب منك تغييرها عند أول دخول.
        </Notice>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field label="الكود الوظيفي" inputMode="numeric" value={form.jobCode} onChange={(e) => setForm((p) => ({ ...p, jobCode: e.target.value }))} />
          <Field label="الرقم القومي" inputMode="numeric" maxLength={14} value={form.nationalId} onChange={(e) => setForm((p) => ({ ...p, nationalId: e.target.value }))} />
          {error && <Notice>{error}</Notice>}
          <SubmitButton loading={loading}>إرسال طلب الاستعادة</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
