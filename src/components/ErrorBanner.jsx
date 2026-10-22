import Icon from "./Icon";

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl bg-rose-50 ring-1 ring-inset ring-rose-200/80 px-3.5 sm:px-4 py-3 text-sm text-rose-900 animate-pop-in"
    >
      <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-600 grid place-items-center shrink-0">
        <Icon name="alertCircle" size={14} strokeWidth={2.5} />
      </span>
      <p className="flex-1 min-w-0 break-words leading-relaxed pt-px">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 -my-1 -mr-1.5 w-8 h-8 grid place-items-center rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition-colors"
          aria-label="Dismiss message"
        >
          <Icon name="x" size={14} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
