import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { AlertTriangle, BookCopy, FileSpreadsheet, Plus } from "lucide-react";
import { db } from "../../../app/providers/FirebaseProvider";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useAlert } from "../../../app/providers/AlertProvider";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
} from "../../../ui/enterprise";
import { CHECKBOOK_STATUS, calcChecksCount, validateCheckbook } from "./checkbookConstants";
import { deleteCheckbook, saveCheckbook, subscribeCheckbooks } from "./services/checkbookService";
import { formatMoney } from "../../../utils/numberFormat";
import ArabicDatePicker from "../../../ui/inputs/ArabicDatePicker";
import { buildCheckbookPosition, getCheckDomainMetrics } from "./checkbookMetrics";

const emptyForm = {
  requestDate: new Date().toISOString().slice(0, 10),
  booksCount: 1, bank: "", account: "", status: "requested",
  serialFrom: "", serialTo: "", receiveDate: "",
  decisionDate: "", decisionNo: "", decisionBy: "", reason: "", notes: "",
};

const BOOK_TONE = { requested: "info", received: "success", destroyed: "danger", postponed: "warning" };

export default function CheckbooksPage() {
  const { user, can } = useAuth();
  const { showToast } = useAlert();
  const [books, setBooks] = useState([]);
  const [checks, setChecks] = useState([]);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [historyId, setHistoryId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const canCreate = can("treasury.create");
  const canEdit = can("treasury.edit");
  const canApprove = can("treasury.approve");
  const canDelete = can("treasury.delete");

  useEffect(() => subscribeCheckbooks(setBooks), []);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "issued_checks")), (s) =>
      setChecks(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  const autoCount = useMemo(() => calcChecksCount(form.serialFrom, form.serialTo), [form.serialFrom, form.serialTo]);

  const stats = useMemo(() => getCheckDomainMetrics(books, checks), [books, checks]);
  const position = useMemo(() => buildCheckbookPosition(books, checks), [books, checks]);

  const visible = useMemo(() => {
    const t = q.trim();
    if (!t) return books;
    return books.filter((b) => [b.requestNo, b.bank, b.account, b.serialFrom, b.serialTo].join(" ").includes(t));
  }, [books, q]);

  const visiblePositionById = useMemo(
    () => new Map(position.map((item) => [item.book.id, item])),
    [position]
  );

  const columns = useMemo(() => [
    { key: "requestNo", header: "رقم الطلب", render: (book) => <span className="font-black">{book.requestNo || "—"}</span> },
    { key: "requestDate", header: "التاريخ", render: (book) => book.requestDate || "—" },
    { key: "bank", header: "البنك", render: (book) => book.bank || "—" },
    {
      key: "status",
      header: "الحالة",
      render: (book) => <StatusBadge tone={BOOK_TONE[book.status] || "neutral"}>{CHECKBOOK_STATUS[book.status] || book.status}</StatusBadge>,
    },
    {
      key: "range",
      header: "النطاق",
      render: (book) => <span dir="ltr" className="tabular-nums">{book.serialFrom || "—"} → {book.serialTo || "—"}</span>,
    },
    {
      key: "usage",
      header: "الاستخدام",
      render: (book) => {
        const item = visiblePositionById.get(book.id);
        return item ? `${item.used} مستخدم / ${item.available} متاح` : book.checksCount || "—";
      },
    },
  ], [visiblePositionById]);

  const openNew = () => { setEditing(null); setForm(emptyForm); setErrors({}); setShowForm(true); };
  const openEdit = (b) => {
    setEditing(b); setErrors({});
    setForm({
      requestDate: b.requestDate || "", booksCount: b.booksCount || 1, bank: b.bank || "", account: b.account || "",
      status: b.status || "requested", serialFrom: b.serialFrom || "", serialTo: b.serialTo || "",
      receiveDate: b.receiveDate || "", decisionDate: b.decisionDate || "", decisionNo: b.decisionNo || "",
      decisionBy: b.decisionBy || "", reason: b.reason || "", notes: b.notes || "",
      requestNo: b.requestNo, id: b.id,
    });
    setShowForm(true);
  };

  const submit = async () => {
    const errs = validateCheckbook({ ...form, id: editing?.id }, books);
    setErrors(errs);
    if (Object.keys(errs).length) { showToast("راجع الحقول المطلوبة", "error"); return; }
    try {
      await saveCheckbook({ ...form, id: editing?.id, checksCount: form.status === "received" ? autoCount : "" }, user, books);
      setShowForm(false);
      showToast("تم الحفظ بنجاح", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const historyBook = books.find((b) => b.id === historyId);

  return (
    <div className="max-w-7xl mx-auto pb-10 flex flex-col gap-3" dir="rtl">
      <PageHeader
        title="مساحة دفاتر الشيكات"
        hint="إدارة طلبات الدفاتر، النطاقات، الاستخدام، والسجل التشغيلي بدون تغيير قواعد المسلسلات."
        icon={BookCopy}
        crumbs={[{ label: "الماليات" }, { label: "دفاتر الشيكات" }]}
        primaryAction={canCreate && (
          <Button onClick={openNew} iconStart={Plus}>طلب دفتر جديد</Button>
        )}
        secondaryActions={(
          <>
            <Button as="a" href="/treasury/checks" variant="outline" iconStart={BookCopy}>إدارة الشيكات</Button>
            <Button as="a" href="/treasury/check-reports" variant="outline" iconStart={FileSpreadsheet}>التقارير</Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <StatCard label="إجمالي الدفاتر" value={stats.totalCheckbooks} tone="brand" icon={BookCopy} />
        <StatCard label="دفاتر مستلمة" value={stats.activeCheckbooks} tone="success" icon={BookCopy} />
        <StatCard label="شيكات مسجلة" value={stats.issuedChecksCount} tone="brand" icon={FileSpreadsheet} />
        <StatCard label="إجمالي قيمة الشيكات" value={formatMoney(stats.totalIssuedAmount)} tone="success" icon={FileSpreadsheet} />
        <StatCard label="ملغاة" value={stats.cancelledCount} tone={stats.cancelledCount ? "danger" : "neutral"} icon={AlertTriangle} />
      </div>

      {position.some((item) => item.available <= 5 && item.total > 0) && (
        <Alert tone="warning" title="تنبيه قرب نفاد دفتر" description="يوجد دفتر مستلم بعدد شيكات متاحة منخفض حسب موقف الدفاتر الحالي." />
      )}

      <Card compact bodyClassName="p-3">
        <SearchInput value={q} onChange={setQ} placeholder="بحث برقم الطلب أو البنك أو الحساب أو المسلسل" className="min-w-[260px] md:min-w-[420px]" />
      </Card>

      <Card title={`سجل الدفاتر (${visible.length})`} compact>
        <DataTable
          rows={visible}
          columns={columns}
          emptyTitle="لا توجد دفاتر مطابقة"
          emptyDescription="ابدأ بإنشاء طلب دفتر جديد أو غيّر البحث."
          actions={(book) => (
            <>
              {(canEdit || canApprove) && <Button onClick={() => openEdit(book)} variant="secondary" size="sm">تعديل</Button>}
              <Button onClick={() => setHistoryId(book.id)} variant="outline" size="sm">السجل</Button>
              {canDelete && <Button onClick={() => setDeleteId(book.id)} variant="danger" size="sm">حذف</Button>}
            </>
          )}
        />
      </Card>

      {deleteId && (
        <ConfirmDialog
          title="حذف الدفتر"
          message="هل أنت متأكد من حذف سجل الدفتر؟ لا يمكن التراجع."
          onCancel={() => setDeleteId(null)}
          onConfirm={async () => { await deleteCheckbook(deleteId); setDeleteId(null); showToast("تم الحذف", "success"); }}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 space-y-3">
            <h3 className="font-black">{editing ? "تعديل دفتر" : "طلب دفتر شيكات"}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="تاريخ الطلب" error={errors.requestDate}>
                <ArabicDatePicker value={form.requestDate} onChange={(v) => set("requestDate", v)} />
              </FormField>
              <FormField label="عدد الدفاتر" error={errors.booksCount}>
                <Input type="number" min="1" value={form.booksCount} onChange={(e) => set("booksCount", e.target.value)} />
              </FormField>
              <FormField label="البنك">
                <Input value={form.bank} onChange={(e) => set("bank", e.target.value)} />
              </FormField>
              <FormField label="الحساب">
                <Input value={form.account} onChange={(e) => set("account", e.target.value)} />
              </FormField>
              <FormField label="الحالة" className="sm:col-span-2">
                <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {Object.entries(CHECKBOOK_STATUS).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                </Select>
              </FormField>
              {form.status === "received" && (
                <>
                  <FormField label="مسلسل من" error={errors.serialFrom}>
                    <Input value={form.serialFrom} onChange={(e) => set("serialFrom", e.target.value)} ltr />
                  </FormField>
                  <FormField label="مسلسل إلى" error={errors.serialTo}>
                    <Input value={form.serialTo} onChange={(e) => set("serialTo", e.target.value)} ltr />
                  </FormField>
                  <p className="sm:col-span-2 text-[11px] font-black text-violet-700">عدد الشيكات = {autoCount || "—"} (إلى − من + 1)</p>
                  {errors.checksCount && <p className="sm:col-span-2 text-rose-600 text-[10px] font-bold">{errors.checksCount}</p>}
                  <FormField label="تاريخ الاستلام" className="sm:col-span-2">
                    <ArabicDatePicker value={form.receiveDate} onChange={(v) => set("receiveDate", v)} />
                  </FormField>
                </>
              )}
              {(form.status === "destroyed" || form.status === "postponed") && (
                <>
                  <FormField label="تاريخ القرار" error={errors.decisionDate}>
                    <ArabicDatePicker value={form.decisionDate} onChange={(v) => set("decisionDate", v)} />
                  </FormField>
                  <FormField label="رقم القرار">
                    <Input value={form.decisionNo} onChange={(e) => set("decisionNo", e.target.value)} />
                  </FormField>
                  <FormField label="الجهة / المسؤول">
                    <Input value={form.decisionBy} onChange={(e) => set("decisionBy", e.target.value)} />
                  </FormField>
                  <FormField label="السبب" error={errors.reason}>
                    <Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} />
                  </FormField>
                </>
              )}
              <FormField label="ملاحظات" className="sm:col-span-2">
                <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </FormField>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowForm(false)} variant="outline" className="flex-1">إلغاء</Button>
              <Button onClick={submit} className="flex-1">حفظ</Button>
            </div>
          </div>
        </div>
      )}

      {historyBook && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-2 max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-sm">السجل التاريخي — {historyBook.requestNo}</h3>
            {(historyBook.history || []).map((h, i) => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-[11px]">
                <p className="font-black">{h.from} → {CHECKBOOK_STATUS[h.to] || h.to}</p>
                <p className="text-slate-500 font-bold">{h.at} — {h.by}</p>
                {h.reason && <p className="font-bold">السبب: {h.reason}</p>}
              </div>
            ))}
            {(historyBook.history || []).length === 0 && <EmptyState title="لا يوجد سجل بعد" />}
            <Button onClick={() => setHistoryId(null)} variant="outline" className="w-full">إغلاق</Button>
          </div>
        </div>
      )}
    </div>
  );
}
