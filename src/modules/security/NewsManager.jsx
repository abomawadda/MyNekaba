import React, { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import clsx from "clsx";
import { Megaphone, Plus, Trash2, X } from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { logAuditEvent } from "../../utils/auditLog";

export default function NewsManager() {
  const T = useT();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: "", body: "", date: new Date().toISOString().slice(0, 10), active: true });
  const [editingId, setEditingId] = useState("");
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "site_news"), orderBy("date", "desc")),
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      showToast("أدخل عنوان الخبر ونصه.", "error");
      return;
    }
    try {
      if (editingId) {
        await updateDoc(doc(db, "site_news", editingId), { ...form, updatedAt: serverTimestamp() });
        await logAuditEvent("site_news.updated", { targetId: editingId, page: "/security" });
      } else {
        const ref = await addDoc(collection(db, "site_news"), {
          ...form,
          createdAt: serverTimestamp(),
          createdAtIso: new Date().toISOString(),
        });
        await logAuditEvent("site_news.created", { targetId: ref.id, page: "/security" });
      }
      setForm({ title: "", body: "", date: new Date().toISOString().slice(0, 10), active: true });
      setEditingId("");
      showToast("تم حفظ الخبر.");
    } catch (e) {
      showToast(e.message || "تعذر الحفظ.", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("حذف هذا الخبر نهائياً؟")) return;
    try {
      await deleteDoc(doc(db, "site_news", id));
      await logAuditEvent("site_news.deleted", { targetId: id, riskLevel: "medium", page: "/security" });
      showToast("تم حذف الخبر.");
    } catch (e) {
      showToast(e.message || "تعذر الحذف.", "error");
    }
  };

  return (
    <section className={clsx("rounded-3xl border shadow-sm overflow-hidden", T.card)}>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-black flex items-center gap-2">
          <Megaphone size={16} className="text-amber-600" />
          أخبار وإعلانات الموقع العام
        </h2>
        <span className="text-[10px] font-black text-slate-400">{items.length} خبر</span>
      </div>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="عنوان الخبر" className={clsx("px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} />
        <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className={clsx("px-3 py-2.5 rounded-xl border text-xs font-bold", T.inp)} />
        <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} placeholder="نص الخبر..." rows={3} className={clsx("md:col-span-2 px-3 py-2.5 rounded-xl border text-xs font-bold resize-none", T.inp)} />
        <label className="flex items-center gap-2 text-xs font-black">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} className="w-4 h-4" />
          منشور للزوار
        </label>
        <div className="flex gap-2">
          {editingId && (
            <button onClick={() => { setEditingId(""); setForm({ title: "", body: "", date: new Date().toISOString().slice(0, 10), active: true }); }} className="px-4 py-2.5 rounded-xl border text-xs font-black">إلغاء</button>
          )}
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition-colors flex items-center justify-center gap-1.5">
            {editingId ? "حفظ التعديل" : <><Plus size={14} /> إضافة خبر</>}
          </button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((n) => (
          <div key={n.id} className="px-5 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black">{n.title} {!n.active && <span className="text-[9px] text-slate-400">(مخفي)</span>}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-0.5 truncate">{n.date || ""} — {(n.body || "").slice(0, 80)}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => { setEditingId(n.id); setForm({ title: n.title || "", body: n.body || "", date: n.date || "", active: n.active !== false }); }} className="p-2 rounded-lg bg-slate-100 text-[10px] font-black hover:bg-slate-200 transition-colors">تعديل</button>
              <button onClick={() => handleDelete(n.id)} className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
      {toast && (
        <div className={clsx("m-4 px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2", toast.type === "error" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-teal-50 text-teal-700 border border-teal-200")}>
          {toast.type === "error" ? <X size={14} /> : null}{toast.msg}
        </div>
      )}
    </section>
  );
}
