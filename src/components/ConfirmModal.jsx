import { useId } from "react";
import { useDialog } from "../lib/useDialog";
import { BACKDROP, BTN, BTN_SIZE, DIALOG } from "../lib/ui";
import Icon from "./Icon";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",        // "danger" | "warning" | "success"
  icon,                      // optional JSX
  onConfirm,
  onCancel,
}) {
  // Focus starts on Cancel so Enter never triggers a destructive action by accident.
  const dialogRef = useDialog(open, onCancel, "[data-dialog-cancel]");
  const titleId = useId();
  const messageId = useId();

  if (!open) return null;

  const variants = {
    danger: {
      badge: "bg-rose-50 ring-rose-600/15 text-rose-600",
      button: BTN.destructive,
    },
    warning: {
      badge: "bg-amber-50 ring-amber-600/15 text-amber-600",
      button: `${BTN.warning}`,
    },
    success: {
      badge: "bg-green-50 ring-green-600/15 text-green-600",
      button: BTN.primary,
    },
  };

  const v = variants[variant] || variants.danger;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className={BACKDROP} onClick={onCancel} />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        tabIndex={-1}
        className={`${DIALOG} max-w-md max-h-full overflow-y-auto rounded-3xl sm:rounded-2xl`}
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-11 h-11 rounded-2xl ring-1 ring-inset grid place-items-center shrink-0 ${v.badge}`}
              aria-hidden="true"
            >
              {icon || <Icon name="alert" size={22} strokeWidth={2.25} />}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <h3 id={titleId} className="text-base font-semibold text-slate-900 tracking-tight">
                {title}
              </h3>
              {message && (
                <div id={messageId} className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-5 sm:pb-6 sm:pt-1 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            data-dialog-cancel
            onClick={onCancel}
            className={`${BTN.secondary} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`${v.button} ${BTN_SIZE.lg} sm:h-10 w-full sm:w-auto`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
