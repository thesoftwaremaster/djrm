import ConfirmDialog from './common/ConfirmDialog'

const parseDateOnly = (value) => {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const formatDate = (value) => {
  if (!value) return 'No due date'

  const parsedDate = parseDateOnly(value) || new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString()
}

const getDueDateLabel = (payment) => {
  if (!payment.due_date) return 'No due date'
  if (payment.paid) return `Due ${formatDate(payment.due_date)}`

  const dueDate = parseDateOnly(payment.due_date)
  const today = new Date()

  today.setHours(0, 0, 0, 0)

  if (!dueDate || Number.isNaN(dueDate.getTime())) return `Due ${payment.due_date}`
  if (dueDate < today) return 'Overdue'
  if (dueDate.getTime() === today.getTime()) return 'Due today'

  return `Due ${formatDate(payment.due_date)}`
}

const PaymentList = ({
  payments = [],
  confirmRemovePaymentId = null,
  removingPaymentId = null,
  confirmStatusPaymentId = null,
  updatingPaymentId = null,
  onConfirmRemove,
  onCancelRemove,
  onRemove,
  onConfirmStatusChange,
  onCancelStatusChange,
  onUpdateStatus,
}) => {
  if (!payments.length) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        No tracked payments yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => {
        const isConfirmingRemove = confirmRemovePaymentId === payment.id
        const isRemoving = removingPaymentId === payment.id
        const isConfirmingStatus = confirmStatusPaymentId === payment.id
        const isUpdating = updatingPaymentId === payment.id
        const confirmMessage = payment.paid
          ? 'Delete this recorded payment? This will reduce the paid amount on this invoice and cannot be undone.'
          : 'Remove this tracked payment? This will remove the unpaid payment from this invoice.'
        const targetPaid = payment.paid !== true
        const statusConfirmMessage = targetPaid
          ? 'Mark this payment as paid?'
          : 'Mark this payment as unpaid? This will reduce the paid amount on the invoice.'

        return (
          <div
            key={payment.id}
            className="flex flex-col items-stretch gap-3 border-b border-border-soft pb-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="font-medium text-text-primary capitalize">
                {payment.type}
              </p>
              <p className="text-sm text-text-secondary">
                {payment.paid ? 'Paid' : 'Not paid'}
              </p>
              <p className={`text-sm ${!payment.paid && payment.due_date ? 'text-amber-700' : 'text-text-muted'}`}>
                {getDueDateLabel(payment)}
              </p>
              <p className="text-sm text-text-muted">
                {payment.created_at
                  ? new Date(payment.created_at).toLocaleDateString()
                  : ''}
              </p>

              <ConfirmDialog
                open={isConfirmingRemove}
                title={payment.paid ? 'Delete recorded payment' : 'Remove tracked payment'}
                message={confirmMessage}
                confirmLabel={payment.paid ? 'Delete payment' : 'Remove payment'}
                loadingLabel="Removing..."
                loading={isRemoving}
                onConfirm={() => onRemove?.(payment.id)}
                onCancel={onCancelRemove}
              />

              <ConfirmDialog
                open={isConfirmingStatus}
                title={targetPaid ? 'Mark payment paid' : 'Mark payment unpaid'}
                message={statusConfirmMessage}
                confirmLabel={targetPaid ? 'Mark paid' : 'Mark unpaid'}
                loadingLabel="Saving..."
                loading={isUpdating}
                onConfirm={() => onUpdateStatus?.(payment.id, targetPaid)}
                onCancel={onCancelStatusChange}
              />
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <p className="font-semibold text-text-primary sm:text-right">
                &pound;{Number(payment.amount || 0).toFixed(2)}
              </p>

              {!isConfirmingStatus && (
                <button
                  type="button"
                  onClick={() => onConfirmStatusChange?.(payment.id)}
                  disabled={Boolean(updatingPaymentId || removingPaymentId)}
                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-border-soft bg-surface px-3 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {payment.paid ? 'Mark unpaid' : 'Mark paid'}
                </button>
              )}

              {!isConfirmingRemove && (
                <button
                  type="button"
                  onClick={() => onConfirmRemove?.(payment.id)}
                  disabled={Boolean(removingPaymentId || updatingPaymentId)}
                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {payment.paid ? 'Delete' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PaymentList
