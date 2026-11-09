import React, { useEffect, useState } from "react";
import { Check, ClipboardList, LoaderCircle, X } from "lucide-react";
import { useAuth } from "../../app/providers/AuthProvider";
import { reviewBookingRequest, subscribePendingRequests } from "../portal/bookingRequestService";

/** Staff inbox for booking / service requests submitted from the member portal. */
export default function MemberRequestsPanel() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => subscribePendingRequests(setRequests), []);

  if (requests.length === 0) return null;

  const review = async (request, status) => {
    const note = status === "rejected" ? window.prompt("سبب الرفض (يظهر للعضو):", "") : "";
    if (note === null) return;
    setBusyId(request.id);
    setError("");
    try {
      await reviewBookingRequest(request.id, { status, reviewer: user, note });
    } catch (e) {
      setError(e?.message || "تعذر تحديث الطلب.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/20" dir="rtl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-black text-amber-800 dark:text-amber-300">
          <ClipboardList size={16} /> طلبات الأعضاء من البوابة ({requests.length})
        </h2>
        <p className="text-[10px] font-bold text-amber-700/80">بعد القبول أنشئ الحجز للعضو من نموذج الحجز أدناه.</p>
      </div>
      {error && <p className="mb-2 text-xs font-bold text-rose-600">{error}</p>}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {requests.map((r) => (
          <div key={r.id} className="rounded-2xl border border-amber-100 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="font-black">{r.targetTitle}</p>
            <p className="mt-1 text-[11px] font-bold text-slate-500">
              {r.memberName} • كود {r.memberId} {r.memberPhone ? `• ${r.memberPhone}` : ""}
            </p>
            <p className="mt-1 text-[10px] font-bold text-slate-400">
              {r.kind === "service" ? "طلب خدمة" : `الأفراد: ${r.totalPax}`} • {String(r.createdAtIso || "").slice(0, 10)}
            </p>
            {r.notes && <p className="mt-2 rounded-xl bg-slate-50 p-2 text-[11px] font-bold text-slate-600 dark:bg-slate-800">{r.notes}</p>}
            <div className="mt-3 flex gap-2">
              <button
                disabled={busyId === r.id}
                onClick={() => review(r, "approved")}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-emerald-600 py-2 text-[11px] font-black text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busyId === r.id ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} />} قبول
              </button>
              <button
                disabled={busyId === r.id}
                onClick={() => review(r, "rejected")}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 py-2 text-[11px] font-black text-rose-600 hover:bg-rose-50 disabled:opacity-60"
              >
                <X size={13} /> رفض
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
