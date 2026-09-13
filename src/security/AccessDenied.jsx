import React from "react";
import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function AccessDenied({
  title = "لا تملك صلاحية الوصول",
  message = "هذا الجزء من النظام محمي حسب الدور المخصص لحسابك.",
}) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
      <div className="w-full max-w-lg rounded-[28px] border border-rose-200 bg-white p-8 shadow-[0_20px_50px_rgba(15,23,42,0.08)] text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
          <ShieldAlert size={28} />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm font-bold text-slate-500 leading-7">{message}</p>
        </div>
        <div className="flex justify-center gap-2">
          <Link
            to="/dashboardpage"
            className="px-5 py-3 rounded-2xl bg-teal-600 text-white text-sm font-black hover:bg-teal-700 transition-colors"
          >
            العودة إلى الرئيسية
          </Link>
          <Link
            to="/security"
            className="px-5 py-3 rounded-2xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-50 transition-colors"
          >
            مركز الأمان
          </Link>
        </div>
      </div>
    </div>
  );
}
