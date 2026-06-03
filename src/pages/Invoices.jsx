import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../supabase'
import InvoiceForm from '../components/InvoiceForm'
import InvoiceList from '../components/InvoiceList'
import { createInvoiceWorkflow } from '../workflows/createInvoiceWorkflow'
import useDebounce from '../hooks/useDebounce'
import { useLocation, useNavigate } from 'react-router-dom'

const Invoices = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || '')
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const searchInputRef = useRef(null)

  const debouncedSearchTerm = useDebounce(searchTerm, 250)
  const bookingContext = location.state?.bookingContext || null

  const fetchInvoices = async () => {
    setInvoicesLoading(true)

    const { data, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        status,
        subtotal,
        tax,
        total,
        payment_status,
        amount_paid,
        balance_due,
        due_date,
        created_at,
        client_id,
        booking_id,
        clients (
          name,
          email
        )
      `)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error(fetchError)
      setError('Could not load invoices.')
      setInvoicesLoading(false)
      return
    }

    setError('')
    setInvoices(data || [])
    setInvoicesLoading(false)
  }

  const fetchCustomers = async () => {
    const { data, error: fetchError } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        email,
        phone,
        created_at
      `)
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error(fetchError)
      return
    }

    setCustomers(data || [])
  }

  useEffect(() => {
    void Promise.all([fetchInvoices(), fetchCustomers()])
  }, [])

  useEffect(() => {
    if (!location.state?.successMessage) return

    setSuccessMessage(location.state.successMessage)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase()

    return invoices.filter((invoice) => {
      const matchesSearch =
        normalizedSearch === '' ||
        invoice.invoice_number?.toLowerCase().includes(normalizedSearch) ||
        invoice.clients?.name?.toLowerCase().includes(normalizedSearch)

      const matchesStatus =
        statusFilter === 'all' || invoice.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [invoices, debouncedSearchTerm, statusFilter])

  const clearFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    searchInputRef.current?.focus()
  }

  const hasActiveFilters =
    searchTerm.trim() !== '' || statusFilter !== 'all'

  const handleCreateInvoice = async (payload) => {
    if (loading) return false

    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const result = await createInvoiceWorkflow(payload)

      await Promise.all([fetchInvoices(), fetchCustomers()])

      if (bookingContext?.bookingId && result.invoice?.id) {
        navigate(`/invoices/${result.invoice.id}`, {
          state: {
            successMessage: `Invoice created successfully. Status: ${result.invoice?.status || 'draft'}`,
          },
        })
        return true
      }

      setSuccessMessage(
        `Invoice created successfully. Status: ${result.invoice?.status || 'draft'}`
      )

      return true
    } catch (workflowError) {
      console.error(workflowError)
      setError(workflowError.message || 'Could not create invoice workflow.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const inputClass =
    'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100'

  return (
    <>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cardClass}>
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted">Records</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
                  All invoices
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
                  {filteredInvoices.length} records
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
                  placeholder="Search by invoice number or client..."
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
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {invoicesLoading ? (
            <p className="py-6 text-center text-sm text-text-muted">
              Loading invoices...
            </p>
          ) : (
            <InvoiceList invoices={filteredInvoices} />
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-border-soft bg-surface p-4 sm:p-6">
          <h2 className="text-xl font-semibold mb-6">Create invoice</h2>
          <InvoiceForm
            key={bookingContext?.bookingId || 'new-invoice'}
            customers={customers}
            initialContext={bookingContext}
            onSubmit={handleCreateInvoice}
            loading={loading}
          />

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {successMessage && !error && (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Invoices



