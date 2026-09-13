/* eslint-disable no-unused-vars */
import React from "react";
import { useT } from "../../app/providers/ThemeProvider";
import { 
  ArrowRight, Printer, Edit, User, CreditCard, Calendar, Award, 
  MapPin, Phone, Mail, Building, Hash, ShieldCheck, Stethoscope, 
  DollarSign, Star, Heart, FileText, Briefcase, AlertTriangle
} from "lucide-react";
import clsx from "clsx";
import { formatEmployeeDate, getDeathDate, getEmployeeBirthDate, getLegalRetirementAge, getRetirementDate, isDeceasedMember, isRetiredMember } from "../../utils/memberBenefits";

// ============================================================
// دوال مساعدة
// ============================================================

// 🎯 هذه هي الدالة التي كانت مفقودة وتسببت في الشاشة البيضاء!
const fmtDate = (d) => {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const calcAge = (birthDateStr) => {
  if (!birthDateStr) return "—";
  const [d, m, y] = birthDateStr.split("/").map(Number);
  if (!y) return "—";
  const birth = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
};

// ============================================================
// مكوّن فرعي: مجموعة بيانات
// ============================================================
const InfoBlock = ({ label, value, icon: Icon, highlight }) => (
  <div className="flex items-start gap-3">
    <div className={clsx("p-2 rounded-xl mt-0.5", highlight ? "bg-teal-100 text-teal-600" : "bg-slate-100 dark:bg-slate-800 text-slate-500")}>
      <Icon size={14} />
    </div>
    <div>
      <p className="text-[10px] font-black text-slate-400 uppercase">{label}</p>
      <p className={clsx("text-sm font-bold mt-0.5", highlight && "text-teal-700")}>{value || "—"}</p>
    </div>
  </div>
);

// ============================================================
// المكون الرئيسي: بطاقة الموظف
// ============================================================
export default function EmployeeCard({ employee, onBack, onEdit }) {
  const T = useT();
  const emp = employee || {}; // تفادي الأخطاء إذا لم يتم تمرير موظف
  const retired = isRetiredMember(emp);
  const deceased = isDeceasedMember(emp);
  const birthDate = formatEmployeeDate(getEmployeeBirthDate(emp)) || emp.birthDate || emp.dateOfBirth || "—";
  const retirementDate = formatEmployeeDate(getRetirementDate(emp)) || emp.retirementDate || "—";
  const deathDate = formatEmployeeDate(getDeathDate(emp)) || emp.deathDate || emp.dateOfDeath || "—";
  const retirementAge = getLegalRetirementAge(emp);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={clsx("pb-24 max-w-5xl mx-auto animate-in slide-in-from-right-8 duration-500", T.text)} dir="rtl">
      
      {/* ── الشريط العلوي (أزرار التحكم) - يختفي عند الطباعة ── */}
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button onClick={onBack} className={clsx("flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:bg-slate-100 dark:hover:bg-slate-800")}>
          <ArrowRight size={18} /> عودة للقائمة
        </button>
        <div className="flex gap-2">
          <button onClick={() => onEdit(emp)} className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 font-black rounded-xl hover:bg-sky-100 transition-all text-sm">
            <Edit size={16} /> تعديل البيانات
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-white font-black rounded-xl shadow-lg hover:bg-slate-900 transition-all text-sm">
            <Printer size={16} /> طباعة الملف
          </button>
        </div>
      </div>

      {/* ── البطاقة الرئيسية (التي سيتم طباعتها) ── */}
      <div className={clsx("rounded-3xl border shadow-xl overflow-hidden bg-white dark:bg-slate-950 print:shadow-none print:border-none", T.card)}>
        
        {/* الغلاف (Cover) */}
        <div className="h-32 bg-gradient-to-r from-teal-600 to-sky-700 relative print:bg-slate-100 print:border-b">
          <div className="absolute top-4 left-4 print:hidden">
            <span className="px-3 py-1 bg-white/20 backdrop-blur-md text-white rounded-full text-[10px] font-black uppercase tracking-wider">
              {emp.membershipStatus || "غير محدد"}
            </span>
          </div>
        </div>

        {/* معلومات الرأس والصورة */}
        <div className="px-8 pb-8 relative">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-end -mt-16 mb-8">
            <div className="w-32 h-32 rounded-2xl border-4 border-white dark:border-slate-950 overflow-hidden bg-slate-100 shadow-lg flex-shrink-0 relative z-10 print:border-slate-200">
              {emp.photo 
                ? <img src={emp.photo} className="w-full h-full object-cover" alt={emp.name} /> 
                : <User size={60} className="text-slate-300 m-auto mt-6" />
              }
            </div>
          <div className="flex-1 min-w-0 pb-2">
              <h1 className={clsx("text-3xl font-black text-slate-800 dark:text-slate-100 truncate", (retired || deceased) && "line-through text-rose-700 dark:text-rose-300")}>{emp.name || "لا يوجد اسم"}</h1>
              <p className="text-lg font-bold text-teal-600 dark:text-teal-500 mt-1">{emp.jobTitle || "لم يحدد مسمى وظيفي"}</p>
              {retired && <p className="text-[11px] font-black text-rose-600 mt-2">محال للمعاش: {retirementDate}</p>}
              {deceased && <p className="text-[11px] font-black text-slate-700 mt-2">وفاة: {deathDate}</p>}
            </div>
            <div className="pb-2 hidden md:block text-left">
              <p className="text-3xl font-black text-slate-200 dark:text-slate-800">{emp.jobId || "—"}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">الرقم الوظيفي</p>
            </div>
          </div>

          {/* شبكة البيانات (Grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* قسم 1: الهوية */}
            <div className="space-y-4 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:border-slate-300">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2"><ShieldCheck size={16} className="text-teal-500"/> الهوية الشخصية</h3>
              <InfoBlock label="الرقم القومي" value={emp.nationalId} icon={CreditCard} highlight />
              <InfoBlock label="الجنس" value={emp.gender} icon={User} />
              <div className="grid grid-cols-2 gap-2">
                <InfoBlock label="العمر" value={calcAge(birthDate) ? `${calcAge(birthDate)} سنة` : "—"} icon={Calendar} />
                <InfoBlock label="تاريخ الميلاد" value={birthDate} icon={Calendar} />
              </div>
              <InfoBlock label="الحالة الاجتماعية" value={emp.maritalStatus} icon={Heart} />
              <InfoBlock label="المؤهل الدراسي" value={emp.qualification} icon={Award} />
            </div>

            {/* قسم 2: الوظيفة */}
            <div className="space-y-4 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:border-slate-300">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2"><Briefcase size={16} className="text-sky-500"/> بيانات العمل</h3>
              <InfoBlock label="مكان العمل (السنترال)" value={emp.workplace} icon={Building} highlight />
              <InfoBlock label="الدرجة الوظيفية" value={emp.jobGrade} icon={Award} />
              <InfoBlock label="تاريخ التعيين" value={emp.hireDate} icon={Calendar} />
              <InfoBlock label="تاريخ الخروج للمعاش" value={retirementDate} icon={Calendar} />
            </div>

            {/* قسم 3: التواصل */}
            <div className="space-y-4 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:border-slate-300">
              <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2"><Phone size={16} className="text-purple-500"/> بيانات الاتصال</h3>
              <InfoBlock label="رقم الهاتف" value={emp.phone} icon={Phone} highlight />
              <InfoBlock label="البريد الإلكتروني" value={emp.email} icon={Mail} />
              <InfoBlock label="العنوان" value={`${emp.governorate || ''} - ${emp.city || ''} - ${emp.address || ''}`} icon={MapPin} />
              
              <div className="mt-4 pt-4 border-t border-rose-100 dark:border-rose-900/30">
                <p className="text-[10px] font-black text-rose-500 uppercase mb-2 flex items-center gap-1"><Heart size={10}/> جهة الطوارئ</p>
                <p className="text-xs font-bold">{emp.emergencyName || "—"}</p>
                <p className="text-[10px] text-slate-500">{emp.emergencyPhone} ({emp.emergencyRelation})</p>
              </div>
            </div>

            {/* قسم 4: النقابة */}
            <div className="space-y-4 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:border-slate-300 lg:col-span-2">
               <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2"><Star size={16} className="text-amber-500"/> العضوية النقابية</h3>
               {retired && (
                 <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black flex items-center gap-2">
                   <AlertTriangle size={16} />
                   لا يستحق العضو أي مزايا جديدة بعد تاريخ المعاش{retirementAge ? ` (السن القانوني ${retirementAge} سنة)` : ""}.
                 </div>
               )}
               {deceased && (
                 <div className="p-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-700 text-xs font-black flex items-center gap-2">
                   <AlertTriangle size={16} />
                   لا يستحق العضو أي مزايا جديدة بعد تاريخ الوفاة{deathDate !== "—" ? ` (${deathDate})` : ""}.
                 </div>
               )}
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <InfoBlock label="رقم العضوية" value={emp.membershipId} icon={Hash} highlight />
                 <InfoBlock label="الفرع النقابي" value={emp.unionBranch} icon={Building} />
                 <InfoBlock label="حالة الاشتراك" value={emp.subscriptionStatus} icon={DollarSign} />
               </div>
            </div>

            {/* قسم 5: الصحة */}
            <div className="space-y-4 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 print:border-slate-300">
               <h3 className="font-black text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2 border-b pb-2"><Stethoscope size={16} className="text-rose-500"/> البيانات الطبية</h3>
               <div className="grid grid-cols-2 gap-4">
                 <InfoBlock label="فصيلة الدم" value={emp.bloodType} icon={Heart} />
                 <InfoBlock label="التأمين" value={emp.insuranceType} icon={ShieldCheck} />
               </div>
               {emp.specialNeeds && (
                 <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-600 rounded-lg text-xs font-bold border border-rose-100">
                   حالة خاصة: {emp.specialNeeds}
                 </div>
               )}
            </div>

          </div>

          {/* تذييل البطاقة عند الطباعة فقط */}
          <div className="hidden print:block mt-12 pt-4 border-t border-slate-300 text-center text-[10px] font-bold text-slate-400">
            تم استخراج هذه الوثيقة من نظام شؤون الأعضاء — نقابة الاتصالات ({fmtDate(new Date())})
          </div>
        </div>
      </div>
    </div>
  );
}
