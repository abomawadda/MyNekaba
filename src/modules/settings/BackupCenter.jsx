import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, doc, getDocs, serverTimestamp, setDoc, writeBatch,
} from "firebase/firestore";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Download, History, ShieldCheck, Upload } from "lucide-react";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { logAuditEvent } from "../../utils/auditLog";

const BACKUP_COLLECTIONS = [
  "employees",
  "issued_checks",
  "transactions",
  "user_accounts",
  "board_terms",
  "board_memberships",
  "board_candidates",
  "board_movements",
  "board_benefits",
  "board_meetings",
  "events",
  "event_bookings",
  "member_benefits",
  "member_movements",
  "audit_logs",
];

const BACKUP_SETTINGS_ID = "backup";
const BATCH_SIZE = 400;

const freqLabel = (freq = "weekly") =>
  freq === "daily" ? "يومي" : freq === "monthly" ? "شهري" : "أسبوعي";

const isDue = (settings) => {
  if (!settings?.autoEnabled) return false;
  if (!settings?.lastBackupAt) return true;
  const last = new Date(settings.lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  const days = settings.frequency === "daily" ? 1 : settings.frequency === "monthly" ? 30 : 7;
  return Date.now() - last > days * 24 * 60 * 60 * 1000;
};

export default function BackupCenter() {
  const T = useT();
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [settings, setSettings] = useState({ autoEnabled: true, frequency: "weekly", lastBackupAt: "", lastBackupBy: "" });
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "settings"));
        const found = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((d) => d.id === BACKUP_SETTINGS_ID);
        if (alive && found) {
          setSettings({
            autoEnabled: found.autoEnabled !== false,
            frequency: found.frequency || "weekly",
            lastBackupAt: found.lastBackupAt || "",
            lastBackupBy: found.lastBackupBy || "",
          });
        }
      } catch {
        // offline — keep defaults
      }
    })();
    return () => { alive = false; };
  }, []);

  const due = useMemo(() => isDue(settings), [settings]);

  const saveSettings = async (next) => {
    setSettings(next);
    try {
      await setDoc(doc(db, "settings", BACKUP_SETTINGS_ID), {
        ...next,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      // offline
    }
  };

  const stampSettings = async (by) => {
    const next = { ...settings, lastBackupAt: new Date().toISOString(), lastBackupBy: by || "" };
    await saveSettings(next);
  };

  const handleExport = async () => {
    setBusy("export");
    setResult(null);
    try {
      const data = { version: 1, exportedAt: new Date().toISOString(), exportedBy: user?.fullName || user?.id || "", collections: {} };
      for (const name of BACKUP_COLLECTIONS) {
        const snap = await getDocs(collection(db, name));
        data.collections[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nekaba-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const total = Object.values(data.collections).reduce((s, arr) => s + arr.length, 0);
      await stampSettings(user?.fullName || user?.id || "");
      await logAuditEvent("backup.export", { totalDocs: total, riskLevel: "medium" });
      setResult({ ok: true, msg: `تم تنزيل نسخة احتياطية (${total} مستند في ${BACKUP_COLLECTIONS.length} مجموعة). احفظ الملف في مكان آمن — يحتوي بيانات حساسة.` });
    } catch (e) {
      setResult({ ok: false, msg: `فشل التصدير: ${e.message || ""}` });
    } finally {
      setBusy("");
    }
  };

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed?.collections) throw new Error("ملف غير صالح.");
      const counts = Object.fromEntries(
        Object.entries(parsed.collections).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
      );
      setPreview({ fileName: file.name, exportedAt: parsed.exportedAt || "", counts, data: parsed });
      setResult(null);
    } catch {
      setResult({ ok: false, msg: "تعذر قراءة الملف — تأكد أنه نسخة احتياطية صالحة." });
    }
  };

  const handleRestore = async () => {
    if (!preview?.data || !isAdmin) return;
    if (!window.confirm("سيتم دمج بيانات النسخة في القاعدة الحالية (دمج وليس مسحاً). متابعة؟")) return;
    setBusy("restore");
    try {
      let written = 0;
      for (const [name, docs] of Object.entries(preview.data.collections || {})) {
        if (!BACKUP_COLLECTIONS.includes(name) || !Array.isArray(docs)) continue;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          docs.slice(i, i + BATCH_SIZE).forEach((item) => {
            const { id, ...fields } = item || {};
            if (!id) return;
            batch.set(doc(db, name, String(id)), fields, { merge: true });
            written += 1;
          });
          await batch.commit();
        }
      }
      await logAuditEvent("backup.restore", {
        fileName: preview.fileName,
        writtenDocs: written,
        riskLevel: "high",
      });
      setPreview(null);
      setResult({ ok: true, msg: `تمت الاستعادة ودمج ${written} مستند بنجاح.` });
    } catch (e) {
      setResult({ ok: false, msg: `فشلت الاستعادة: ${e.message || ""}` });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className={clsx("max-w-5xl mx-auto space-y-5 pb-20 animate-in fade-in duration-500", T.text)} dir="rtl">
      <div className={clsx("p-5 rounded-2xl border shadow-sm", T.card)}>
        <h1 className="text-xl font-black flex items-center gap-2"><ShieldCheck size={20} className="text-teal-600" /> النسخ الاحتياطي</h1>
        <p className={clsx("text-xs font-bold mt-1", T.muted)}>تصدير كامل للمجموعات ({BACKUP_COLLECTIONS.length}) بصيغة JSON + استعادة بالدمج + تذكير دوري.</p>
      </div>

      {due && (
        <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 flex items-center gap-3 animate-in slide-in-from-top-4">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <p className="text-xs font-black text-amber-800 dark:text-amber-300 flex-1">
            حان موعد النسخة الاحتياطية الدورية ({freqLabel(settings.frequency)}) — آخر نسخة: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleDateString("ar-EG") : "لا يوجد"}.
          </p>
          <button onClick={handleExport} disabled={busy === "export"} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black disabled:opacity-50 flex items-center gap-1.5">
            <Download size={14} /> نسخ الآن
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={clsx("p-5 rounded-2xl border shadow-sm space-y-3", T.card)}>
          <h2 className="text-sm font-black flex items-center gap-2"><Download size={15} className="text-teal-600" /> تصدير نسخة كاملة</h2>
          <p className="text-[11px] font-bold text-slate-500 leading-relaxed">يشمل الحسابات والجلسات وسجل التدقيق. الملف حساس — احفظه خارج الجهاز.</p>
          <button onClick={handleExport} disabled={busy === "export"} className="w-full py-2.5 bg-teal-600 text-white rounded-xl text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2">
            <Download size={14} /> {busy === "export" ? "جارٍ التصدير..." : "تنزيل النسخة الاحتياطية"}
          </button>
          {settings.lastBackupAt && (
            <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><History size={12} /> آخر نسخة: {new Date(settings.lastBackupAt).toLocaleString("ar-EG")} — {settings.lastBackupBy || ""}</p>
          )}
        </div>

        <div className={clsx("p-5 rounded-2xl border shadow-sm space-y-3", T.card)}>
          <h2 className="text-sm font-black flex items-center gap-2"><Upload size={15} className="text-sky-600" /> استعادة من ملف</h2>
          {!isAdmin ? (
            <p className="text-[11px] font-bold text-slate-500">الاستعادة متاحة لمدير النظام فقط.</p>
          ) : (
            <>
              <input ref={fileRef} type="file" accept="application/json" onChange={handlePickFile} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className="w-full py-2.5 bg-sky-600 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2">
                <Upload size={14} /> اختيار ملف النسخة
              </button>
              {preview && (
                <div className="text-[11px] font-bold space-y-1 max-h-44 overflow-y-auto rounded-xl border p-3">
                  <p className="font-black">{preview.fileName}</p>
                  {Object.entries(preview.counts).map(([k, v]) => (
                    <p key={k} className="flex justify-between"><span className="text-slate-500" dir="ltr">{k}</span><span>{v}</span></p>
                  ))}
                  <button onClick={handleRestore} disabled={busy === "restore"} className="w-full mt-2 py-2 bg-rose-600 text-white rounded-xl text-xs font-black disabled:opacity-50">
                    {busy === "restore" ? "جارٍ الاستعادة..." : "تأكيد الاستعادة والدمج"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={clsx("p-5 rounded-2xl border shadow-sm space-y-3", T.card)}>
        <h2 className="text-sm font-black">التذكير الدوري</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-black">
            <input type="checkbox" checked={settings.autoEnabled} onChange={(e) => saveSettings({ ...settings, autoEnabled: e.target.checked })} className="w-4 h-4" />
            تفعيل التذكير
          </label>
          <select value={settings.frequency} onChange={(e) => saveSettings({ ...settings, frequency: e.target.value })} className={clsx("px-3 py-2 rounded-xl border text-xs font-bold", T.sel)}>
            <option value="daily">يومي</option>
            <option value="weekly">أسبوعي</option>
            <option value="monthly">شهري</option>
          </select>
        </div>
      </div>

      {result && (
        <div className={clsx("p-4 rounded-2xl border text-xs font-black flex items-center gap-2", result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-600")}>
          {result.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {result.msg}
        </div>
      )}
    </div>
  );
}
