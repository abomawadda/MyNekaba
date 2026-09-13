import { AlertTriangle } from "lucide-react";
import clsx from "clsx";
import Button from "./Button";
import Dialog from "./Dialog";
import { getIconTone } from "./utils";

export default function ConfirmDialog({
  title = "تأكيد العملية",
  message = "",
  description = "",
  confirmLabel = "تأكيد",
  cancelLabel = "تراجع",
  onConfirm,
  onCancel,
  danger = true,
  loading = false,
}) {
  const tone = danger ? "danger" : "brand";

  return (
    <Dialog
      open
      title={title}
      description={description}
      onClose={loading ? undefined : onCancel}
      size="sm"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="flex-1">
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} className="flex-1">
            {confirmLabel}
          </Button>
        </div>
      )}
    >
      <div className="flex items-start gap-3">
        <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", getIconTone(tone))}>
          <AlertTriangle size={20} />
        </div>
        <p className="text-xs font-semibold leading-6 text-slate-600 dark:text-slate-300">
          {message || "راجع تفاصيل الإجراء قبل التأكيد."}
        </p>
      </div>
    </Dialog>
  );
}
