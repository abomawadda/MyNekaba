/* eslint-disable no-unused-vars */
/**
 * Generic Data Importer — أداة الاستيراد الشاملة الذكية (Pro Version)
 */

import React, { useState, useMemo } from "react";
import { collection, writeBatch, doc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider"; 
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { PERMISSIONS } from "../../security/permissions";
import * as XLSX from "xlsx";
import { 
  UploadCloud, CheckCircle2, AlertTriangle, RefreshCw, 
  Users, Wallet, FileText, Plane, Settings, Trash2, X, Info, Download, Undo2
} from "lucide-react";
import clsx from "clsx";

// ════════════════════════════════════════════════════════════
// 🧠 أداة تفريغ الرقم القومي
// ════════════════════════════════════════════════════════════
const parseNationalID = (nid) => {
  if (!nid || String(nid).length !== 14 || isNaN(nid)) return null;
  const nidStr = String(nid);
  const century = nidStr[0] === "2" ? "19" : nidStr[0] === "3" ? "20" : null;
  if (!century) return null;
  
  const year = century + nidStr.slice(1, 3);
  const month = nidStr.slice(3, 5);
  const day = nidStr.slice(5, 7);
  const govCode = nidStr.slice(7, 9);
  const genderCode = parseInt(nidStr[12]);
  
  const dob = `${year}-${month}-${day}`;
  const gender = genderCode % 2 === 0 ? "أنثى" : "ذكر";
  
  const GOV_MAP = {
    "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
    "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية",
    "15": "كفر الشيخ", "16": "الغربية", "17": "المنوفية", "18": "البحيرة",
    "19": "الإسماعيلية", "21": "الجيزة", "22": "بني سويف", "23": "الفيوم",
    "24": "المنيا", "25": "أسيوط", "26": "سوهاج", "27": "قنا", "28": "أسوان",
    "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد",
    "33": "مطروح", "34": "شمال سيناء", "35": "جنوب سيناء", "88": "خارج الجمهورية"
  };
  
  return { dob, gender, gov: GOV_MAP[govCode] || `كود ${govCode}` };
};

const getVal = (row, keys) => {
  for (let k of keys) {
    if (row[k] !== undefined && row[k] !== null) return String(row[k]);
  }
  return "";
};

// ════════════════════════════════════════════════════════════
// ⚙️ إعدادات الوحدات
// ════════════════════════════════════════════════════════════
const IMPORT_MODULES = {
  employees: {
    id: "employees",
    title: "سجل الأعضاء",
    icon: Users,
    color: "indigo",
    collectionName: "employees",
    customDocIdField: "jobId", 
    templateHeaders: ['الرقم الوظيفي', 'الاسم', 'الرقم القومي', 'المسمى الوظيفي', 'مكان العمل', 'التخصص', 'تاريخ التعيين', 'الموبايل', 'هاتف بديل', 'المحافظة', 'العنوان', 'الرقم التأميني', 'الايميل', 'حالة العضوية', 'حالة العضو'],
    requiredFields: [
      ['اسم', 'name', 'esm'], 
      ['قومي', 'nationalid', 'nid'], 
      ['وظيف', 'jobid', 'code', 'id']
    ], 
    transformRow: (row) => {
      const nid = getVal(row, ['nationalId', 'nid', 'الرقم القومي', 'رقم قومي', 'قومي']).trim();
      const parsedData = parseNationalID(nid);
      
      const formatToEG = (dStr) => {
        if (!dStr) return "";
        const s = String(dStr).trim();
        if (s.includes("-")) { const [y, m, d] = s.split("-"); if (y.length === 4) return `${d}/${m}/${y}`; }
        return s;
      };

      return {
        jobId: getVal(row, ['jobId', 'id', 'code', 'الرقم الوظيفي', 'كود']).trim() || String(Date.now()),
        name: getVal(row, ['name', 'esm', 'الاسم', 'اسم العضو']).trim(),
        nationalId: nid,
        jobTitle: getVal(row, ['jobTitle', 'job', 'position', 'المسمى الوظيفي', 'الوظيفة الحالية وتاريخها']).trim() || 'عضو',
        workplace: getVal(row, ['workplace', 'place', 'central', 'جهة العمل', 'مكان العمل', 'السنترال']).trim(),
        specialization: getVal(row, ['specialization', 'المجموعة الوظيفية', 'التخصص']).trim(),
        qualification: getVal(row, ['qualification', 'المؤهل']).trim(),
        hireDate: formatToEG(getVal(row, ['hireDate', 'تاريخ التعيين', 'تاريخ العمل'])),
        membershipStatus: getVal(row, ['membershipStatus', 'الصفة', 'حالة العضوية']).trim() || 'عضو جمعية عمومية',
        memberState: getVal(row, ['memberState', 'nekaba', 'حالة العضو']).trim() || 'نشط',
        phone: getVal(row, ['phone', 'mobile', 'الهاتف', 'الموبايل', 'رقم الموبايل']).trim(),
        phone2: getVal(row, ['phone2', 'what\'s up', 'mobile2', 'هاتف بديل', 'رقم بديل']).trim(),
        email: getVal(row, ['email', 'ايميل', 'البريد', 'الايميل']).trim(),
        governorate: getVal(row, ['governorate', 'المنطقة/الإدارة العامة', 'city', 'المحافظة', 'مدينة']).trim(),
        address: getVal(row, ['address', 'العنوان']).trim(),
        insuranceNumber: getVal(row, ['insuranceNumber', 'الرقم التأمينى', 'الرقم التأميني', 'رقم التأمين']).trim(),
        dateOfBirth: parsedData ? formatToEG(parsedData.dob) : formatToEG(getVal(row, ['dob', 'تاريخ الميلاد'])),
        gender: parsedData ? parsedData.gender : getVal(row, ['gender', 'النوع']).trim(),
        birthGovernorate: parsedData ? parsedData.gov : "",
        notes: (getVal(row, ['ملاحظات']) + " " + getVal(row, ['قطاع']) + " " + getVal(row, ['الوظيفة المسندة إليه'])).trim(),
        updatedAt: serverTimestamp(),
      };
    }
  },
  transactions: {
    id: "transactions",
    title: "حركات الخزينة",
    icon: Wallet,
    color: "teal",
    collectionName: "transactions",
    customDocIdField: null,
    templateHeaders: ['التاريخ', 'النوع', 'المبلغ', 'الجهة', 'البيان'],
    requiredFields: [['تاريخ', 'date'], ['نوع', 'type'], ['مبلغ', 'amount', 'value']],
    transformRow: (row) => ({
      date: getVal(row, ['date', 'التاريخ']) || new Date().toISOString().split("T")[0],
      type: getVal(row, ['type', 'النوع']) || "deposit",
      amount: Number(getVal(row, ['amount', 'المبلغ', 'value']) || 0),
      party: getVal(row, ['party', 'الجهة']).trim(),
      notes: getVal(row, ['notes', 'البيان']).trim() || 'استيراد آلي',
      state: "posted",
      createdAt: serverTimestamp(),
    })
  },
  invoices: {
    id: "invoices",
    title: "الفواتير والتسويات",
    icon: FileText,
    color: "amber",
    collectionName: "invoices",
    customDocIdField: "invoiceNumber", 
    templateHeaders: ['رقم الفاتورة', 'المورد', 'القيمة'],
    requiredFields: [['رقم الفاتورة', 'invoicenumber'], ['المورد', 'vendor'], ['القيمة', 'total']],
    transformRow: (row) => ({
      invoiceNumber: getVal(row, ['invoiceNumber', 'رقم الفاتورة']) || String(Date.now()),
      totalValue: Number(getVal(row, ['total', 'القيمة']) || 0),
      vendor: getVal(row, ['vendor', 'المورد']).trim(),
      status: "paid",
      createdAt: serverTimestamp(),
    })
  }
};

// ════════════════════════════════════════════════════════════
// 🖥️ المكون الرئيسي
// ════════════════════════════════════════════════════════════
export default function DataImporter() {
  const T = useT();
  const { can } = useAuth();
  const canImport = can(PERMISSIONS.settingsImport);
  const [file, setFile] = useState(null);
  const [dataPreview, setDataPreview] = useState([]);
  const [selectedModule, setSelectedModule] = useState(IMPORT_MODULES.employees.id);
  
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  const [actionToast, setActionToast] = useState(null);
  
  // 🎯 إضافة الإشعار العائم (Global Toast)
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000); // يختفي بعد 5 ثوانٍ
  };

  const [lastBatch, setLastBatch] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lastImportBatch")); } catch(e) { return null; }
  });

  const activeConfig = IMPORT_MODULES[selectedModule];

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([activeConfig.templateHeaders]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `قالب_استيراد_${activeConfig.title}.xlsx`);
  };

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setIsParsing(true); 

    setTimeout(() => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: "array", cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          const rawJsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
          
          const isDateColumn = (k) => {
            const kl = k.toLowerCase();
            return kl.includes('date') || kl.includes('تاريخ') || kl.includes('ميلاد') || kl.includes('تعيين');
          };
          
          const processedData = rawJsonData.map(row => {
            const newRow = {};
            for (const key in row) {
              let val = row[key];
              if (val instanceof Date) {
                const y = val.getFullYear();
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const d = String(val.getDate()).padStart(2, '0');
                val = `${y}-${m}-${d}`;
              } else if (typeof val === 'number' && val > 10000 && isDateColumn(key)) {
                const date = new Date(Math.round((val - 25569) * 864e5));
                val = date.toISOString().split('T')[0];
              }
              newRow[key] = val;
            }
            return newRow;
          });

          setDataPreview(processedData);
        } catch (error) {
          showToast("حدث خطأ أثناء قراءة الملف تأكد من صحة الصيغة.", "error");
        } finally {
          setIsParsing(false); 
        }
      };
      reader.readAsArrayBuffer(selectedFile);
    }, 100);
  };

  const handleClearFile = () => {
    setFile(null);
    setDataPreview([]);
    setImportProgress(0);
    if (document.getElementById("fileInput")) document.getElementById("fileInput").value = ""; 
  };

  const handleRemoveRow = (indexToRemove) => {
    setDataPreview(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const validationStatus = useMemo(() => {
    if (dataPreview.length === 0) return { missingColumns: [], errorCells: 0 };
    const columns = Object.keys(dataPreview[0]).map(k => k.toLowerCase());
    
    const missingCols = activeConfig.requiredFields
      .filter(reqGroup => !columns.some(c => reqGroup.some(syn => c.includes(syn.toLowerCase()))))
      .map(reqGroup => reqGroup[0]); 
    
    let errCount = 0;
    dataPreview.forEach(row => {
      Object.keys(row).forEach(key => {
        const isReq = activeConfig.requiredFields.some(reqGroup => 
          reqGroup.some(syn => key.toLowerCase().includes(syn.toLowerCase()))
        );
        if (isReq && String(row[key] || "").trim() === "") errCount++;
      });
    });

    return { missingColumns: missingCols, errorCells: errCount };
  }, [dataPreview, activeConfig]);

  const isErrorCell = (key, val) => {
    const isReq = activeConfig.requiredFields.some(reqGroup => 
      reqGroup.some(syn => key.toLowerCase().includes(syn.toLowerCase()))
    );
    return isReq && String(val || "").trim() === "";
  };

  const handleRollback = async () => {
    if (!canImport) {
      showToast("لا تملك صلاحية التراجع عن دفعات الاستيراد.", "error");
      return;
    }
    if(!lastBatch) return;
    setIsImporting(true);

    try {
      const q = query(collection(db, IMPORT_MODULES[lastBatch.module].collectionName), where("_importBatchId", "==", lastBatch.id));
      const snap = await getDocs(q);
      let batch = writeBatch(db);
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();

      localStorage.removeItem("lastImportBatch");
      setLastBatch(null);
      showToast(`تم التراجع بنجاح ومسح ${snap.size} سجل بشكل نهائي.`, "success");
    } catch (e) {
      showToast("حدث خطأ أثناء التراجع.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  const executeImport = async () => {
    if (!canImport) {
      showToast("صلاحية الاستيراد محصورة بإدارة النظام.", "error");
      return;
    }
    if (dataPreview.length === 0 || validationStatus.missingColumns.length > 0) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      let batch = writeBatch(db);
      let count = 0;
      const totalRecords = dataPreview.length;
      const batchId = "BATCH_" + Date.now();

      for (let i = 0; i < totalRecords; i++) {
        const row = dataPreview[i];
        const formattedData = activeConfig.transformRow(row);
        formattedData._importBatchId = batchId; 
        
        let docRef;
        if (activeConfig.customDocIdField && formattedData[activeConfig.customDocIdField]) {
          docRef = doc(db, activeConfig.collectionName, String(formattedData[activeConfig.customDocIdField]));
        } else {
          docRef = doc(collection(db, activeConfig.collectionName));
        }

        batch.set(docRef, formattedData, { merge: true });
        count++;

        if (count % 400 === 0) {
          await batch.commit();
          batch = writeBatch(db);
          setImportProgress(Math.round((count / totalRecords) * 100));
        }
      }

      if (count % 400 !== 0) {
        await batch.commit();
        setImportProgress(100);
      }

      const batchData = { id: batchId, module: selectedModule, count: totalRecords, time: new Date().toLocaleString("ar-EG") };
      localStorage.setItem("lastImportBatch", JSON.stringify(batchData));
      setLastBatch(batchData);

      // 🪄 إظهار رسالة النجاح العائمة والتنظيف فوراً
      showToast(`اكتملت العملية! تم استيراد وتحديث ${count} سجل بنجاح ✓`, "success");
      handleClearFile();
      setIsImporting(false);
      
    } catch (error) {
      showToast(`حدث خطأ أثناء الرفع: ${error.message}`, "error");
      setIsImporting(false);
    }
  };

  const promptClear = () => setActionToast({ type: "danger", icon: Trash2, msg: "هل أنت متأكد من إلغاء الاستيراد وإفراغ الملف الحالي؟", btn: "إفراغ الملف", onConfirm: handleClearFile });
  const promptImport = () => setActionToast({ type: "info", icon: UploadCloud, msg: `سيتم ضخ ${dataPreview.length} سجل. السجلات المكررة سيتم تحديثها. تأكيد؟`, btn: "نعم، ابدأ الضخ", onConfirm: executeImport });
  const promptRollback = () => setActionToast({ type: "danger", icon: Undo2, msg: `تنبيه حساس: سيتم مسح ${lastBatch.count} سجل تم إضافتهم في آخر دفعة بشكل نهائي. تأكيد؟`, btn: "مسح السجلات", onConfirm: handleRollback });

  return (
    <div className={clsx("max-w-6xl mx-auto p-6 space-y-6 relative", T.text)} dir="rtl">
      
      {/* 🎯 الإشعار العائم للنجاح/الفشل (Toast) */}
      {toast && (
        <div className={clsx("fixed top-10 left-1/2 -translate-x-1/2 z-[7000] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 text-white font-black", toast.type === "error" ? "bg-rose-600" : "bg-emerald-600")}>
          {toast.type === "error" ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>}
          <span className="text-xs">{toast.msg}</span>
        </div>
      )}

      {/* 🚀 شريط الـ Action Toast للتأكيد */}
      {actionToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[6000] w-[90%] max-w-sm">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl p-4 animate-in slide-in-from-top-10 fade-in duration-300 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className={clsx("p-2 rounded-full shrink-0", actionToast.type === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600')}>
                <actionToast.icon size={18}/>
              </div>
              <p className="text-xs font-black text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">{actionToast.msg}</p>
            </div>
            <div className="flex gap-2 justify-end mt-1 border-t border-slate-100 dark:border-slate-700 pt-3">
              <button onClick={() => setActionToast(null)} className="px-4 py-2 rounded-lg text-[10px] font-black bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">إلغاء</button>
              <button onClick={() => { actionToast.onConfirm(); setActionToast(null); }} className={clsx("px-5 py-2 rounded-lg text-[10px] font-black text-white shadow-sm active:scale-95 transition-all", actionToast.type === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700')}>{actionToast.btn}</button>
            </div>
          </div>
        </div>
      )}

      {/* شاشة التحميل (Overlay) */}
      {isImporting && (
        <div className="absolute inset-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 rounded-3xl animate-in fade-in">
          <RefreshCw size={40} className="animate-spin text-indigo-500 mb-4" />
          <h3 className="text-xl font-black text-indigo-700 dark:text-indigo-400 mb-2">جاري المعالجة والضخ...</h3>
          <p className="text-xs font-bold text-slate-500 mb-6">يرجى عدم إغلاق المتصفح أو تحديث الصفحة</p>
          <div className="w-full max-w-md h-4 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300 ease-out" style={{ width: `${importProgress}%` }}></div>
          </div>
          <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 mt-3">{importProgress}% مكتمل</p>
        </div>
      )}

      <div className={clsx("p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4", T.card)}>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-2xl shrink-0"><Settings size={28}/></div>
          <div>
            <h1 className="text-xl font-black mb-1">محرك الاستيراد الذكي</h1>
            <p className={clsx("text-xs font-bold leading-relaxed", T.muted)}>
              أداة مركزية لضخ البيانات. تقوم آلياً بمعالجة التواريخ واستخراج بيانات الرقم القومي.
            </p>
          </div>
        </div>
        <button onClick={downloadTemplate} className="px-5 py-2.5 shrink-0 bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white dark:bg-indigo-900/20 dark:border-indigo-800/50 dark:hover:bg-indigo-600 rounded-xl font-black text-xs transition-all flex items-center gap-2">
          <Download size={14}/> تحميل قالب الإكسيل 
        </button>
      </div>

      {lastBatch && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-4 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-3 text-amber-700 dark:text-amber-500">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg"><Undo2 size={18}/></div>
            <div>
              <p className="text-xs font-black">آخر دفعة تم استيرادها: {lastBatch.time}</p>
              <p className="text-[10px] font-bold mt-0.5 opacity-80">تم إضافة/تحديث ({lastBatch.count}) سجل في قسم [{IMPORT_MODULES[lastBatch.module]?.title}].</p>
            </div>
          </div>
          <button onClick={promptRollback} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-black shadow-sm transition-all whitespace-nowrap">
            تراجع ومسح الدفعة
          </button>
        </div>
      )}

      <div className={clsx("p-6 rounded-3xl border shadow-sm grid grid-cols-1 lg:grid-cols-5 gap-6", T.card)}>
        <div className="lg:col-span-3 space-y-3">
          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">1. حدد الوحدة المستهدفة:</label>
          <div className="grid grid-cols-2 gap-3">
            {Object.values(IMPORT_MODULES).map((mod) => {
              const Icon = mod.icon;
              const isSelected = selectedModule === mod.id;
              return (
                <button key={mod.id} disabled={dataPreview.length > 0} onClick={() => setSelectedModule(mod.id)}
                  className={clsx("p-4 rounded-2xl border flex items-center gap-3 transition-all", 
                    isSelected 
                      ? `bg-${mod.color}-50 border-${mod.color}-500 text-${mod.color}-700 dark:bg-${mod.color}-900/30 dark:text-${mod.color}-400 shadow-sm` 
                      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800/50 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800",
                    dataPreview.length > 0 && "opacity-50 cursor-not-allowed" 
                  )}>
                  <Icon size={22} className={isSelected ? `text-${mod.color}-600 dark:text-${mod.color}-400` : "text-slate-400"} /> 
                  <span className="font-black text-[11px] text-right">{mod.title}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3 relative">
          <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">2. اختر ملف البيانات (.xlsx):</label>
          <label className={clsx("flex flex-col items-center justify-center w-full h-[104px] border-2 border-dashed rounded-2xl cursor-pointer transition-colors relative overflow-hidden",
            file ? `border-${activeConfig.color}-400 bg-${activeConfig.color}-50 dark:bg-${activeConfig.color}-900/10` : "border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          )}>
            {isParsing ? (
              <div className="flex flex-col items-center justify-center text-center">
                <RefreshCw size={24} className={clsx("mb-2 animate-spin", `text-${activeConfig.color}-500`)} />
                <p className="text-xs font-black text-slate-500">جاري القراءة والفحص...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center">
                <UploadCloud size={28} className={clsx("mb-2", file ? `text-${activeConfig.color}-500` : "text-slate-400")} />
                {file ? <p className={clsx("text-xs font-black px-2 text-center", `text-${activeConfig.color}-700 dark:text-${activeConfig.color}-400`)}>{file.name}</p>
                     : <p className="text-xs font-bold text-slate-500">اضغط للاختيار أو اسحب الملف هنا</p>}
              </div>
            )}
            <input id="fileInput" type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} disabled={isParsing || isImporting} />
          </label>
        </div>
      </div>

      {dataPreview.length > 0 && !isImporting && (
        <div className={clsx("p-6 rounded-3xl border shadow-sm space-y-4", T.card, "animate-in fade-in slide-in-from-bottom-4")}>
          
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h2 className="font-black text-sm flex items-center gap-2">معاينة البيانات <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs border border-slate-200 dark:border-slate-700">إجمالي: {dataPreview.length} سجل</span></h2>
              <p className={clsx("text-[10px] font-bold mt-1 flex items-center gap-1", T.muted)}><Info size={12} className="text-sky-500"/> راجع الخلايا. السجلات المكررة سيتم دمجها تلقائياً.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={promptClear} className="px-4 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 rounded-xl font-black text-[11px] transition-all flex items-center gap-1.5 border border-rose-200 dark:border-rose-800/50">
                <X size={14}/> إلغاء وإفراغ
              </button>
              <button 
                onClick={promptImport}
                disabled={validationStatus.missingColumns.length > 0}
                className={clsx(`px-6 py-2.5 text-white rounded-xl font-black text-[11px] shadow-md transition-all flex items-center gap-2 active:scale-95`, 
                  validationStatus.missingColumns.length > 0 ? "bg-slate-400 cursor-not-allowed opacity-50" : `bg-${activeConfig.color}-600 hover:bg-${activeConfig.color}-700`)}>
                <UploadCloud size={16}/> بدء الرفع الذكي
              </button>
            </div>
          </div>

          {validationStatus.missingColumns.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-100 text-rose-700 border border-rose-300 font-black text-xs flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
              <div>
                <p>الملف المرفوع يفتقد لأعمدة أساسية! يرجى التأكد من وجود كلمات دلالية لعناوين الأعمدة التالية (عربي أو إنجليزي):</p>
                <p className="mt-1 font-bold text-[10px] bg-rose-200 dark:bg-rose-900/50 inline-block px-2 py-0.5 rounded">{validationStatus.missingColumns.join(" ، ")}</p>
              </div>
            </div>
          )}
          {validationStatus.errorCells > 0 && validationStatus.missingColumns.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:border-amber-800 font-black text-xs flex items-center gap-2">
              <Info size={16}/> تنبيه: يوجد ({validationStatus.errorCells}) خلايا فارغة في أعمدة أساسية (مظللة بالأحمر). سيتم الرفع، لكن يُفضل إكمالها.
            </div>
          )}

          <div className="overflow-x-auto max-h-[500px] custom-scrollbar rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50">
            <table className="min-w-max w-full text-right text-[10px] whitespace-nowrap border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-2 font-black text-slate-600 border border-slate-200 dark:border-slate-700 w-8 text-center bg-slate-100 dark:bg-slate-800">إجراء</th>
                  <th className="p-2 font-black text-slate-600 border border-slate-200 dark:border-slate-700 w-8 text-center bg-slate-100 dark:bg-slate-800">#</th>
                  {Object.keys(dataPreview[0]).map((key, i) => (
                    <th key={i} className="p-2 font-black text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {dataPreview.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="p-1 border border-slate-200 dark:border-slate-700 text-center">
                      <button onClick={() => handleRemoveRow(i)} className="p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 rounded transition-colors inline-flex"><Trash2 size={12}/></button>
                    </td>
                    <td className="p-1.5 font-black text-slate-500 text-center border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">{i + 1}</td>
                    {Object.keys(dataPreview[0]).map((key, j) => {
                      const val = row[key];
                      const error = isErrorCell(key, val);
                      return (
                        <td key={j} className={clsx("p-1.5 font-bold border border-slate-200 dark:border-slate-700", error ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50" : "text-slate-700 dark:text-slate-300")}>
                          {String(val ?? "")}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {dataPreview.length > 50 && (
            <p className="text-center text-[10px] font-black text-slate-500 bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
              يتم عرض أول 50 سجل فقط. (باقي الـ {dataPreview.length - 50} سجل سيتم رفعها بالكامل).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
