import { useEffect, useId } from 'react'

const DetailPanel = ({
  open,
  title,
  subtitle = '',
  onClose,
  children,
  size = 'lg',
  closeOnOverlayClick = true,
}) => {
  const titleId = useId()

  useEffect(() => {
    if (!open) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const sizeClass = size === 'xl' ? 'max-w-3xl' : 'max-w-2xl'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-text-primary/45 px-3 py-4 sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[calc(100vh-3rem)] w-full ${sizeClass} overflow-y-auto rounded-2xl border border-border-soft bg-surface p-5 text-left shadow-[0_18px_60px_rgba(15,23,42,0.18)] sm:p-6`}
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="break-words text-lg font-semibold tracking-tight text-text-primary"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {subtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle sm:w-auto"
          >
            Close
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}

export default DetailPanel
