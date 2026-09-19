import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc } from "firebase/firestore";
import { AlertTriangle, BookCopy, FileSpreadsheet, HandCoins, Plus, RefreshCw } from "lucide-react";
import { db } from "../../../app/providers/FirebaseProvider";
import { useAuth } from "../../../app/providers/AuthProvider";
import { useAlert } from "../../../app/providers/AlertProvider";
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatusBadge,
  Textarea,
} from "../../../ui/enterprise";
import { CHECK_STATUS, getCheckLifecycle, getCheckStatusLabel } from "./checkbookConstants";
import { allowedCheckTransitions, checkInBookRange, findCheckbookForNum, isCheckNumDuplicate, updateCheckLifecycle } from "./services/checkbookService";
import { subscribeCheckbooks } from "./services/checkbookService";
import { formatMoney } from "../../../utils/numberFormat";
import ArabicDatePicker from "../../../ui/inputs/ArabicDatePicker";
import { getCheckAmount, getCheckDomainMetrics } from "./checkbookMetrics";

const STATUSES = ["issued", "delivered", "cashed", "uncashed", "cancelled", "replaced"];
const STATUS_TONE = { issued: "info", delivered: "brand", cashed: "success", uncashed: "warning", cancelled: "danger", replaced: "neutral" };

export default function ChecksPage() {
  const { user, can } = useAuth();
  const { showToast } = useAlert();
  const [checks, setChecks] = useState([]);
  const [books, setBooks] = useState([]);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fBook, setFBook] = useState("all");
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelForm, setCancelForm] = useState({ date: new Date().toISOString().slice(0, 10), reason: "", replacementCheckNum: "", notes: "" });
  const [reviewTarget, setReviewTarget] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ checkNum: "", date: new Date().toISOString().slice(0, 10), party: "", amount: "", notes: "", linkedAdvanceRef: "", linkedSettlementId: "" });

  const canCreate = can("treasury.create");
  const canEdit = can("treasury.edit");
  const canReview = can("treasury.settle") || can("treasury.post");
  const canViewReports = can("reports.view");

  useEffect(() => subscribeCheckbooks(setBooks), []);
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "issued_checks")), (s) =>
      setChecks(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  const visible = useMemo(() => {
    const t = q.trim();
    return checks
      .filter((c) => (fStatus === "all" ? true : getCheckLifecycle(c) === fStatus))
      .filter((c) => (fBook === "all" ? true : c.checkbookId === fBook))
      .filter((c) => !t || [c.checkNum, c.party, c.beneficiaryName, c.notes, c.linkedAdvanceRef, c.linkedSettlementId].join(" ").includes(t))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [checks, q, fStatus, fBook]);

  const metrics = useMemo(() => getCheckDomainMetrics(books, checks), [books, checks]);
  const bookById = useMemo(() => new Map(books.map((book) => [book.id, book])), [books]);
  const exceptionChecks = useMemo(
    () => visible.filter((check) => ["cancelled", "replaced", "uncashed"].includes(getCheckLifecycle(check))).slice(0, 5),
    [visible]
  );

  const columns = useMemo(() => [
    {
      key: "checkNum",
      header: "رقم الشيك",
      render: (check) => <span dir="ltr" className="font-black tabular-nums text-amber-700">{check.checkNum || "—"}</span>,
    },
    { key: "date", header: "التاريخ", render: (check) => check.date || "—" },
    {
      key: "party",
      header: "المستفيد",
      render: (check) => <span className="font-bold">{check.party || check.beneficiaryName || "—"}</span>,
    },
    {
      key: "amount",
      header: "المبلغ",
      numeric: true,
      render: (check) => formatMoney(getCheckAmount(check)),
    },
    {
      key: "book",
      header: "الدفتر",
      render: (check) => check.checkbookNo || bookById.get(check.checkbookId)?.requestNo || "—",
    },
    {
      key: "status",
      header: "الحالة",
      render: (check) => <StatusBadge tone={STATUS_TONE[getCheckLifecycle(check)] || "neutral"}>{getCheckStatusLabel(check)}</StatusBadge>,
    },
    {
      key: "links",
      header: "الروابط",
      render: (check) => [check.linkedAdvanceRef, check.linkedSettlementId].filter(Boolean).join(" / ") || "—",
    },
  ], [bookById]);

  const doTransition = async (check, to, extra = {}, audit = "check.status_changed") => {
    const allowed = allowedCheckTransitions(getCheckLifecycle(check));
    if (!allowed.includes(to)) { showToast("انتقال غير مسموح لهذه الحالة", "error"); return; }
    try {
      await updateCheckLifecycle(check, { checkStatus: to, ...extra }, user, audit);
      showToast(`تم: ${CHECK_STATUS[to]}`, "success");
      setDetail(null); setReviewTarget(null);
    } catch { showToast("تعذر التحديث", "error"); }
  };

  const doCancel = async () => {
    if (!cancelForm.date || !cancelForm.reason.trim()) { showToast("التاريخ والسبب إلزاميان", "error"); return; }
    const patch = {
      checkStatus: "cancelled",
      cancelDate: cancelForm.date,
      cancelReason: cancelForm.reason,
      cancelledBy: user?.id || "",
      cancelledByName: user?.displayName || user?.fullName || "",
      replacementCheckNum: cancelForm.replacementCheckNum || "",
      cancelNotes: cancelForm.notes || "",
    };
    if (cancelForm.replacementCheckNum) {
      patch.replacedByCheckNum = cancelForm.replacementCheckNum;
      const rep = checks.find((c) => String(c.checkNum) === String(cancelForm.replacementCheckNum));
      if (rep) {
        await updateCheckLifecycle(rep, { replacedForCheckNum: cancelTarget.checkNum, checkStatus: rep.checkStatus || "issued" }, user, "check.linked_replacement");
      }
    }
    await updateCheckLifecycle(cancelTarget, patch, user, "check.cancelled");
    showToast("تم الإلغاء مع الاحتفاظ بالسجل", "success");
    setCancelTarget(null);
  };

  const createCheck = async () => {
    if (!form.checkNum || !form.amount || !form.party) { showToast("رقم الشيك والمستفيد والمبلغ مطلوبة", "error"); return; }
    if (await isCheckNumDuplicate(form.checkNum)) { showToast("رقم الشيك مستخدم بالفعل", "error"); return; }
    const book = await findCheckbookForNum(form.checkNum, books);
    if (books.some((b) => b.status === "received") && !book) { showToast("رقم الشيك خارج نطاق الدفاتر المستلمة", "error"); return; }
    if (book && !checkInBookRange(form.checkNum, book)) { showToast("الشيك خارج نطاق الدفتر", "error"); return; }
    const now = new Date().toISOString();
    const id = doc(collection(db, "issued_checks")).id;
    await setDoc(doc(db, "issued_checks", id), {
      id, checkNum: String(form.checkNum).trim(), date: form.date, party: form.party,
      amount: Number(form.amount), notes: form.notes || "",
      type: "advance", state: "posted", checkStatus: "issued", financialEffect: 0,
      checkbookId: book?.id || "", checkbookNo: book?.requestNo || "",
      linkedAdvanceRef: form.linkedAdvanceRef || "", linkedSettlementId: form.linkedSettlementId || "",
      createdAt: now, updatedAt: now, createdBy: user?.id || "", createdByName: user?.displayName || user?.fullName || "",
    });
    setNewOpen(false);
    setForm({ checkNum: "", date: new Date().toISOString().slice(0, 10), party: "", amount: "", notes: "", linkedAdvanceRef: "", linkedSettlementId: "" });
    showToast("تم إصدار الشيك", "success");
  };

  const d = detail ? checks.find((c) => c.id === detail.id) || detail : null;

  return (
    <div className="max-w-7xl mx-auto pb-10 flex flex-col gap-3" dir="rtl">
      <PageHeader
        title="مساحة عمليات الشيكات"
        hint="دورة حياة الشيكات، المراجعة البنكية، الإلغاء، والاستبدال بدون تغيير أي أثر مالي."
        icon={HandCoins}
        crumbs={[{ label: "الماليات" }, { label: "إدارة الشيكات" }]}
        primaryAction={canCreate && (
          <Button onClick={() => setNewOpen(true)} iconStart={Plus}>إصدار شيك</Button>
        )}
        secondaryActions={(
          <>
            <Button as="a" href="/treasury/checkbooks" variant="outline" iconStart={BookCopy}>دفاتر الشيكات</Button>
            {canViewReports && <Button as="a" href="/treasury/check-reports" variant="outline" iconStart={FileSpreadsheet}>التقارير</Button>}
          </>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <StatCard label="الشيكات المسجلة" value={metrics.issuedChecksCount} icon={HandCoins} tone="brand" />
        <StatCard label="إجمالي القيمة" value={formatMoney(metrics.totalIssuedAmount)} icon={FileSpreadsheet} tone="success" />
        <StatCard label="قائمة للمراجعة" value={metrics.openChecksCount} icon={RefreshCw} tone="warning" />
        <StatCard label="ملغاة" value={metrics.cancelledCount} icon={AlertTriangle} tone={metrics.cancelledCount ? "danger" : "neutral"} />
        <StatCard label="دفاتر نشطة" value={metrics.activeCheckbooks} icon={BookCopy} tone="success" />
      </div>

      {exceptionChecks.length > 0 && (
        <Alert
          tone="warning"
          title="حالات تحتاج متابعة"
          description={`يوجد ${exceptionChecks.length} شيك ضمن النتائج الحالية بحالة غير اعتيادية أو غير منصرفة.`}
        />
      )}

      <Card compact bodyClassName="p-3">
        <FilterBar>
          <SearchInput value={q} onChange={setQ} placeholder="بحث برقم الشيك أو المستفيد أو المرجع أو التسوية" className="min-w-[260px] md:min-w-[420px]" />
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} inputClassName="h-9 min-w-[130px] text-xs font-semibold">
          <option value="all">كل الحالات</option>
          {STATUSES.map((s) => <option key={s} value={s}>{CHECK_STATUS[s]}</option>)}
          </Select>
          <Select value={fBook} onChange={(e) => setFBook(e.target.value)} inputClassName="h-9 min-w-[150px] text-xs font-semibold">
          <option value="all">كل الدفاتر</option>
          {books.filter((b) => b.status === "received").map((b) => <option key={b.id} value={b.id}>{b.requestNo} ({b.serialFrom}→{b.serialTo})</option>)}
          </Select>
        </FilterBar>
      </Card>

      <Card title={`سجل الشيكات (${visible.length})`} compact>
        <DataTable
          rows={visible}
          columns={columns}
          emptyTitle="لا توجد شيكات مطابقة"
          emptyDescription="جرّب تغيير البحث أو الفلاتر"
          actions={(check) => (
            <>
              <Button variant="secondary" size="sm" onClick={() => setDetail(check)}>التفاصيل</Button>
              {canReview && <Button variant="outline" size="sm" onClick={() => { setReviewTarget(check); setDetail(null); }}>مراجعة</Button>}
            </>
          )}
        />
      </Card>

      {d && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto text-[12px]">
            <h3 className="font-black">شيك {d.checkNum} — {getCheckStatusLabel(d)}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-bold">
              <p><b>المستفيد:</b> {d.party || d.beneficiaryName || "—"}</p>
              <p><b>المبلغ:</b> {formatMoney(getCheckAmount(d))}</p>
              <p><b>التاريخ:</b> {d.date || "—"}</p>
              <p><b>الدفتر:</b> {d.checkbookNo || "—"}</p>
              <p><b>السلفة:</b> {d.linkedAdvanceRef || "—"}</p>
              <p><b>التسوية:</b> {d.linkedSettlementId || "—"}</p>
              <p><b>التسليم:</b> {d.deliverDate || "—"}</p>
              <p><b>الصرف:</b> {d.cashDate || "—"}</p>
              <p><b>الإلغاء:</b> {d.cancelDate || "—"} {d.cancelReason || ""}</p>
              <p><b>البديل:</b> {d.replacementCheckNum || d.replacedByCheckNum || "—"}</p>
              <p className="sm:col-span-2"><b>آخر مراجعة:</b> {d.lastReviewDate || "—"} — {d.reviewNotes || ""}</p>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {getCheckLifecycle(d) === "issued" && <Button onClick={() => doTransition(d, "delivered", { deliverDate: new Date().toISOString().slice(0, 10) }, "check.delivered")} size="sm">تسليم للمستفيد</Button>}
                {getCheckLifecycle(d) !== "cancelled" && getCheckLifecycle(d) !== "cashed" && (
                  <Button onClick={() => { setCancelTarget(d); setDetail(null); }} variant="danger" size="sm">إلغاء الشيك</Button>
                )}
              </div>
            )}
            <Button onClick={() => setDetail(null)} variant="outline" className="w-full">إغلاق</Button>
          </div>
        </div>
      )}

      {reviewTarget && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-sm">مراجعة بنكية — شيك {reviewTarget.checkNum}</h3>
            <p className="text-[11px] text-slate-500 font-bold">التسليم لا يعني الصرف. حدد نتيجة مراجعة كشف البنك.</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => doTransition(reviewTarget, "cashed", { cashDate: new Date().toISOString().slice(0, 10), lastReviewDate: new Date().toISOString().slice(0, 10), reviewedBy: user?.id || "" }, "check.cashed")} variant="primary">ظهر في الكشف — منصرف</Button>
              <Button onClick={() => doTransition(reviewTarget, "uncashed", { lastReviewDate: new Date().toISOString().slice(0, 10), reviewedBy: user?.id || "", reviewNotes: "لم يظهر في كشف البنك" }, "check.uncashed")} variant="secondary">لم يظهر — غير منصرف</Button>
              <Button onClick={() => setReviewTarget(null)} variant="outline">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-sm">إلغاء شيك {cancelTarget.checkNum} — يبقى في السجل</h3>
            <FormField label="تاريخ الإلغاء">
              <ArabicDatePicker value={cancelForm.date} onChange={(v) => setCancelForm((f) => ({ ...f, date: v }))} />
            </FormField>
            <FormField label="سبب الإلغاء">
              <Textarea value={cancelForm.reason} onChange={(e) => setCancelForm((f) => ({ ...f, reason: e.target.value }))} />
            </FormField>
            <FormField label="الشيك البديل">
              <Input value={cancelForm.replacementCheckNum} onChange={(e) => setCancelForm((f) => ({ ...f, replacementCheckNum: e.target.value }))} ltr />
            </FormField>
            <FormField label="ملاحظات">
              <Textarea value={cancelForm.notes} onChange={(e) => setCancelForm((f) => ({ ...f, notes: e.target.value }))} />
            </FormField>
            <div className="flex gap-2">
              <Button onClick={() => setCancelTarget(null)} variant="outline" className="flex-1">تراجع</Button>
              <Button onClick={doCancel} variant="danger" className="flex-1">تأكيد الإلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-sm">إصدار شيك داخل نطاق دفتر مستلم</h3>
            {[
              ["checkNum", "رقم الشيك"], ["party", "المستفيد"], ["amount", "المبلغ"],
              ["linkedAdvanceRef", "السلفة المرتبطة"], ["linkedSettlementId", "التسوية المرتبطة"], ["notes", "البيان"],
            ].map(([k, l]) => (
              <FormField key={k} label={l}>
                <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} ltr={k === "checkNum" || k === "amount"} />
              </FormField>
            ))}
            <FormField label="تاريخ الشيك (فعلي)">
              <ArabicDatePicker value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
            </FormField>
            <div className="flex gap-2">
              <Button onClick={() => setNewOpen(false)} variant="outline" className="flex-1">إلغاء</Button>
              <Button onClick={createCheck} className="flex-1">حفظ</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
