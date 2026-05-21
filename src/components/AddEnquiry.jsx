import { useState } from 'react'
import { Link } from 'react-router-dom'
import { eventTypes } from '../constants'
import { createEnquiryWithCustomer } from '../workflows/enquiryBookingActions'
import { isValidDateInput, isValidEmail } from '../utils/validation'

const AddEnquiry = ({ customers = [], onSuccess }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [venue, setVenue] = useState('')
  const [eventType, setEventType] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) || null

  const matchedCustomer =
    !selectedCustomer && email.trim()
      ? customers.find(
          (customer) =>
            customer.email?.trim().toLowerCase() === email.trim().toLowerCase()
        ) || null
      : null

  const linkedCustomer = selectedCustomer || matchedCustomer

  const handleSelectedCustomerChange = (event) => {
    const nextCustomerId = event.target.value
    const nextCustomer =
      customers.find((customer) => customer.id === nextCustomerId) || null

    setSelectedCustomerId(nextCustomerId)

    if (!nextCustomer) return

    setName(nextCustomer.name || '')
    setEmail(nextCustomer.email || '')
    setPhone(nextCustomer.phone || '')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (loading) return

    const normalizedEmail = email.trim()

    if (!selectedCustomer && !name.trim()) {
      setErrorMessage('Client name is required.')
      return
    }

    if (!isValidEmail(normalizedEmail)) {
      setErrorMessage('Enter a valid email address.')
      return
    }

    if (!eventType.trim()) {
      setErrorMessage('Event type is required.')
      return
    }

    if (!eventDate || !isValidDateInput(eventDate)) {
      setErrorMessage('Enter a valid event date.')
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      await createEnquiryWithCustomer({
        clientId: selectedCustomer?.id || matchedCustomer?.id || undefined,
        name,
        email,
        phone,
        eventType,
        eventDate,
        venue,
      })

      setSelectedCustomerId('')
      setName('')
      setEmail('')
      setPhone('')
      setVenue('')
      setEventType('')
      setEventDate('')

      await onSuccess?.()
    } catch (error) {
      console.error(error)
      setErrorMessage(error.message || 'Could not add enquiry.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'h-11 w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-3.5 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100 sm:text-sm'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {customers.length > 0 && (
        <div>
          <label className="mb-2 block text-left text-sm font-medium text-text-primary">
            Existing customer optional
          </label>
          <select
            value={selectedCustomerId}
            onChange={handleSelectedCustomerChange}
            className={inputClass}
          >
            <option value="">Create or match by email</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} {customer.email ? `(${customer.email})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {linkedCustomer && (
        <div className="rounded-2xl border border-border-soft bg-surface-subtle px-3.5 py-3 text-left text-sm text-text-secondary">
          <p>
            Using existing customer: <span className="font-medium text-text-primary">{linkedCustomer.name}</span>
          </p>
          <Link
            to={`/customers/${linkedCustomer.id}`}
            className="mt-1 inline-flex font-medium text-text-primary hover:underline"
          >
            View customer
          </Link>
        </div>
      )}

      <div>
        <label className="mb-2 block text-left text-sm font-medium text-text-primary">
          Client name
        </label>
        <input
          value={name}
          onChange={(event) => {
            setSelectedCustomerId('')
            setName(event.target.value)
          }}
          placeholder="Enter client name"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-left text-sm font-medium text-text-primary">
          Email address
        </label>
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setSelectedCustomerId('')
            setEmail(event.target.value)
          }}
          placeholder="Enter email address"
          className={inputClass}
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-left text-sm font-medium text-text-primary">
          Phone optional
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(event) => {
            setSelectedCustomerId('')
            setPhone(event.target.value)
          }}
          placeholder="Phone number"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-2 block text-left text-sm font-medium text-text-primary">
          Venue optional
        </label>
        <input
          value={venue}
          onChange={(event) => setVenue(event.target.value)}
          placeholder="Venue or location"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-2 block text-left text-sm font-medium text-text-primary">
          Event type
        </label>
        <select
          value={eventType}
          onChange={(event) => setEventType(event.target.value)}
          className={inputClass}
          required
        >
          <option value="">Select event type</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-left text-sm font-medium text-text-primary">
          Event date
        </label>
        <input
          type="date"
          value={eventDate}
          onChange={(event) => setEventDate(event.target.value)}
          className={inputClass}
          required
        />
      </div>

      <div className="pt-2">
        {errorMessage && (
          <p className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-left text-sm text-rose-700">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Adding enquiry...' : 'Add enquiry'}
        </button>
      </div>
    </form>
  )
}

export default AddEnquiry

