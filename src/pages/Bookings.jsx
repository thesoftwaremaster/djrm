import { useEffect, useMemo, useRef, useState } from 'react'
import { BriefcaseBusiness, CalendarDays, Search, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import BookingList from '../components/BookingList'
import useDebounce from '../hooks/useDebounce'

const Bookings = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [successMessage] = useState(location.state?.successMessage || '')
  const [bookingsLoading, setBookingsLoading] = useState(true)
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
      setError('Could not load bookings.')
      setBookingsLoading(false)
      return
    }

    setError('')
    setBookings(data || [])
    setBookingsLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => fetchBookings())
  }, [])

  useEffect(() => {
    if (!location.state?.successMessage) return

    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

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

          <div className="self-start rounded-2xl border border-border-soft bg-surface-subtle px-5 py-4 text-left md:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
              Total
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">
              {filteredBookings.length}
            </p>
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
    </div>
  )
}

export default Bookings



