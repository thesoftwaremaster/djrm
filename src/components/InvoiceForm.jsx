import { useMemo, useState } from 'react'
import TextInput from '../components/ui/TextInput'
import PrimaryButton from '../components/ui/PrimaryButton'
import { eventTypes } from '../constants'
import { isValidDateInput, isValidEmail } from '../utils/validation'

const createDefaultItem = () => ({
  clientKey: `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  description: '',
  quantity: 1,
  unit_price: '',
})

const selectClass =
  'h-11 w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-3.5 text-base text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm'

const InvoiceForm = ({
  customers = [],
  initialContext = null,
  onSubmit,
  loading = false,
}) => {
  const isBookingContext = Boolean(initialContext?.bookingId)
  const [selectedClientId, setSelectedClientId] = useState(
    initialContext?.clientId || ''
  )
  const [clientName, setClientName] = useState(initialContext?.clientName || '')
  const [clientEmail, setClientEmail] = useState(
    initialContext?.clientEmail || ''
  )
  const [clientPhone, setClientPhone] = useState(initialContext?.clientPhone || '')
  const [eventType, setEventType] = useState(initialContext?.eventType || '')
  const [eventDate, setEventDate] = useState(initialContext?.eventDate || '')
  const [venue, setVenue] = useState(initialContext?.venue || '')
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState([createDefaultItem()])
  const [errorMessage, setErrorMessage] = useState('')

  const selectedCustomer = useMemo(() => {
    return customers.find((customer) => customer.id === selectedClientId) || null
  }, [customers, selectedClientId])

  const handleSelectedClientChange = (event) => {
    const nextClientId = event.target.value
    const nextCustomer =
      customers.find((customer) => customer.id === nextClientId) || null

    setSelectedClientId(nextClientId)

    if (!nextCustomer) {
      return
    }

    setClientName(nextCustomer.name || '')
    setClientEmail(nextCustomer.email || '')
    setClientPhone(nextCustomer.phone || '')
  }

  const handleClientNameChange = (event) => {
    if (isBookingContext) {
      return
    }

    if (selectedClientId) {
      setSelectedClientId('')
    }

    setClientName(event.target.value)
  }

  const handleClientEmailChange = (event) => {
    if (isBookingContext) {
      return
    }

    if (selectedClientId) {
      setSelectedClientId('')
    }

    setClientEmail(event.target.value)
  }

  const handleClientPhoneChange = (event) => {
    if (isBookingContext) {
      return
    }

    if (selectedClientId) {
      setSelectedClientId('')
    }

    setClientPhone(event.target.value)
  }

  const resetForm = () => {
    setSelectedClientId(initialContext?.clientId || '')
    setClientName(initialContext?.clientName || '')
    setClientEmail(initialContext?.clientEmail || '')
    setClientPhone(initialContext?.clientPhone || '')
    setEventType(initialContext?.eventType || '')
    setEventDate(initialContext?.eventDate || '')
    setVenue(initialContext?.venue || '')
    setDueDate('')
    setItems([createDefaultItem()])
  }

  const updateItem = (index, updates) => {
    setItems((currentItems) =>
      currentItems.map((currentItem, currentIndex) =>
        currentIndex === index ? { ...currentItem, ...updates } : currentItem
      )
    )
  }

  const addItem = () => {
    setItems((currentItems) => [...currentItems, createDefaultItem()])
  }

  const removeItem = (index) => {
    setItems((currentItems) =>
      currentItems.length === 1
        ? currentItems
        : currentItems.filter((_, currentIndex) => currentIndex !== index)
    )
  }

  const invoiceTotals = useMemo(() => {
    const subtotal = items.reduce((sum, currentItem) => {
      const quantity = Number(currentItem.quantity || 0)
      const unitPrice = Number(currentItem.unit_price || 0)
      const lineTotal = quantity * unitPrice

      return Number.isFinite(lineTotal) ? sum + lineTotal : sum
    }, 0)

    return {
      subtotal,
      tax: 0,
      total: subtotal,
    }
  }, [items])

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (loading) return

    if (!clientName.trim()) {
      setErrorMessage('Client name is required.')
      return
    }

    if (!clientEmail.trim()) {
      setErrorMessage('Client email is required.')
      return
    }

    if (!isValidEmail(clientEmail)) {
      setErrorMessage('Enter a valid client email address.')
      return
    }

    if (isBookingContext && !initialContext?.bookingId) {
      setErrorMessage('This invoice needs a linked booking. Return to the booking and try again.')
      return
    }

    if (!isBookingContext) {
      if (!eventType.trim()) {
        setErrorMessage('Event type is required.')
        return
      }

      if (!eventDate || !isValidDateInput(eventDate)) {
        setErrorMessage('Enter a valid event date.')
        return
      }
    }

    if (dueDate && !isValidDateInput(dueDate)) {
      setErrorMessage('Enter a valid invoice due date.')
      return
    }

    if (!items.length) {
      setErrorMessage('At least one invoice item is required.')
      return
    }

    const invalidItem = items.find((item) => {
      const quantity = Number(item.quantity)
      const unitPrice = Number(item.unit_price)

      return (
        !item.description?.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      )
    })

    if (invalidItem) {
      setErrorMessage('Each invoice item needs a description, quantity above 0, and unit price of 0 or more.')
      return
    }

    setErrorMessage('')

    const hasEventDetails = eventType || eventDate || venue

    const submitted = await onSubmit?.({
      client: {
        id: selectedClientId || undefined,
        name: clientName,
        email: clientEmail,
        phone: clientPhone,
      },
      enquiry: {
        event_type: eventType,
        event_date: eventDate,
      },
      booking: {
        id: initialContext?.bookingId,
      },
      event: hasEventDetails
        ? {
            event_type: eventType,
            event_date: eventDate,
            venue,
          }
        : null,
      invoice: {
        status: 'draft',
        due_date: dueDate,
        subtotal: invoiceTotals.subtotal,
      },
      items,
    })

    if (submitted !== false) {
      resetForm()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {isBookingContext ? (
        <div className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
          <p className="text-sm font-medium text-text-muted">Booking context</p>
          <h3 className="mt-1 text-lg font-semibold text-text-primary">
            Booking #{initialContext.bookingId?.slice(0, 8)}
          </h3>
          <div className="mt-4 space-y-3 text-sm text-text-secondary">
            <div className="rounded-2xl bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Customer
              </p>
              <p className="mt-1 font-medium text-text-primary">{clientName}</p>
              <p className="mt-1 break-all">{clientEmail}</p>
              {clientPhone && <p className="mt-1">{clientPhone}</p>}
            </div>

            {(eventType || eventDate || venue) && (
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                  Event
                </p>
                {eventType && (
                  <p className="mt-1 font-medium text-text-primary">{eventType}</p>
                )}
                {eventDate && <p className="mt-1">{eventDate}</p>}
                {venue && <p className="mt-1">{venue}</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              Link existing customer optional
            </label>

            <select
              value={selectedClientId}
              onChange={handleSelectedClientChange}
              className={selectClass}
            >
              <option value="">Create or match by email</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} {customer.email ? `(${customer.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          <TextInput
            label="Client name"
            value={clientName}
            onChange={handleClientNameChange}
            placeholder="Client name"
            required
          />

          <TextInput
            label="Email"
            type="email"
            value={clientEmail}
            onChange={handleClientEmailChange}
            placeholder="Email address"
            required
          />

          <TextInput
            label="Phone optional"
            type="tel"
            value={clientPhone}
            onChange={handleClientPhoneChange}
            placeholder="Phone number"
          />

          {selectedCustomer && (
            <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
              Using existing customer record.
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              Event type
            </label>
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className={selectClass}
              required
            >
              <option value="">Select event type</option>
              {eventType && !eventTypes.includes(eventType) && (
                <option value={eventType}>{eventType}</option>
              )}
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <TextInput
            label="Event date"
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            required
          />

          <TextInput
            label="Venue optional"
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
            placeholder="Venue"
          />
        </>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-left text-sm font-semibold text-text-primary">
            Invoice items
          </h3>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
          >
            Add item
          </button>
        </div>

        {items.map((currentItem, index) => {
          const quantity = Number(currentItem.quantity || 0)
          const unitPrice = Number(currentItem.unit_price || 0)
          const lineTotal = quantity * unitPrice
          const safeLineTotal = Number.isFinite(lineTotal) ? lineTotal : 0

          return (
            <div
              key={currentItem.clientKey}
              className="rounded-2xl border border-border-soft bg-surface p-4"
            >
              <div className="grid grid-cols-1 gap-4">
                <TextInput
                  label="Description"
                  value={currentItem.description}
                  onChange={(event) =>
                    updateItem(index, { description: event.target.value })
                  }
                  placeholder="DJ performance package"
                  required
                />

                <div className="grid grid-cols-1 gap-4">
                  <TextInput
                    label="Quantity"
                    type="number"
                    min="1"
                    value={currentItem.quantity}
                    onChange={(event) =>
                      updateItem(index, { quantity: event.target.value })
                    }
                    required
                  />

                  <TextInput
                    label="Unit price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentItem.unit_price}
                    onChange={(event) =>
                      updateItem(index, { unit_price: event.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border-soft pt-3 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium text-text-primary">
                  Line total: &pound;{safeLineTotal.toFixed(2)}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="inline-flex h-9 items-center justify-center rounded-2xl border border-border-soft bg-surface px-3 text-sm font-medium text-text-secondary transition hover:bg-surface-subtle hover:text-text-primary"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
          <div className="flex justify-between gap-4">
            <span>Subtotal</span>
            <span>&pound;{invoiceTotals.subtotal.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span>Tax</span>
            <span>&pound;{invoiceTotals.tax.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4 font-semibold text-text-primary">
            <span>Total</span>
            <span>&pound;{invoiceTotals.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <TextInput
        label="Due date optional"
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />

      <div className="pt-2">
        {errorMessage && (
          <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-left text-sm text-rose-700">
            {errorMessage}
          </p>
        )}

        <PrimaryButton type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create invoice'}
        </PrimaryButton>
      </div>
    </form>
  )
}

export default InvoiceForm

