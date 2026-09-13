/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  UserCircle,
  Phone,
  Hash,
  MessageSquare,
  Eye,
  Mail,
  Shield,
  Building2,
} from "lucide-react";
import clsx from "clsx";
import { useT } from "./ThemeProvider";

const EmployeeModalContext = createContext();

export const useEmployeeModal = () => useContext(EmployeeModalContext);

const formatPhone = (phone) => {
  if (!phone) return "";
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "20" + cleaned.slice(1);
  }
  return cleaned;
};

const buildWhatsAppURL = (phone, name) => {
  const message = encodeURIComponent(
    `مرحباً ${name} 👋\nنرجو التواصل بخصوص بياناتك في النظام.`
  );
  return `https://wa.me/${formatPhone(phone)}?text=${message}`;
};

const buildMailURL = (email, name) => {
  const subject = encodeURIComponent("طلب تواصل من النظام");
  const body = encodeURIComponent(
    `مرحباً ${name}\n\nنرجو مراجعة بياناتك في النظام.\n\nشكراً لك`
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
};

const resolveEmployeeRouteId = (employee = {}) =>
  String(
    employee?.id ||
    employee?.employeeId ||
    employee?.memberId ||
    employee?.jobId ||
    ""
  ).trim();

export const GlobalEmployeeModalProvider = ({ children }) => {
  const T = useT();
  const navigate = useNavigate();

  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  const openEmployeeModal = (emp) => {
    setSelectedEmp(emp);
    setIsOpen(true);
  };

  const closeEmployeeModal = () => {
    setIsOpen(false);
    setTimeout(() => setSelectedEmp(null), 250);
  };

  return (
    <EmployeeModalContext.Provider
      value={{ openEmployeeModal, closeEmployeeModal }}
    >
      {children}

      {isOpen && selectedEmp && (
        <div
          onClick={closeEmployeeModal}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300"
          dir="rtl"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={clsx(
              "w-full max-w-sm rounded-2xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-in zoom-in-95 duration-300",
              T.card
            )}
          >
            {/* Header — هوية المنظومة الأرجوانية بدل التيل العشوائي */}
            <div className="h-24 bg-gradient-to-l from-brand-700 to-brand-900 relative">
              <button
                onClick={closeEmployeeModal}
                className="absolute top-4 left-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-lg backdrop-blur-md transition active:scale-95"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 flex flex-col items-center -mt-12 mb-4 relative z-10">
              <div className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-md overflow-hidden">
                {selectedEmp.photo ? (
                  <img
                    src={selectedEmp.photo}
                    alt={selectedEmp.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserCircle size={48} className={T.brand.text} />
                )}
              </div>

              <h3 className={clsx("text-lg font-bold mt-3 text-center", T.text)}>
                {selectedEmp.name}
              </h3>

              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                <span className={clsx("text-[11px] font-semibold px-3 py-1 rounded-lg", T.brand.soft)}>
                  {selectedEmp.jobTitle || "بدون وظيفة"}
                </span>

                {selectedEmp.membershipStatus && (
                  <span className={clsx("text-[11px] font-semibold px-3 py-1 rounded-lg flex items-center gap-1", T.btn)}>
                    <Shield size={12} />
                    {selectedEmp.membershipStatus}
                  </span>
                )}
              </div>

              <p className={clsx("text-[11px] mt-2 flex items-center gap-1", T.muted)}>
                <Building2 size={12} />
                {selectedEmp.workplace || "غير محدد"}
              </p>
            </div>

            <div className="px-6 pb-6 space-y-2.5">
              {selectedEmp.phone ? (
                <a
                  href={buildWhatsAppURL(selectedEmp.phone, selectedEmp.name)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 border border-emerald-100 dark:border-emerald-900/40 transition group"
                >
                  <div className="p-2 bg-white/70 dark:bg-emerald-800/50 rounded-lg text-emerald-600 dark:text-emerald-300 group-hover:scale-105 transition">
                    <MessageSquare size={17} />
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[10px] font-semibold opacity-70">واتساب</p>
                    <p className="text-sm font-semibold" dir="ltr">{selectedEmp.phone}</p>
                  </div>
                </a>
              ) : (
                <div className={clsx("flex items-center gap-3 p-3 rounded-xl", T.sxn, T.muted)}>
                  <Phone size={17} />
                  <p className="text-xs">لا يوجد رقم</p>
                </div>
              )}

              {selectedEmp.email && (
                <a
                  href={buildMailURL(selectedEmp.email, selectedEmp.name)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/20 dark:hover:bg-sky-900/40 border border-sky-100 dark:border-sky-900/40 transition group"
                >
                  <div className="p-2 bg-white/70 dark:bg-sky-800/50 rounded-lg text-sky-600 dark:text-sky-300 group-hover:scale-105 transition">
                    <Mail size={17} />
                  </div>
                  <div className="flex-1 text-right min-w-0">
                    <p className="text-[10px] font-semibold opacity-70">البريد الإلكتروني</p>
                    <p className="text-sm font-semibold truncate">{selectedEmp.email}</p>
                  </div>
                </a>
              )}

              {selectedEmp.jobId && (
                <div className={clsx("flex items-center gap-3 p-3 rounded-xl", T.sxn)}>
                  <Hash size={17} className={T.muted} />
                  <div className="flex-1 text-right">
                    <p className={clsx("text-[10px]", T.muted)}>الكود الوظيفي</p>
                    <p className={clsx("text-sm font-semibold", T.text)}>{selectedEmp.jobId}</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  closeEmployeeModal();
                  const routeId = resolveEmployeeRouteId(selectedEmp);
                  if (!routeId) return;
                  navigate(`/employees/${routeId}`);
                }}
                className={clsx("w-full py-3 rounded-xl font-semibold transition flex items-center justify-center gap-2", T.brand.solid)}
              >
                <Eye size={17} />
                عرض الملف الكامل
              </button>
            </div>
          </div>
        </div>
      )}
    </EmployeeModalContext.Provider>
  );
};
