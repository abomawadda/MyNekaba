/* eslint-disable react-hooks/set-state-in-effect */
import React, { useEffect, useMemo, useState } from "react";
import {
  CreditCard, Briefcase, Phone, Calendar, MapPin, Mail, Award,
  User, Building2, FileText, Landmark, Shield, Hash, Star,
  Download, Image as ImageIcon, File as FileIcon, Stethoscope, Heart,
  DollarSign, PhoneCall, Users, AlertTriangle, Gift, Printer, ReceiptText, GitBranch
} from "lucide-react";
import clsx from "clsx";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { PERMISSIONS } from "../../security/permissions";
import { hasStoragePermissions } from "../../security/storageAuthorization";
import { db } from "../../app/providers/FirebaseProvider";
import {
  formatEmployeeDate,
  getDeathDate,
  getEmployeeBirthDate,
  getLegalRetirementAge,
  getRetirementDate,
  isDeceasedMember,
  isRetiredMember,
} from "../../utils/memberBenefits";
import {
  buildMemberFundBenefitEntries,
  buildMemberFundBenefitSummary,
  formatFundBenefitAmount,
  formatFundBenefitDate,
} from "./helpers/fundBenefits";
import { printMemberFundBenefitsReport } from "./helpers/fundBenefitsPrint";
import MemberMovementsTab from "./components/MemberMovementsTab";

const colorMap = {
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-900/20",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/20",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-900/20",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-900/20",
  gray: "bg-slate-50 text-slate-600 dark:bg-slate-800",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20",
  orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/20",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-900/20",
  slate: "bg-slate-50 text-slate-600 dark:bg-slate-800",
};

const formatCurrency = (val) => (val ? `${Number(val).toLocaleString()} ج.م` : "—");

const getFileIcon = (fileName) => {
  if (!fileName) return <FileIcon size={20} />;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return <FileText size={20} className="text-rose-500" />;
  if (lower.match(/\.(jpeg|jpg|gif|png)$/)) return <ImageIcon size={20} className="text-sky-500" />;
  return <FileIcon size={20} className="text-teal-500" />;
};

