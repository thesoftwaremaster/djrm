import { useState } from 'react'
import { supabase } from '../supabase'
import { logActivity } from '../workflows/activityLogActions'
import { isValidDateInput } from '../utils/validation'

const AddPayment = ({ invoiceId, bookingId, remainingBalance, onSuccess }) => {
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('deposit')
  const [paid, setPaid] = useState(true)
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const inputClass =
    'h-11 w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-3.5 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100 sm:text-sm'

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (loading) return

    const parsedAmount = Number(amount)

    if (!invoiceId) {
      setErrorMessage('Open a valid invoice before adding a payment.')
      return
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Payment amount must be greater than 0.')
      return
    }

    if (Number.isFinite(Number(remainingBalance)) && parsedAmount > Number(remainingBalance)) {
      setErrorMessage('Payment amount cannot be greater than the remaining invoice balance.')
      return
    }

    if (dueDate && !isValidDateInput(dueDate)) {
      setErrorMessage('Enter a valid due date.')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const { data: payment, error } = await supabase
        .from('payments')
        .insert([
          {
            invoice_id: invoiceId,
            booking_id: bookingId,
            amount: parsedAmount,
            type,
            paid,
            due_date: dueDate || null,
          },
        ])
        .select('id, invoice_id, booking_id, type, paid, due_date')
        .single()

      if (error) throw error

      if (bookingId) {
        try {
          await logActivity({
            entityType: 'payment',
            entityId: payment.id,
            bookingId,
            action: 'payment_added',
            title: 'Payment added',
            description: 'A payment was recorded against an invoice for this booking.',
            metadata: {
              invoice_id: invoiceId,
              payment_id: payment.id,
              type: payment.type,
              paid: payment.paid,
            },
          })
        } catch (activityLogError) {
          console.warn('Activity log failed:', activityLogError)
        }
      }

      setAmount('')
      setType('deposit')
      setPaid(true)
      setDueDate('')
      await onSuccess?.()
      setSuccessMessage('Payment added successfully.')
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Could not add payment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">Amount</label>
        <input
          type="number"
          step="0.01"
          min="0"
          max={remainingBalance}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={inputClass}
          placeholder="0.00"
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">Payment type</label>
        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={inputClass}
        >
          <option value="deposit">Deposit</option>
          <option value="balance">Balance</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="flex min-h-11 items-center gap-2">
        <input
          id="paid"
          type="checkbox"
          checked={paid}
          onChange={(event) => setPaid(event.target.checked)}
        />
        <label htmlFor="paid" className="text-sm text-text-secondary">
          Mark as paid
        </label>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-text-primary">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
          {loading ? 'Saving...' : 'Add payment'}
      </button>

      {errorMessage && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-left text-sm text-rose-700">
          {errorMessage}
        </p>
      )}

      {successMessage && !errorMessage && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-left text-sm text-emerald-700">
          {successMessage}
        </p>
      )}
    </form>
  )
}

export default AddPayment

