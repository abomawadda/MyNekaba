import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp, where, documentId } from "firebase/firestore";
import { db } from "../../app/providers/FirebaseProvider";
import { useT } from "../../app/providers/ThemeProvider";
import { useAuth } from "../../app/providers/AuthProvider";
import { formatEmployeeDate, getDeathDate, getRetirementDate, isDeceasedMember, isRetiredMember, sortMembersByAgeThenJobId } from "../../utils/memberBenefits";
import { logAuditEvent } from "../../utils/auditLog";
import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  IconButton,
  LoadingState,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  getModuleIcon,
} from "../../ui/enterprise";
import { filterDataByScope, getDataScope, PERMISSIONS } from "../../security/permissions";
import { getStableAttachmentOwnerIds } from "../../security/storageAuthorization";

import {
  UserPlus, Search, Eye, Edit3, Trash2,
  Users, CheckCircle2, AlertCircle,
  Briefcase, Phone, UserCircle, MessageSquare,
  Cake, GraduationCap, ArrowRight, CalendarClock,
  PieChart, Award, Activity, Building, Hash, RefreshCw, X
} from "lucide-react";
import clsx from "clsx";

import EmployeeForm from "./EmployeeForm";
import EmployeeProfile from "./EmployeeProfileFund";
import { validateEmployee } from "./validations/employeeValidation";