const InfoCard = ({ icon: Icon, label, val, color = "teal", T }) => {
  const safeVal = val ? String(val) : "—";
  return (
    <div className={clsx("p-3.5 rounded-xl border flex items-center gap-3 transition-all hover:shadow-sm hover:border-slate-300 dark:hover:border-slate-600", T?.card)}>
      <div className={clsx("p-2.5 rounded-lg flex-shrink-0", colorMap[color] || colorMap.teal)}>
        {Icon ? <Icon size={18} /> : <User size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate" title={safeVal}>{safeVal}</p>
      </div>
    </div>
  );
};

const FundMetricCard = ({ icon: Icon, label, value, sub, color = "teal", T }) => (
  <div className={clsx("p-4 rounded-2xl border shadow-sm space-y-2", T?.card)}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
        <p className="text-lg font-black text-slate-900 dark:text-white mt-1 break-words">{value}</p>
      </div>
      <div className={clsx("p-3 rounded-2xl flex-shrink-0", colorMap[color] || colorMap.teal)}>
        {Icon ? <Icon size={18} /> : <Gift size={18} />}
      </div>
    </div>
    {sub && <p className="text-[11px] font-bold text-slate-500">{sub}</p>}
  </div>
);

const dedupeDocs = (docs = []) => {
  const seen = new Map();
  docs.forEach((doc) => {
    if (doc?.id) seen.set(doc.id, doc);
  });
  return Array.from(seen.values());
};

export default function EmployeeProfileFund({ data }) {
  const T = useT() || {};
  const { can } = useAuth();
  const canViewAttachments = hasStoragePermissions(can, [
    PERMISSIONS.employeesView,
    PERMISSIONS.attachmentsView,
  ]);
  const [activeTab, setActiveTab] = useState("main");
  const [fundEntries, setFundEntries] = useState([]);
  const [fundLoading, setFundLoading] = useState(false);
  const [fundError, setFundError] = useState("");
  const memberRecordId = String(data?.id || "").trim();
  const memberJobId = String(data?.jobId || "").trim();
  const memberName = String(data?.name || "").trim();

  useEffect(() => {
    if (!memberJobId && !memberName) {
      setFundEntries([]);
      setFundError("");
      setFundLoading(false);
      return undefined;
    }

    let active = true;
    let pendingInitialLoads = 0;
    let issuedById = [];
    let issuedByName = [];
    let issuedByParty = [];
    let legacyById = [];
    let legacyByName = [];
    let legacyByParty = [];
    let benefitsById = [];
    let benefitsByName = [];
    const subscriptions = [];

    const refreshEntries = () => {
      if (!active) return;
      const isMemberRecord = (record) => {
        const identityValues = [record?.memberId, record?.employeeId, record?.jobId].filter(Boolean).map(String);
        if (identityValues.length === 0) return true;
        return identityValues.includes(memberJobId) || identityValues.includes(memberRecordId);
      };
      setFundEntries(
        buildMemberFundBenefitEntries({
          issuedChecks: dedupeDocs([...issuedById, ...issuedByName, ...issuedByParty]).filter(isMemberRecord),
          legacyTransactions: dedupeDocs([...legacyById, ...legacyByName, ...legacyByParty]).filter(isMemberRecord),
          memberBenefits: dedupeDocs([...benefitsById, ...benefitsByName]).filter(isMemberRecord),
        })
      );
    };

    const markInitialLoadDone = () => {
      pendingInitialLoads -= 1;
      if (active && pendingInitialLoads <= 0) setFundLoading(false);
    };

    const attachListener = (collectionName, field, value, assign) => {
      if (!value) return;
      pendingInitialLoads += 1;
      let initialized = false;

      const unsubscribe = onSnapshot(
        query(collection(db, collectionName), where(field, "==", value)),
        (snap) => {
          assign(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
          refreshEntries();
          if (!initialized) {
            initialized = true;
            markInitialLoadDone();
          }
        },
        (error) => {
          console.error(error);
          if (active) setFundError("تعذر تحميل سجل دعم الصندوق لهذا العضو حالياً.");
          if (!initialized) {
            initialized = true;
            markInitialLoadDone();
          }
        }
      );

      subscriptions.push(unsubscribe);
    };

    setFundLoading(true);
    setFundError("");

    attachListener("issued_checks", "employeeId", memberJobId, (docs) => { issuedById = docs; });
    attachListener("issued_checks", "employeeName", memberName, (docs) => { issuedByName = docs; });
    attachListener("issued_checks", "party", memberName, (docs) => { issuedByParty = docs; });
    attachListener("transactions", "employeeId", memberJobId, (docs) => { legacyById = docs; });
    attachListener("transactions", "employeeName", memberName, (docs) => { legacyByName = docs; });
    attachListener("transactions", "party", memberName, (docs) => { legacyByParty = docs; });
    attachListener("member_benefits", "memberId", memberJobId, (docs) => { benefitsById = docs; });
    attachListener("member_benefits", "memberName", memberName, (docs) => { benefitsByName = docs; });

    if (pendingInitialLoads === 0) {
      setFundLoading(false);
    }

    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [memberJobId, memberName, memberRecordId]);

  const fundSummary = useMemo(() => buildMemberFundBenefitSummary(fundEntries), [fundEntries]);

  if (!data) {
    return (
      <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-black text-slate-400 text-xs">جارِ تحميل ملف العضو...</p>
      </div>
    );
  }

  const initialChar = data.name ? String(data.name).charAt(0) : "ع";
  const birthDate = formatEmployeeDate(getEmployeeBirthDate(data)) || data.birthDate || data.dateOfBirth || "—";
  const retirementDate = formatEmployeeDate(getRetirementDate(data)) || data.retirementDate || "—";
  const retired = isRetiredMember(data);
  const deceased = isDeceasedMember(data);
  const deathDate = formatEmployeeDate(getDeathDate(data)) || data.deathDate || data.dateOfDeath || "—";
  const retirementDateValue = getRetirementDate(data);
  const retirementAge = getLegalRetirementAge(data);
  const retirementWarning = retirementDateValue
    ? `لا يستحق العضو أي مزايا أو منافع بعد ${retirementDate}.`
    : "تم تصنيف العضو كحال للمعاش، لذلك تتوقف المزايا الجديدة له.";
  const deceasedWarning = deathDate !== "—"
    ? `لا يستحق العضو أي مزايا أو منافع بعد تاريخ الوفاة ${deathDate}.`
    : "تم تصنيف العضو كحالة وفاة، لذلك تتوقف المزايا الجديدة له.";
  const latestFundLabel = fundSummary.latestEntry
    ? `${fundSummary.latestEntry.categoryLabel} - ${formatFundBenefitDate(fundSummary.latestEntry.date)}`
    : "لا توجد استفادة مسجلة بعد";

  const tabs = [
    { id: "main", label: "الهوية والوظيفة", icon: User },
    { id: "union", label: "البيانات النقابية", icon: Star },
    { id: "financial", label: "المالية والتأمينات", icon: Landmark },
    { id: "fund", label: "دعم الصندوق", icon: Gift },
    { id: "health", label: "الصحة والطوارئ", icon: Heart },
    ...(canViewAttachments
      ? [{ id: "attachments", label: `المرفقات (${data.attachments?.length || 0})`, icon: FileText }]
      : []),
  ];
  tabs.splice(3, 0, { id: "movements", label: "حركة العضو", icon: GitBranch });

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" dir="rtl">
      <div className={clsx("relative p-5 md:p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row gap-5 items-center md:items-start overflow-hidden", T.card)}>
        <div className="absolute top-0 right-0 w-full h-20 bg-gradient-to-l from-teal-600/10 to-sky-600/10"></div>

        <div className="relative z-10 w-24 h-24 rounded-2xl border-4 border-white dark:border-slate-800 bg-gradient-to-br from-teal-500 to-sky-600 text-white flex items-center justify-center text-3xl font-black overflow-hidden shadow-md">
          {data.photo ? (
            <img src={String(data.photo)} alt="employee" className="w-full h-full object-cover" />
          ) : (
            <span>{initialChar}</span>
          )}
        </div>

        <div className="relative z-10 flex-1 space-y-2 text-center md:text-right mt-2 md:mt-0">
          <div>
            <h2 className={clsx("text-xl font-black text-slate-800 dark:text-white", (retired || deceased) && "line-through text-rose-700 dark:text-rose-300")}>
              {data.name || "ملف عضو غير مكتمل"}
            </h2>
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              {[data.jobTitle, data.workplace].filter(Boolean).join(" — ") || "لم تُحدد الوظيفة"}
            </p>
          </div>

          <div className="flex flex-wrap justify-center md:justify-start gap-1.5">
            {data.jobId && (
              <span className="px-2.5 py-1 bg-sky-50 text-sky-700 dark:bg-sky-900/30 rounded-md flex items-center gap-1 text-[10px] font-black border border-sky-100 dark:border-sky-800">
                <Hash size={12} /> كود: {data.jobId}
              </span>
            )}
            {data.membershipId && (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 dark:bg-amber-900/30 rounded-md flex items-center gap-1 text-[10px] font-black border border-amber-100 dark:border-amber-800">
                <Star size={12} /> {data.membershipId}
              </span>
            )}
            {data.membershipStatus && (
              <span className="px-2.5 py-1 bg-teal-500 text-white rounded-md flex items-center gap-1 text-[10px] font-black shadow-sm">
                <Shield size={12} /> {data.membershipStatus}
              </span>
            )}
            {retired && (
              <span className="px-2.5 py-1 bg-rose-100 text-rose-700 rounded-md flex items-center gap-1 text-[10px] font-black border border-rose-200">
                <AlertTriangle size={12} /> معاش
              </span>
            )}
            {deceased && (
              <span className="px-2.5 py-1 bg-slate-200 text-slate-800 rounded-md flex items-center gap-1 text-[10px] font-black border border-slate-300">
                <AlertTriangle size={12} /> وفاة
              </span>
            )}
          </div>
        </div>
      </div>

      {retired && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 dark:bg-rose-950/10 px-4 py-3 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black text-rose-700">العضو محال للمعاش</p>
            <p className="text-[11px] font-bold text-rose-600">تاريخ الخروج للمعاش: {retirementDate}</p>
            {retirementAge && (
              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                السن القانوني المطبق: {retirementAge} سنة
              </p>
            )}
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{retirementWarning}</p>
          </div>
        </div>
      )}

      {deceased && (
        <div className="rounded-2xl border border-slate-300 bg-slate-50 dark:bg-slate-900/30 px-4 py-3 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <AlertTriangle size={18} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black text-slate-800 dark:text-slate-100">العضو متوفى</p>
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">تاريخ الوفاة: {deathDate}</p>
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{deceasedWarning}</p>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-px overflow-x-auto hide-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2.5 font-black text-[10px] transition-all border-b-2 whitespace-nowrap",
                activeTab === tab.id
                  ? "border-teal-600 text-teal-600 bg-teal-50/50 dark:bg-teal-900/10 rounded-t-lg"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-t-lg"
              )}
            >
              <Icon size={14} /> {tab.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-[300px] pb-6">
        {activeTab === "main" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <InfoCard icon={CreditCard} label="الرقم القومي" val={data.nationalId} color="blue" T={T} />
              <InfoCard icon={Phone} label="الموبايل الأساسي" val={data.phone} color="teal" T={T} />
              <InfoCard icon={PhoneCall} label="موبايل إضافي" val={data.phone2} color="sky" T={T} />
              <InfoCard icon={Mail} label="البريد الإلكتروني" val={data.email} color="amber" T={T} />
              <InfoCard icon={Calendar} label="تاريخ الميلاد" val={birthDate} color="rose" T={T} />
              <InfoCard icon={MapPin} label="محل الإقامة" val={data.address} color="purple" T={T} />
              <InfoCard icon={User} label="الحالة الاجتماعية" val={data.maritalStatus} color="sky" T={T} />
            </div>

            <div className={clsx("p-4 rounded-xl border bg-slate-50/50 dark:bg-slate-900/20", T.card)}>
              <h3 className="text-[11px] font-black text-slate-500 mb-3 flex items-center gap-1.5"><Briefcase size={14} /> البيانات الوظيفية</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InfoCard icon={Building2} label="السنترال" val={data.workplace} color="sky" T={T} />
                <InfoCard icon={Briefcase} label="المسمى الوظيفي" val={data.jobTitle} color="sky" T={T} />
                <InfoCard icon={Award} label="الدرجة الوظيفية" val={data.jobGrade} color="sky" T={T} />
                <InfoCard icon={Calendar} label="تاريخ التعيين" val={data.hireDate} color="teal" T={T} />
                <InfoCard icon={Calendar} label="تاريخ الخروج للمعاش" val={retirementDate} color="rose" T={T} />
                {deceased && <InfoCard icon={Calendar} label="تاريخ الوفاة" val={deathDate} color="gray" T={T} />}
                <InfoCard icon={FileText} label="المؤهل الدراسي" val={data.qualification} color="purple" T={T} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "union" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 animate-in fade-in duration-300">
            <InfoCard icon={Star} label="رقم العضوية النقابية" val={data.membershipId} color="amber" T={T} />
            <InfoCard icon={Building2} label="الفرع النقابي التابع له" val={data.unionBranch} color="amber" T={T} />
            <InfoCard icon={Calendar} label="تاريخ الانتساب" val={data.unionJoinDate} color="teal" T={T} />
            <InfoCard icon={Shield} label="طبيعة العضوية" val={data.membershipStatus} color="sky" T={T} />
            <InfoCard icon={DollarSign} label="حالة الاشتراك المالي" val={data.subscriptionStatus} color={data.subscriptionStatus === "مسدد" ? "teal" : "rose"} T={T} />
            <InfoCard icon={Calendar} label="تاريخ انتهاء الكارنيه" val={data.membershipExpiry} color="rose" T={T} />
            <div className="col-span-full">
              <InfoCard icon={FileText} label="ملاحظات العضوية" val={data.membershipNotes} color="gray" T={T} />
            </div>
          </div>
        )}

        {activeTab === "financial" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FundMetricCard icon={Gift} label="إجمالي ما حصل عليه من الصندوق" value={`${formatFundBenefitAmount(fundSummary.totalAmount)} ج.م`} sub={fundSummary.totalCount ? `${fundSummary.totalCount} بند دعم ومزايا مسجل` : "لا توجد حركات صندوق مرتبطة بهذا العضو"} color="emerald" T={T} />
              <FundMetricCard icon={ReceiptText} label="الصرف المباشر" value={`${formatFundBenefitAmount(fundSummary.directSupportAmount)} ج.م`} sub="إعانات ودعم مالي مسجل بشيكات" color="teal" T={T} />
              <FundMetricCard icon={Calendar} label="آخر استفادة" value={latestFundLabel} sub={fundSummary.topCategory ? `أعلى تصنيف: ${fundSummary.topCategory.label}` : "سيظهر هنا آخر بند بمجرد تسجيله"} color="amber" T={T} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <InfoCard icon={DollarSign} label="الراتب الأساسي" val={formatCurrency(data.basicSalary)} color="emerald" T={T} />
              <InfoCard icon={DollarSign} label="البدلات والحوافز" val={formatCurrency(data.allowances)} color="sky" T={T} />
              <InfoCard icon={DollarSign} label="صافي المرتب التقريبي" val={formatCurrency(data.netSalary)} color="teal" T={T} />
              <InfoCard icon={Landmark} label="اسم البنك" val={data.bankName} color="purple" T={T} />
              <InfoCard icon={CreditCard} label="رقم الحساب (IBAN)" val={data.bankAccount} color="purple" T={T} />
              <InfoCard icon={CreditCard} label="رقم فيزا الصرف" val={data.atmCardNo} color="gray" T={T} />
            </div>

            <div className={clsx("p-4 rounded-xl border", T.card)}>
              <h3 className="text-[11px] font-black text-slate-500 mb-3 flex items-center gap-1.5"><Shield size={14} /> التأمينات الاجتماعية</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InfoCard icon={Hash} label="الرقم التأميني" val={data.insuranceNumber} color="amber" T={T} />
                <InfoCard icon={FileText} label="رقم الملف التأميني" val={data.insuranceFile} color="gray" T={T} />
                <InfoCard icon={DollarSign} label="الاستقطاع الشهري" val={formatCurrency(data.insuranceContrib)} color="rose" T={T} />
              </div>
            </div>
          </div>
        )}

        {activeTab === "movements" && (
          <MemberMovementsTab member={data} T={T} />
        )}

        {activeTab === "fund" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className={clsx("p-4 rounded-2xl border shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3", T.card)}>
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">سجل ما حصل عليه العضو من الصندوق</h3>
                <p className="text-[11px] font-bold text-slate-500 mt-1">
                  يشمل الإعانات، دعم الرحلات والوجبات، الجوائز، الخصومات، والخدمات العينية المسجلة داخل المنظومة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => printMemberFundBenefitsReport({ member: data, entries: fundEntries, summary: fundSummary })}
                disabled={fundEntries.length === 0}
                className={clsx(
                  "px-4 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all",
                  fundEntries.length === 0
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                <Printer size={15} /> طباعة تقرير احترافي
              </button>
            </div>

            {fundLoading && (
              <div className={clsx("p-10 rounded-2xl border text-center space-y-3", T.card)}>
                <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-xs font-black text-slate-500">جارِ تحميل سجل دعم الصندوق...</p>
              </div>
            )}

            {!fundLoading && fundError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 text-xs font-black">
                {fundError}
              </div>
            )}

            {!fundLoading && !fundError && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <FundMetricCard icon={Gift} label="إجمالي ما حصل عليه من الصندوق" value={`${formatFundBenefitAmount(fundSummary.totalAmount)} ج.م`} sub="إجمالي القيمة التقديرية المسجلة" color="emerald" T={T} />
                  <FundMetricCard icon={ReceiptText} label="عدد البنود" value={`${fundSummary.totalCount}`} sub="إعانات ومزايا ودعم نشاط" color="sky" T={T} />
                  <FundMetricCard icon={Landmark} label="صرف مالي مباشر" value={`${formatFundBenefitAmount(fundSummary.directSupportAmount)} ج.م`} sub="شيكات وإعانات ودعم مالي" color="teal" T={T} />
                  <FundMetricCard icon={Star} label="التصنيف الأكثر حصولاً" value={fundSummary.topCategory?.label || "—"} sub={fundSummary.topCategory ? `${formatFundBenefitAmount(fundSummary.topCategory.amount)} ج.م` : "لا توجد بيانات بعد"} color="amber" T={T} />
                </div>

                {fundSummary.categories.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {fundSummary.categories.map((category) => (
                      <div key={category.key} className={clsx("p-4 rounded-2xl border shadow-sm", T.card)}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase">{category.label}</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white mt-1">
                              {formatFundBenefitAmount(category.amount)} ج.م
                            </p>
                          </div>
                          <span className={clsx("px-3 py-1 rounded-full text-[10px] font-black", colorMap[category.color] || colorMap.teal)}>
                            {category.count} بند
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {fundEntries.length > 0 ? (
                  <div className={clsx("rounded-2xl border shadow-sm overflow-hidden", T.card)}>
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">التفاصيل الزمنية للدعم والمزايا</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px]">
                        <thead className="bg-slate-50 dark:bg-slate-900/40">
                          <tr className="text-[10px] font-black text-slate-500">
                            <th className="px-4 py-3 text-right">التاريخ</th>
                            <th className="px-4 py-3 text-right">التصنيف</th>
                            <th className="px-4 py-3 text-right">البيان</th>
                            <th className="px-4 py-3 text-right">المصدر</th>
                            <th className="px-4 py-3 text-right">المرجع</th>
                            <th className="px-4 py-3 text-left">القيمة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fundEntries.map((entry) => (
                            <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800 text-xs">
                              <td className="px-4 py-3 font-black text-slate-700 dark:text-slate-200 whitespace-nowrap">{formatFundBenefitDate(entry.date)}</td>
                              <td className="px-4 py-3">
                                <span className={clsx("px-2.5 py-1 rounded-full text-[10px] font-black", colorMap[entry.categoryColor] || colorMap.teal)}>
                                  {entry.categoryLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-black text-slate-800 dark:text-slate-100">{entry.title}</p>
                                {entry.description && <p className="text-[11px] font-bold text-slate-500 mt-1">{entry.description}</p>}
                              </td>
                              <td className="px-4 py-3 font-bold text-slate-600 dark:text-slate-300">{entry.sourceLabel}</td>
                              <td className="px-4 py-3 font-bold text-slate-500">{entry.reference || "—"}</td>
                              <td className="px-4 py-3 text-left font-black text-emerald-600 whitespace-nowrap">{formatFundBenefitAmount(entry.amount)} ج.م</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className={clsx("p-12 rounded-2xl border text-center space-y-3", T.card)}>
                    <Gift size={34} className="mx-auto text-slate-300" />
                    <p className="text-sm font-black text-slate-600 dark:text-slate-200">لا توجد مزايا أو إعانات مسجلة لهذا العضو حتى الآن</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      سيظهر هنا كل ما حصل عليه من الصندوق بمجرد تسجيل الإعانات أو الدعم أو المزايا داخل المنظومة.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "health" && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              <InfoCard icon={Stethoscope} label="فصيلة الدم" val={data.bloodType} color="rose" T={T} />
              <InfoCard icon={Shield} label="نوع التأمين الصحي" val={data.insuranceType} color="sky" T={T} />
              <InfoCard icon={CreditCard} label="رقم بطاقة التأمين" val={data.healthCardNo} color="teal" T={T} />
              <div className="col-span-full">
                <InfoCard icon={Heart} label="حالة إعاقة أو ظروف خاصة" val={data.specialNeeds} color="amber" T={T} />
              </div>
            </div>

            <div className={clsx("p-4 rounded-xl border bg-rose-50/30 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30", T.card)}>
              <h3 className="text-[11px] font-black text-rose-600 mb-3 flex items-center gap-1.5"><PhoneCall size={14} /> جهة الاتصال في الطوارئ</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InfoCard icon={User} label="اسم جهة الطوارئ" val={data.emergencyName} color="rose" T={T} />
                <InfoCard icon={Phone} label="رقم هاتف الطوارئ" val={data.emergencyPhone} color="rose" T={T} />
                <InfoCard icon={Users} label="صلة القرابة" val={data.emergencyRelation} color="rose" T={T} />
              </div>
            </div>
          </div>
        )}

        {canViewAttachments && activeTab === "attachments" && (
          <div className="animate-in fade-in duration-300">
            {data.attachments && data.attachments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {data.attachments.map((doc, idx) => (
                  <div key={idx} className={clsx("p-3 rounded-xl border flex flex-col items-center text-center group hover:shadow-md transition-all relative overflow-hidden", T.card)}>
                    {doc.url && (
                      <a href={doc.url} download={doc.name} className="absolute inset-0 bg-teal-600/90 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 text-white backdrop-blur-sm cursor-pointer">
                        <Download size={24} className="mb-2 animate-bounce" />
                        <span className="text-[10px] font-black uppercase tracking-wider">تنزيل الملف</span>
                      </a>
                    )}

                    <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-2">
                      {getFileIcon(doc.name)}
                    </div>
                    <p className="text-[11px] font-black text-slate-800 dark:text-slate-100 w-full truncate px-2" title={doc.name}>{doc.name}</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-1">{doc.size || "حجم غير معروف"} • {doc.uploadedAt || "تاريخ غير معروف"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-50/50 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <FileText size={36} className="opacity-20 mb-3" />
                <p className="text-xs font-black">لا توجد وثائق مؤرشفة</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
