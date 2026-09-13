/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import clsx from "clsx";

const AlertContext = createContext();

let toastId = 0;

export function AlertProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg, type = "success", duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, msg, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <AlertContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4"
        dir="rtl"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={clsx(
              "pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg ring-1 ring-black/5 text-white font-semibold text-sm animate-in fade-in slide-in-from-top-4",
              toast.type === "error" ? "bg-rose-600" : "bg-teal-600"
            )}
          >
            {toast.type === "error" ? <AlertCircle size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}
            <span className="flex-1">{toast.msg}</span>
            <button
              onClick={() => dismissToast(toast.id)}
              className="p-0.5 rounded hover:bg-white/20 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </AlertContext.Provider>
  );
}

export const useAlert = () => useContext(AlertContext);
