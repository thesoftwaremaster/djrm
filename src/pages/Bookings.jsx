import { useEffect, useMemo, useRef, useState } from 'react'
import { BriefcaseBusiness, CalendarDays, PlusCircle, Search, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import BookingList from '../components/BookingList'
import DetailPanel from '../components/common/DetailPanel'
import useDebounce from '../hooks/useDebounce'
import { eventTypes } from '../constants'
import { createBookingWithCustomer } from '../workflows/enquiryBookingActions'
import { isValidDateInput, isValidDateTimeInput, isValidEmail } from '../utils/validation'
import { getCurrentUserId } from '../utils/tenant'

const initialBookingFormValues = {
  customerId: '',
  name: '',
  email: '',
  phone: '',
  eventType: '',
  eventDate: '',
  venue: '',
  status: 'pending',
  totalPrice: '',
  startTime: '',
  endTime: '',
  notes: '',
}

const Bookings = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [customers, setCustomers] = useState([])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || '')
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [formValues, setFormValues] = useState(initialBookingFormValues)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const searchInputRef = useRef(null)

  const debouncedSearchTerm = useDebounce(searchTerm, 250)

  const fetchBookings = async () => {
    setBookingsLoading(true)

    const { data, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        total_price,
        created_at,
        enquiry_id,
        invoices (
          id,
          total
        ),
        enquiries (
          id,
          event_type,
          event_date,
          status,
          client_id,
          clients (
            id,
            name,
            email,
            phone
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error(fetchError)
      setError(fetchError.message || 'Could not load bookings.')
      setBookingsLoading(false)
      return
    }

    setError('')
    setBookings(data || [])
    setBookingsLoading(false)
  }

  const fetchCustomers = async () => {
    try {
      const userId = await getCurrentUserId()
      const { data, error: fetchError } = await supabase
        .from('clients')
        .select('id, name, email, phone, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setCustomers(data || [])
    } catch (fetchError) {
      console.error(fetchError)
      setCustomers([])
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([fetchBookings(), fetchCustomers()]))
  }, [])

  useEffect(() => {
    if (!location.state?.successMessage) return

    setSuccessMessage(location.state.successMessage)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const selectedCustomer =
    customers.find((customer) => customer.id === formValues.customerId) || null

  const matchedCustomer =
    !selectedCustomer && formValues.email.trim()
      ? customers.find((customer) => (
          customer.email?.trim().toLowerCase() === formValues.email.trim().toLowerCase()
        )) || null
      : null

  const linkedCustomer = selectedCustomer || matchedCustomer

  const updateFormValue = (field, value) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
  }

  const handleSelectedCustomerChange = (event) => {
    const customerId = event.target.value
    const customer = customers.find((item) => item.id === customerId) || null

    setFormValues((currentValues) => ({
      ...currentValues,
      customerId,
      name: customer?.name || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
    }))
  }

  const resetCreateForm = () => {
    setFormValues(initialBookingFormValues)
    setCreateError('')
  }

  const handleCreatePanelClose = () => {
    if (createLoading) return

    setShowCreatePanel(false)
    resetCreateForm()
  }

  const handleCreateBooking = async (event) => {
    event.preventDefault()

    if (createLoading) return

    const normalizedEmail = formValues.email.trim()
    const totalPrice = formValues.totalPrice.trim() ? Number(formValues.totalPrice) : 0

    if (!selectedCustomer && !matchedCustomer && !formValues.name.trim()) {
      setCreateError('Customer name is required.')
      return
    }

    if (!selectedCustomer && !matchedCustomer && !isValidEmail(normalizedEmail)) {
      setCreateError('Enter a valid customer email address.')
      return
    }

    if (!formValues.eventType.trim()) {
      setCreateError('Event type is required.')
      return
    }

    if (formValues.eventDate && !isValidDateInput(formValues.eventDate)) {
      setCreateError('Enter a valid event date.')
      return
    }

    if (!Number.isFinite(totalPrice) || totalPrice < 0) {
      setCreateError('Total price must be 0 or more.')
      return
    }

    if (!isValidDateTimeInput(formValues.startTime) || !isValidDateTimeInput(formValues.endTime)) {
      setCreateError('Enter valid event start and end times.')
      return
    }

    if (
      formValues.startTime &&
      formValues.endTime &&
      new Date(formValues.endTime) < new Date(formValues.startTime)
    ) {
      setCreateError('End time cannot be before start time.')
      return
    }

    setCreateLoading(true)
    setCreateError('')
    setError('')
    setSuccessMessage('')

    try {
      const userId = await getCurrentUserId()
      const bookingPayload = {
        clientId: selectedCustomer?.id || matchedCustomer?.id || undefined,
        name: formValues.name,
        email: formValues.email,
        phone: formValues.phone,
        eventType: formValues.eventType,
        eventDate: formValues.eventDate,
        venue: formValues.venue,
        status: formValues.status,
        totalPrice,
        startTime: formValues.startTime,
        endTime: formValues.endTime,
        notes: formValues.notes,
      }

      console.info('[Bookings] create booking current user', { currentUserId: userId })
      console.info('[Bookings] create booking payload', bookingPayload)

      const result = await createBookingWithCustomer(bookingPayload)

      console.info('[Bookings] create booking response', result)

      setShowCreatePanel(false)
      resetCreateForm()
      await Promise.all([fetchBookings(), fetchCustomers()])
      setSuccessMessage('Booking created successfully.')
      navigate(`/bookings/${result.booking.id}`, {
        state: {
          successMessage: 'Booking created successfully.',
        },
      })
    } catch (createBookingError) {
      console.error('[Bookings] create booking failed', createBookingError)
      setCreateError(createBookingError.message || 'Could not create booking.')
    } finally {
      setCreateLoading(false)
    }
  }

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const inputClass =
    'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100'

  const filteredBookings = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase()

    return bookings.filter((booking) => {
      const matchesSearch =
        normalizedSearch === '' ||
        booking.enquiries?.clients?.name?.toLowerCase().includes(normalizedSearch) ||
        booking.enquiries?.clients?.email?.toLowerCase().includes(normalizedSearch) ||
        booking.enquiries?.event_type?.toLowerCase().includes(normalizedSearch)

      const matchesStatus =
        statusFilter === 'all' || booking.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [bookings, debouncedSearchTerm, statusFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    searchInputRef.current?.focus()
  }

  const hasActiveFilters =
    searchTerm.trim() !== '' || statusFilter !== 'all'

  const confirmedCount = bookings.filter(
    (booking) => booking.status === 'confirmed'
  ).length

  const completedCount = bookings.filter(
    (booking) => booking.status === 'completed'
  ).length

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {successMessage && !error && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>

            <p className="text-left text-sm font-medium text-text-muted">Operations</p>
            <h2 className="mt-2 break-words text-left text-2xl font-semibold tracking-tight text-text-primary">
              Manage bookings
            </h2>
            <p className="text-left mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
              Keep track of confirmed jobs, monitor delivery status, and manage
              bookings that came through your enquiry pipeline.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row md:flex-col md:items-end">
            <button
              type="button"
              onClick={() => {
                setError('')
                setSuccessMessage('')
                setCreateError('')
                setShowCreatePanel(true)
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white shadow-[0_6px_20px_rgba(79,70,229,0.16)] transition hover:bg-indigo-700 sm:w-auto"
            >
              <PlusCircle className="h-4 w-4" />
              New Booking
            </button>

            <div className="self-start rounded-2xl border border-border-soft bg-surface-subtle px-5 py-4 text-left md:self-auto md:text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Total
              </p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {filteredBookings.length}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface-subtle p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
              Confirmed
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">
              {confirmedCount}
            </p>
          </div>

          <div className="rounded-2xl bg-surface-subtle p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
              Completed
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">
              {completedCount}
            </p>
          </div>

          <div className="rounded-2xl bg-surface-subtle p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-surface text-text-secondary">
              <CalendarDays className="items-center justify-center h-4 w-4" />
            </div>
            <p className="text-sm leading-6 text-text-secondary">
              Use bookings as your central job view for upcoming and active work.
            </p>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-muted">Records</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
                All bookings
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
                {filteredBookings.length} records
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-secondary transition hover:bg-surface-subtle hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setSearchTerm('')
                    searchInputRef.current?.blur()
                  }
                }}
                placeholder="Search by client, email, or event type..."
                className={`${inputClass} pl-11 pr-11`}
              />

              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('')
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-subtle hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {bookingsLoading ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Loading bookings...
          </p>
        ) : (
          <BookingList bookings={filteredBookings} />
        )}
      </div>

      <DetailPanel
        open={showCreatePanel}
        title="New booking"
        subtitle="Create the required enquiry and booking record for a customer."
        onClose={handleCreatePanelClose}
        size="xl"
      >
        <form onSubmit={handleCreateBooking} className="space-y-4">
          {customers.length > 0 && (
            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Existing customer
              </label>
              <select
                value={formValues.customerId}
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
            <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
              Using existing customer:{' '}
              <span className="font-medium text-text-primary">{linkedCustomer.name}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Customer name
              </label>
              <input
                value={formValues.name}
                onChange={(event) => {
                  setFormValues((currentValues) => ({
                    ...currentValues,
                    customerId: '',
                    name: event.target.value,
                  }))
                }}
                className={inputClass}
                placeholder="Customer name"
                required={!linkedCustomer}
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Email address
              </label>
              <input
                type="email"
                value={formValues.email}
                onChange={(event) => {
                  setFormValues((currentValues) => ({
                    ...currentValues,
                    customerId: '',
                    email: event.target.value,
                  }))
                }}
                className={inputClass}
                placeholder="Email address"
                required={!linkedCustomer}
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Phone optional
              </label>
              <input
                type="tel"
                value={formValues.phone}
                onChange={(event) => {
                  setFormValues((currentValues) => ({
                    ...currentValues,
                    customerId: '',
                    phone: event.target.value,
                  }))
                }}
                className={inputClass}
                placeholder="Phone number"
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Status
              </label>
              <select
                value={formValues.status}
                onChange={(event) => updateFormValue('status', event.target.value)}
                className={inputClass}
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Event type
              </label>
              <select
                value={formValues.eventType}
                onChange={(event) => updateFormValue('eventType', event.target.value)}
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
                Event date optional
              </label>
              <input
                type="date"
                value={formValues.eventDate}
                onChange={(event) => updateFormValue('eventDate', event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Total price
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formValues.totalPrice}
                onChange={(event) => updateFormValue('totalPrice', event.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Venue optional
              </label>
              <input
                value={formValues.venue}
                onChange={(event) => updateFormValue('venue', event.target.value)}
                className={inputClass}
                placeholder="Venue or location"
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Start optional
              </label>
              <input
                type="datetime-local"
                value={formValues.startTime}
                onChange={(event) => updateFormValue('startTime', event.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                End optional
              </label>
              <input
                type="datetime-local"
                value={formValues.endTime}
                onChange={(event) => updateFormValue('endTime', event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-left text-sm font-medium text-text-primary">
              Notes optional
            </label>
            <textarea
              value={formValues.notes}
              onChange={(event) => updateFormValue('notes', event.target.value)}
              className="min-h-24 w-full rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
              placeholder="Booking notes"
            />
          </div>

          {createError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {createError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleCreatePanelClose}
              disabled={createLoading}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={createLoading}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createLoading ? 'Creating...' : 'Create booking'}
            </button>
          </div>
        </form>
      </DetailPanel>
    </div>
  )
}

export default Bookings