export default function EmployeeDashboard({ forcedEmployeeId = "" } = {}) {
  const T = useT();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const canCreateMember = can(PERMISSIONS.employeesCreate);
  const canEditMember = can(PERMISSIONS.employeesEdit);
  const canDeleteMember = can(PERMISSIONS.employeesDelete);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQ, setSearchQ] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const [statusFilter, setStatusFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [workplaceFilter, setWorkplaceFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [toast, setToast] = useState(null);

  const [currentView, setCurrentView] = useState(forcedEmployeeId ? "profile" : "dashboard");
  const [selectedEmp, setSelectedEmp] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    const scope = getDataScope(user, "employees");
    if (scope === "none") {
      setEmployees([]);
      setLoading(false);
      return undefined;
    }

    if (scope === "all") {
      const unsubEmp = onSnapshot(query(collection(db, "employees")), (snap) => {
        const nextEmployees = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setEmployees(filterDataByScope(nextEmployees, "employees", user));
        setLoading(false);
      }, (err) => {
        console.error(err);
        setLoading(false);
      });
      return () => unsubEmp();
    }

    const ownerIds = getStableAttachmentOwnerIds(user).slice(0, 10);
    if (ownerIds.length === 0) {
      setEmployees([]);
      setLoading(false);
      return undefined;
    }

    const scopedQueries = [
      query(collection(db, "employees"), where(documentId(), "in", ownerIds)),
      query(collection(db, "employees"), where("jobId", "in", ownerIds)),
      query(collection(db, "employees"), where("employeeCode", "in", ownerIds)),
    ];
    const snapshotsByQuery = new Map();
    let pending = scopedQueries.length;
    let active = true;

    const publish = () => {
      if (!active) return;
      const merged = new Map();
      snapshotsByQuery.forEach((records) => records.forEach((record) => merged.set(record.id, record)));
      setEmployees(filterDataByScope(Array.from(merged.values()), "employees", user));
      if (pending === 0) setLoading(false);
    };

    const subscriptions = scopedQueries.map((scopedQuery, index) => onSnapshot(scopedQuery, (snap) => {
      snapshotsByQuery.set(index, snap.docs.map(d => ({ id: d.id, ...d.data() })));
      pending = Math.max(0, pending - 1);
      publish();
    }, (err) => {
      console.error(err);
      snapshotsByQuery.set(index, []);
      pending = Math.max(0, pending - 1);
      publish();
    }));

    return () => {
      active = false;
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  useEffect(() => {
    if (!forcedEmployeeId || loading) return;
    const normalizedForcedId = String(forcedEmployeeId).trim();
    const matchedEmployee =
      employees.find(
        (employee) =>
          String(employee.id || "").trim() === normalizedForcedId ||
          String(employee.jobId || "").trim() === normalizedForcedId
      ) || null;
    setSelectedEmp(matchedEmployee);
    setCurrentView("profile");
  }, [employees, forcedEmployeeId, loading]);

  const stats = useMemo(() => {
    let totalActiveCount = 0;
    let generalCount = 0, independentCount = 0;
    let males = 0, females = 0;
    let activeCount = 0, inactiveCount = 0;

    let retiringList = [];
    let deceasedList = [];
    let bDays = { today: [], tomorrow: [], yesterday: [] };
    let anniversaries = [];

    const today = new Date();
    const currentYear = today.getFullYear();

    const getDayStr = (offset) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const todayStr = getDayStr(0);
    const tomorrowStr = getDayStr(1);
    const yesterdayStr = getDayStr(-1);

    const parseDate = (dStr) => {
      if (!dStr) return null;
      const s = String(dStr).trim();
      if (s.includes('-')) {
        const p = s.split('-');
        if (p[0].length === 4) return { y: parseInt(p[0]), m: p[1].padStart(2, '0'), d: p[2].substring(0, 2).padStart(2, '0') };
      }
      if (s.includes('/')) {
        const p = s.split('/');
        if (p[2] && p[2].length >= 4) return { y: parseInt(p[2]), m: p[1].padStart(2, '0'), d: p[0].padStart(2, '0') };
      }
      return null;
    };

    employees.forEach(emp => {
      const inactiveStates = ['معاش', 'موقوف', 'استقالة', 'وفاة', 'إجازة'];
      const state = emp.memberState?.trim() || "نشط";
      const retired = isRetiredMember(emp);
      const deceased = isDeceasedMember(emp);
      const isActive = !retired && !deceased && !inactiveStates.some(x => state.includes(x));

      if (isActive) {
        activeCount++;
        totalActiveCount++;
        if (emp.membershipStatus?.includes('مستقل')) independentCount++;
        else generalCount++;

        if (emp.gender === 'ذكر') males++;
        else if (emp.gender === 'أنثى') females++;
      } else {
        inactiveCount++;
      }

      const bDateParsed = parseDate(emp.birthDate || emp.dateOfBirth);
      if (bDateParsed) {
        const empBdayStr = `${bDateParsed.d}/${bDateParsed.m}`;
        if (empBdayStr === todayStr) bDays.today.push(emp);
        else if (empBdayStr === tomorrowStr) bDays.tomorrow.push(emp);
        else if (empBdayStr === yesterdayStr) bDays.yesterday.push(emp);

        let retYear;
        let calcRetDate = formatEmployeeDate(getRetirementDate(emp));
        if (calcRetDate) {
          const retParsed = parseDate(calcRetDate);
          if (retParsed) retYear = retParsed.y;
        }

        if (retYear === currentYear) {
          const retParsed = parseDate(calcRetDate);
          const retirementMonth = retParsed ? Number(retParsed.m) : null;
          retiringList.push({
            ...emp,
            displayRetDate: calcRetDate,
            retired,
            isCurrentMonthRetirement: retirementMonth === today.getMonth() + 1,
          });
        }
      }

      const deathDate = formatEmployeeDate(getDeathDate(emp));
      const deathParsed = parseDate(deathDate);
      if (deathParsed?.y === currentYear) {
        deceasedList.push({
          ...emp,
          displayDeathDate: deathDate,
          deceased,
          isCurrentMonthDeath: Number(deathParsed.m) === today.getMonth() + 1,
        });
      }

      const hDateParsed = parseDate(emp.hireDate);
      if (hDateParsed) {
        const hireDayStr = `${hDateParsed.d}/${hDateParsed.m}`;
        if (hireDayStr === todayStr && hDateParsed.y < currentYear) {
          const yos = currentYear - hDateParsed.y;
          if (!isNaN(yos)) {
            anniversaries.push({ ...emp, yearsOfService: yos });
          }
        }
      }
    });

    retiringList.sort((a, b) => {
      if (a.isCurrentMonthRetirement !== b.isCurrentMonthRetirement) {
        return a.isCurrentMonthRetirement ? -1 : 1;
      }
      if (a.retired !== b.retired) {
        return a.retired ? -1 : 1;
      }
      const getTimestamp = (dStr) => {
        if (!dStr) return 0;
        const p = dStr.split('/');
        return new Date(p[2], p[1] - 1, p[0]).getTime();
      };
      return getTimestamp(b.displayRetDate) - getTimestamp(a.displayRetDate);
    });

    deceasedList.sort((a, b) => {
      if (a.isCurrentMonthDeath !== b.isCurrentMonthDeath) {
        return a.isCurrentMonthDeath ? -1 : 1;
      }
      const getTimestamp = (dStr) => {
        if (!dStr) return 0;
        const p = dStr.split('/');
        return new Date(p[2], p[1] - 1, p[0]).getTime();
      };
      return getTimestamp(b.displayDeathDate) - getTimestamp(a.displayDeathDate);
    });

    return {
      totalActiveCount, generalCount, independentCount,
      males, females, activeCount, inactiveCount,
      retiringList, deceasedList, bDays, anniversaries
    };
  }, [employees]);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => !employee.isArchived),
    [employees]
  );

  const filterOptions = useMemo(() => {
    const membershipStatuses = [...new Set(activeEmployees.map((employee) => employee.membershipStatus).filter(Boolean))].sort();
    const workplaces = [...new Set(activeEmployees.map((employee) => employee.workplace).filter(Boolean))].sort();
    return { membershipStatuses, workplaces };
  }, [activeEmployees]);

  const searchResults = useMemo(() => {
    const lowerQ = searchQ.toLowerCase().trim();
    return sortMembersByAgeThenJobId(
      activeEmployees.filter((employee) => {
        const retired = isRetiredMember(employee);
        const deceased = isDeceasedMember(employee);
        const memberState = employee.memberState || "نشط";
        const matchesSearch = !lowerQ || (
          employee.name?.toLowerCase().includes(lowerQ) ||
          employee.jobId?.toString().includes(lowerQ) ||
          employee.nationalId?.includes(lowerQ) ||
          employee.phone?.includes(lowerQ)
        );
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "active" && !retired && !deceased && memberState === "نشط") ||
          (statusFilter === "retired" && retired) ||
          (statusFilter === "deceased" && deceased) ||
          (statusFilter === "inactive" && !retired && !deceased && memberState !== "نشط");
        const matchesMembership = membershipFilter === "all" || employee.membershipStatus === membershipFilter;
        const matchesWorkplace = workplaceFilter === "all" || employee.workplace === workplaceFilter;
        return matchesSearch && matchesStatus && matchesMembership && matchesWorkplace;
      })
    );
  }, [activeEmployees, membershipFilter, searchQ, statusFilter, workplaceFilter]);

  const visibleRows = useMemo(
    () => searchResults.slice(0, visibleCount),
    [searchResults, visibleCount]
  );

  const hasActiveFilters = Boolean(searchQ.trim()) || statusFilter !== "all" || membershipFilter !== "all" || workplaceFilter !== "all";

  const clearFilters = () => {
    setSearchQ("");
    setStatusFilter("all");
    setMembershipFilter("all");
    setWorkplaceFilter("all");
    setVisibleCount(10);
  };

  const employeeColumns = useMemo(() => [
    {
      key: "name",
      header: "العضو",
      render: (employee) => {
        const retired = isRetiredMember(employee);
        const deceased = isDeceasedMember(employee);
        return (
          <button type="button" onClick={() => openProfile(employee)} className="flex min-w-[180px] items-center gap-2 text-right">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-slate-100 dark:bg-slate-800">
              {employee.photo ? <img src={employee.photo} className="h-full w-full object-cover" alt={employee.name || ""} /> : <UserCircle size={20} className="text-slate-400" />}
            </span>
            <span className="min-w-0">
              <span className={clsx("block truncate text-xs font-bold text-slate-900 dark:text-slate-100", (retired || deceased) && "line-through text-rose-700 dark:text-rose-300")}>{employee.name || "بدون اسم"}</span>
              <span className="block truncate text-[10px] font-semibold text-slate-500">{employee.membershipId || employee.unionBranch || "سجل عضو"}</span>
            </span>
          </button>
        );
      },
    },
    { key: "jobId", header: "الكود", render: (employee) => <span dir="ltr" className="num">{employee.jobId || "-"}</span> },
    { key: "jobTitle", header: "الوظيفة", render: (employee) => employee.jobTitle || "-" },
    { key: "workplace", header: "جهة العمل", render: (employee) => employee.workplace || "-" },
    { key: "membershipStatus", header: "العضوية", render: (employee) => <StatusBadge tone={employee.membershipStatus === "نقابة مستقلة" ? "warning" : "brand"}>{employee.membershipStatus || "عضو"}</StatusBadge> },
    {
      key: "memberState",
      header: "الحالة",
      render: (employee) => {
        const retired = isRetiredMember(employee);
        const deceased = isDeceasedMember(employee);
        const label = deceased ? "وفاة" : retired ? "معاش" : (employee.memberState || "نشط");
        const tone = deceased ? "neutral" : retired ? "danger" : label === "نشط" ? "success" : "warning";
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
      },
    },
    { key: "phone", header: "الهاتف", render: (employee) => <span dir="ltr" className="num">{employee.phone || "-"}</span> },
  ], []);

  const renderRowActions = (employee) => (
    <>
      <IconButton iconStart={Eye} aria-label="عرض الملف" title="عرض الملف" onClick={() => openProfile(employee)} />
      {canEditMember && <IconButton iconStart={Edit3} aria-label="تعديل" title="تعديل" onClick={() => openEditForm(employee)} />}
      {canDeleteMember && <IconButton iconStart={Trash2} aria-label="أرشفة" title="أرشفة" onClick={() => handleDelete(employee)} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" />}
    </>
  );

  const openAddForm = () => {
    if (!canCreateMember) return showToast("ليس لديك صلاحية إضافة أعضاء جدد.", "error");
    setSelectedEmp(null); setCurrentView("form");
  };
  const openEditForm = (emp) => {
    if (!canEditMember) return showToast("ليس لديك صلاحية تعديل بيانات الأعضاء.", "error");
    setSelectedEmp(emp); setCurrentView("form");
  };
  const openProfile = (emp) => { setSelectedEmp(emp); setCurrentView("profile"); };
  const closeToDashboard = () => {
    setSelectedEmp(null);
    if (forcedEmployeeId) {
      navigate("/employees");
      return;
    }
    setCurrentView("dashboard");
  };

  const handleDelete = async (emp) => {
    if (!canDeleteMember) {
      showToast("صلاحية حذف الأعضاء غير متاحة لدورك.", "error");
      return;
    }
    setDeleteTarget(emp);
  };

  const confirmDelete = async () => {
    const emp = deleteTarget;
    if (!emp) return;
    try {
      await setDoc(doc(db, "employees", emp.id), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        archivedBy: user?.id || "",
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await logAuditEvent("employees.delete", {
        targetId: emp.id,
        before: { name: emp.name, jobId: emp.jobId },
        after: { isArchived: true },
        riskLevel: "high",
      });
      setDeleteTarget(null);
      showToast("تمت أرشفة السجل والاحتفاظ ببياناته", "success");
    } catch {
      showToast("حدث خطأ أثناء الحذف", "error");
    }
  };

  const handleSaveEmp = async (formData) => {
    if ((!selectedEmp && !canCreateMember) || (selectedEmp && !canEditMember)) {
      showToast("ليس لديك صلاحية حفظ هذا التعديل.", "error");
      return;
    }
    const validationErrors = validateEmployee(formData, employees);
    if (Object.keys(validationErrors).length > 0) {
      showToast(Object.values(validationErrors)[0], "error");
      return;
    }
    try {
      if (currentView === 'form' && !selectedEmp) {
        const newDocRef = doc(collection(db, "employees"));
        await setDoc(newDocRef, { ...formData, id: newDocRef.id, createdAt: serverTimestamp() });
        await logAuditEvent("employees.create", {
          targetId: newDocRef.id,
          after: { name: formData.name, jobId: formData.jobId },
          riskLevel: "medium",
        });
        showToast("تم تسجيل العضو بنجاح!");
      } else {
        await setDoc(doc(db, "employees", formData.id || selectedEmp.id), { ...formData, updatedAt: serverTimestamp() }, { merge: true });
        await logAuditEvent("employees.update", {
          targetId: formData.id || selectedEmp.id,
          after: { name: formData.name, jobId: formData.jobId },
          riskLevel: "medium",
        });
        showToast("تم تحديث السجل بنجاح!");
      }
      closeToDashboard();
    } catch {
      showToast("حدث خطأ أثناء الحفظ", "error");
    }
  };

  if (loading) return (
    <div className="mx-auto max-w-7xl py-10" dir="rtl">
      <LoadingState title="جاري تحميل سجلات الأعضاء..." rows={5} />
    </div>
  );

  // 🎯 شاشة فورم الموظف (كاملة)
  if (currentView === "form") {
    return (
      <div className={clsx("max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500", T.text)} dir="rtl">
        <PageHeader
          title={selectedEmp ? "تحديث سجل عضو" : "تسجيل عضو جديد"}
          hint="نموذج السجل الكامل مع البيانات الوظيفية والنقابية والمرفقات"
          icon={selectedEmp ? Edit3 : UserPlus}
          actions={<Button variant="outline" iconStart={ArrowRight} onClick={closeToDashboard}>العودة للقائمة</Button>}
        />
        <div className={clsx("p-2 md:p-6 rounded-3xl border shadow-sm", T.card)}>
          <EmployeeForm
            initialData={selectedEmp}
            modalMode={selectedEmp ? "edit" : "add"}
            onSave={handleSaveEmp}
            onCancel={closeToDashboard}
            employeesDB={employees}
          />
        </div>
      </div>
    );
  }

  // 🎯 شاشة البروفايل (كاملة)
  if (currentView === "profile") {
    const liveSelectedEmp = employees.find((emp) => emp.id === selectedEmp?.id) || selectedEmp;
    if (!liveSelectedEmp) {
      return (
        <div className={clsx("max-w-4xl mx-auto space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500", T.text)} dir="rtl">
          <PageHeader
            title="الملف الشخصي الشامل"
            hint="تعذر العثور على العضو المطلوب أو ليس ضمن نطاق صلاحياتك."
            icon={UserCircle}
            actions={<Button variant="outline" iconStart={ArrowRight} onClick={closeToDashboard}>العودة للقائمة</Button>}
          />
          <EmptyState title="السجل غير متاح" description="قد يكون السجل خارج نطاق صلاحياتك أو غير موجود." />
        </div>
      );
    }
    return (
      <div className={clsx("max-w-7xl mx-auto space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500", T.text)} dir="rtl">
        <PageHeader
          title="الملف الشخصي الشامل"
          hint="الرؤية الكاملة لبيانات العضو وحالته الوظيفية والنقابية"
          icon={UserCircle}
          actions={(
            <div className="flex flex-wrap gap-2">
              {canEditMember && <Button variant="secondary" iconStart={Edit3} onClick={() => openEditForm(liveSelectedEmp)}>تعديل السجل</Button>}
              <Button variant="outline" iconStart={ArrowRight} onClick={closeToDashboard}>العودة للقائمة</Button>
            </div>
          )}
        />
        <div className={clsx("p-2 md:p-6 rounded-3xl border shadow-sm", T.card)}>
          <EmployeeProfile data={liveSelectedEmp} />
        </div>
      </div>
    );
  }

  // 🎯 الداش بورد
  return (
    <div className={clsx("max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500", T.text)} dir="rtl">

      {toast && (
        <div className={clsx("fixed top-10 left-1/2 -translate-x-1/2 z-[5000] px-5 py-2.5 rounded-xl shadow-xl flex items-center gap-2 text-white font-black animate-in fade-in slide-in-from-top-4", toast.type === "error" ? "bg-rose-600" : "bg-teal-600")}>
          {toast.type === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />} <span className="text-xs">{toast.msg}</span>
        </div>
      )}

      <PageHeader
        title="إدارة شؤون الأعضاء"
        hint="مساحة عمل موحدة لسجلات الأعضاء والجمعية العمومية والبيانات الوظيفية"
        icon={getModuleIcon("/employees")}
        actions={canCreateMember ? (
          <Button onClick={openAddForm} iconStart={UserPlus}>
            تسجيل عضو جديد
          </Button>
        ) : null}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="إجمالي الأعضاء النشطين" value={stats.totalActiveCount.toLocaleString()} sub={`${activeEmployees.length.toLocaleString()} سجل غير مؤرشف`} icon={PieChart} tone="brand" compact />
        <StatCard label="نقابة عامة / مستقلة" value={stats.generalCount.toLocaleString()} sub={`${stats.independentCount.toLocaleString()} مستقلة`} icon={Building} tone="success" compact />
        <StatCard label="ذكور / إناث" value={stats.males.toLocaleString()} sub={`${stats.females.toLocaleString()} أنثى`} icon={UserCircle} tone="info" compact />
        <StatCard label="الحالة الحالية" value={stats.activeCount.toLocaleString()} sub={`${stats.inactiveCount.toLocaleString()} غير نشط / معاش`} icon={Activity} tone="success" compact />
        <StatCard label="متابعات هذا العام" value={stats.retiringList.length.toLocaleString()} sub={`${stats.deceasedList.length.toLocaleString()} وفاة مسجلة`} icon={GraduationCap} tone="danger" compact />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-2 mt-2">
        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[250px]", T.card)}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-900/10 flex items-center justify-between">
            <h3 className="font-black text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Award size={14} /> أعياد التعيين (اليوم)</h3>
            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">{stats.anniversaries.length} عضو</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
            {stats.anniversaries.length === 0 ? (
              <p className="text-center text-[10px] font-bold text-slate-400 mt-6">لا توجد أعياد تعيين اليوم</p>
            ) : stats.anniversaries.map(emp => (
              <div key={emp.id} className="flex items-center gap-2 p-2 rounded-xl border bg-white dark:bg-slate-900 cursor-pointer hover:border-emerald-200 transition-colors" onClick={() => openProfile(emp)}>
                <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Award size={12} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black truncate">{emp.name}</p>
                  <p className="text-[8px] font-bold text-slate-500">أكمل <span className="text-emerald-600 font-black">{emp.yearsOfService}</span> سنة بالخدمة</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[250px]", T.card)}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-sky-50/50 dark:bg-sky-900/10 flex items-center justify-between">
            <h3 className="font-black text-[11px] text-sky-700 dark:text-sky-400 flex items-center gap-1.5"><Cake size={14} /> أعياد الميلاد</h3>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-3">
            {['today', 'tomorrow', 'yesterday'].map(dayKey => {
              const dayLabel = dayKey === 'today' ? '🎉 اليوم' : dayKey === 'tomorrow' ? 'غداً' : 'الأمس';
              const list = stats.bDays[dayKey];
              if (list.length === 0) return null;
              return (
                <div key={dayKey} className="space-y-1.5">
                  <h4 className="text-[9px] font-black text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">{dayLabel}</h4>
                  {list.map(emp => (
                    <div key={emp.id} className="flex items-center gap-2 p-1.5 rounded-xl border shadow-sm bg-white dark:bg-slate-900">
                      <div className="min-w-0 flex-1 cursor-pointer pl-1" onClick={() => openProfile(emp)}>
                        <p className="text-[10px] font-black truncate">{emp.name}</p>
                        <p className="text-[8px] font-bold text-slate-500" dir="ltr">{emp.birthDate || emp.dateOfBirth}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {emp.phone && <a href={`https://wa.me/2${emp.phone}`} target="_blank" rel="noreferrer" title="إرسال تهنئة" className="p-1 bg-emerald-100 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-md transition-colors"><MessageSquare size={12} /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
            {stats.bDays.today.length === 0 && stats.bDays.tomorrow.length === 0 && stats.bDays.yesterday.length === 0 && (
              <p className="text-center text-[10px] font-bold text-slate-400 mt-6">لا توجد أعياد ميلاد قريبة</p>
            )}
          </div>
        </div>

        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[250px]", T.card)}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-900/10 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-black text-[11px] text-rose-700 dark:text-rose-400 flex items-center gap-1.5"><CalendarClock size={14} /> إحالات المعاش (العام الحالي)</h3>
              <p className="text-[9px] font-bold text-rose-500">التركيز على الخارجين خلال الشهر الحالي</p>
            </div>
            <span className="text-[9px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md">{stats.retiringList.length} عضو</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {stats.retiringList.length === 0 ? (
              <p className="text-center text-[10px] font-bold text-slate-400 mt-6">لا يوجد محالين للمعاش</p>
            ) : (
              <table className="w-full text-right whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-2 font-black text-[9px] text-slate-500">التاريخ</th>
                    <th className="py-2 px-2 font-black text-[9px] text-slate-500">الاسم والسنترال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.retiringList.map(emp => (
                    <tr key={emp.id} className={clsx("cursor-pointer transition-colors", emp.isCurrentMonthRetirement ? "bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50" : "hover:bg-rose-50/50 dark:hover:bg-rose-900/20")} onClick={() => openProfile(emp)}>
                      <td className="py-1.5 px-2">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={clsx("font-black text-[9px] px-1.5 py-0.5 rounded", emp.isCurrentMonthRetirement ? "text-amber-700 bg-amber-100" : "text-rose-600 bg-rose-50")}>{emp.displayRetDate}</span>
                          {emp.isCurrentMonthRetirement && <span className="text-[8px] font-black text-amber-700">هذا الشهر</span>}
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <p className={clsx("font-black text-[10px] text-slate-800 dark:text-slate-200 truncate max-w-[130px]", emp.retired && "line-through text-rose-700 dark:text-rose-300")}>{emp.name}</p>
                        <p className="text-[8px] font-bold text-slate-500 truncate max-w-[130px]">{emp.workplace}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className={clsx("rounded-2xl border shadow-sm overflow-hidden flex flex-col h-[250px]", T.card)}>
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/70 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="font-black text-[11px] text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><AlertCircle size={14} /> حالات الوفاة (العام الحالي)</h3>
              <p className="text-[9px] font-bold text-slate-500">التركيز على الوفيات خلال الشهر الحالي</p>
            </div>
            <span className="text-[9px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">{stats.deceasedList.length} عضو</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {stats.deceasedList.length === 0 ? (
              <p className="text-center text-[10px] font-bold text-slate-400 mt-6">لا توجد حالات وفاة مسجلة هذا العام</p>
            ) : (
              <table className="w-full text-right whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-2 font-black text-[9px] text-slate-500">التاريخ</th>
                    <th className="py-2 px-2 font-black text-[9px] text-slate-500">الاسم والسنترال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {stats.deceasedList.map(emp => (
                    <tr key={emp.id} className={clsx("cursor-pointer transition-colors", emp.isCurrentMonthDeath ? "bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50" : "hover:bg-slate-50 dark:hover:bg-slate-800/30")} onClick={() => openProfile(emp)}>
                      <td className="py-1.5 px-2">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={clsx("font-black text-[9px] px-1.5 py-0.5 rounded", emp.isCurrentMonthDeath ? "text-amber-700 bg-amber-100" : "text-slate-700 bg-slate-100 dark:bg-slate-700 dark:text-slate-100")}>{emp.displayDeathDate}</span>
                          {emp.isCurrentMonthDeath && <span className="text-[8px] font-black text-amber-700">هذا الشهر</span>}
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <p className="font-black text-[10px] text-slate-800 dark:text-slate-200 truncate max-w-[130px] line-through opacity-75">{emp.name}</p>
                        <p className="text-[8px] font-bold text-slate-500 truncate max-w-[130px]">{emp.workplace}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      <div className={clsx("rounded-xl border p-3 shadow-sm", T.card)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={searchQ}
            onChange={(value) => {
              setSearchQ(value);
              setVisibleCount(10);
            }}
            placeholder="بحث بالاسم، الكود، الرقم القومي، الهاتف..."
            className="min-w-0 lg:max-w-md"
          />
          <FilterBar className="flex-1">
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setVisibleCount(10); }} className={clsx("h-9 rounded-lg border px-3 text-xs font-semibold outline-none", T.sel)}>
              <option value="all">كل الحالات</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
              <option value="retired">معاش</option>
              <option value="deceased">وفاة</option>
            </select>
            <select value={membershipFilter} onChange={(event) => { setMembershipFilter(event.target.value); setVisibleCount(10); }} className={clsx("h-9 rounded-lg border px-3 text-xs font-semibold outline-none", T.sel)}>
              <option value="all">كل العضويات</option>
              {filterOptions.membershipStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={workplaceFilter} onChange={(event) => { setWorkplaceFilter(event.target.value); setVisibleCount(10); }} className={clsx("h-9 min-w-[150px] rounded-lg border px-3 text-xs font-semibold outline-none", T.sel)}>
              <option value="all">كل مواقع العمل</option>
              {filterOptions.workplaces.map((workplace) => <option key={workplace} value={workplace}>{workplace}</option>)}
            </select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" iconStart={X} onClick={clearFilters}>
                مسح الفلاتر
              </Button>
            )}
          </FilterBar>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
          <span>المعروض: {searchResults.length.toLocaleString()} من {activeEmployees.length.toLocaleString()} سجل</span>
          {hasActiveFilters && <StatusBadge tone="brand">فلاتر نشطة</StatusBadge>}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Users size={18} className="text-brand-700" /> دليل الأعضاء
            <StatusBadge tone="brand">{searchResults.length.toLocaleString()}</StatusBadge>
          </h2>
        </div>

        {searchResults.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? "لا توجد نتائج مطابقة" : "لا توجد سجلات أعضاء"}
            description={hasActiveFilters ? "جرّب مسح البحث أو تغيير الفلاتر الحالية." : "ابدأ بإضافة أول عضو عند توفر الصلاحية."}
            icon={Search}
            action={hasActiveFilters ? <Button variant="outline" size="sm" iconStart={X} onClick={clearFilters}>مسح الفلاتر</Button> : null}
          />
        ) : (
          <DataTable
            rows={visibleRows}
            columns={employeeColumns}
            actions={renderRowActions}
            emptyTitle="لا توجد سجلات مطابقة"
            stickyHeader
          />
        )}

        {visibleCount < searchResults.length && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" iconStart={RefreshCw} onClick={() => setVisibleCount(v => v + 10)}>
              تحميل المزيد ({(searchResults.length - visibleCount).toLocaleString()} متبقي)
            </Button>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="تأكيد أرشفة السجل"
          message={`سيتم أرشفة العضو "${deleteTarget.name || "بدون اسم"}" وإخفاؤه من القوائم النشطة مع الاحتفاظ بكل سجلاته.`}
          confirmLabel="أرشفة السجل"
          cancelLabel="تراجع"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          danger
        />
      )}

    </div>
  );
}
