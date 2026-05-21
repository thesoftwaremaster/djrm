const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loadingLabel = 'Working...',
  loading = false,
  onConfirm,
  onCancel,
  children,
}) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-text-primary/45 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="max-h-[calc(100vh-3rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border-soft bg-surface p-5 text-left shadow-[0_18px_60px_rgba(15,23,42,0.18)] sm:p-6"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold tracking-tight text-text-primary"
        >
          {title}
        </h2>

        <p className="mt-3 break-words text-sm leading-6 text-text-secondary">
          {message}
        </p>

        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-700 bg-rose-700 px-4 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog

