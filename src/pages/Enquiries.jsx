import { useEffect, useMemo, useRef, useState } from 'react'
import { PlusCircle, ArrowRight, Search, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import AddEnquiry from '../components/AddEnquiry'
import EnquiryList from '../components/EnquiryList'
import useDebounce from '../hooks/useDebounce'

const Enquiries = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [enquiries, setEnquiries] = useState([])
  const [customers, setCustomers] = useState([])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || '')
  const [enquiriesLoading, setEnquiriesLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const searchInputRef = useRef(null)

  const debouncedSearchTerm = useDebounce(searchTerm, 250)

  const fetchEnquiries = async () => {
    setEnquiriesLoading(true)

    const { data, error } = await supabase
      .from('enquiries')
      .select(`
        id,
        event_type,
        event_date,
        venue,
        status,
        clients (
          id,
          name,
          email
        )
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setError(error.message || 'Could not load enquiries.')
      setEnquiriesLoading(false)
      return false
    }

    setError('')
    setEnquiries(data || [])
    setEnquiriesLoading(false)
    return true
  }

  const fetchCustomers = async () => {
    const { data, error: fetchError } = await supabase
      .from('clients')
      .select('id, name, email, phone, created_at')
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error(fetchError)
      return
    }

    setCustomers(data || [])
  }

  useEffect(() => {
    void Promise.resolve().then(() => Promise.all([fetchEnquiries(), fetchCustomers()]))
  }, [])

  useEffect(() => {
    if (!location.state?.successMessage) return

    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const handleEnquiryCreated = async () => {
    setError('')
    setSuccessMessage('')
    const refreshed = await fetchEnquiries()

    if (refreshed) {
      setSuccessMessage('Enquiry created successfully.')
    }

    await fetchCustomers()
  }

  const filteredEnquiries = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase()

    return enquiries.filter((enquiry) => {
      const matchesSearch =
        normalizedSearch === '' ||
        enquiry.clients?.name?.toLowerCase().includes(normalizedSearch) ||
        enquiry.clients?.email?.toLowerCase().includes(normalizedSearch) ||
        enquiry.event_type?.toLowerCase().includes(normalizedSearch) ||
        enquiry.venue?.toLowerCase().includes(normalizedSearch)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && enquiry.status !== 'booked') ||
        enquiry.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [enquiries, debouncedSearchTerm, statusFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('active')
    searchInputRef.current?.focus()
  }

  const hasActiveFilters =
    searchTerm.trim() !== '' || statusFilter !== 'active'

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const inputClass =
    'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100'

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

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
              <div className="min-w-0">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
                  <ArrowRight className="h-5 w-5" />
                </div>

                <p className="text-left text-sm font-medium text-text-muted">
                  Lead pipeline
                </p>
                <h2 className="mt-2 break-words text-left text-2xl font-semibold tracking-tight text-text-primary">
                  Manage enquiries
                </h2>
                <p className="mt-3 max-w-2xl text-left text-sm leading-6 text-text-secondary">
                  Track new leads, update statuses, and convert promising enquiries
                  into bookings when they're ready.
                </p>
              </div>

              <div className="self-start rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-left md:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                  Total
                </p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">
                  {filteredEnquiries.length}
                </p>
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <div className="mb-5 flex flex-col gap-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-left text-sm font-medium text-text-muted">
                    Records
                  </p>
                  <h2 className="mt-1 text-left text-xl font-semibold tracking-tight text-text-primary">
                    Active enquiries
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
                    {filteredEnquiries.length} records
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
                    placeholder="Search by client, email, event type, or venue..."
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
                  <option value="active">Active enquiries</option>
                  <option value="all">All statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="quoted">Quoted</option>
                  <option value="booked">Booked</option>
                  <option value="lost">Lost</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            {enquiriesLoading ? (
              <p className="py-6 text-center text-sm text-text-muted">
                Loading enquiries...
              </p>
            ) : (
              <EnquiryList
                enquiries={filteredEnquiries}
                onRefresh={fetchEnquiries}
              />
            )}
          </div>
        </div>

        <div className={`${cardClass} xl:sticky xl:top-28`}>
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-text-primary">
              <PlusCircle className="h-5 w-5" />
            </div>

            <div>
              <p className="text-left text-sm font-medium text-text-muted">
                New lead
              </p>
              <h2 className="mt-1 text-left text-xl font-semibold tracking-tight text-text-primary">
                Add enquiry
              </h2>
              <p className="mt-2 text-left text-sm leading-6 text-text-secondary">
                Capture a new lead and create the first step in your pipeline.
              </p>
            </div>
          </div>

          <AddEnquiry customers={customers} onSuccess={handleEnquiryCreated} />
        </div>
      </div>
    </div>
  )
}

export default Enquiries



