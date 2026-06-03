import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import CustomerList from '../components/CustomerList'
import TextInput from '../components/ui/TextInput'
import useDebounce from '../hooks/useDebounce'
import { isValidEmail } from '../utils/validation'
import { getCurrentUserId } from '../utils/tenant'

const Customers = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState([])
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || '')
  const [customersLoading, setCustomersLoading] = useState(true)
  const [createLoading, setCreateLoading] = useState(false)
  const [formValues, setFormValues] = useState({
    name: '',
    email: '',
    phone: '',
  })
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef(null)

  const debouncedSearchTerm = useDebounce(searchTerm, 250)

  const fetchCustomers = async () => {
    setCustomersLoading(true)

    try {
      const userId = await getCurrentUserId()

      const { data, error: fetchError } = await supabase
        .from('clients')
        .select(`
          id,
          name,
          email,
          phone,
          created_at
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      setError('')
      setCustomers(data || [])
    } catch (fetchError) {
      console.error(fetchError)
      setCustomers([])
      setError(fetchError.message || 'Could not load customers.')
    } finally {
      setCustomersLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => fetchCustomers())
  }, [])

  useEffect(() => {
    if (!location.state?.successMessage) return

    setSuccessMessage(location.state.successMessage)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = debouncedSearchTerm.trim().toLowerCase()

    return customers.filter((customer) => {
      return (
        normalizedSearch === '' ||
        customer.name?.toLowerCase().includes(normalizedSearch) ||
        customer.email?.toLowerCase().includes(normalizedSearch) ||
        customer.phone?.toLowerCase().includes(normalizedSearch)
      )
    })
  }, [customers, debouncedSearchTerm])

  const clearFilters = () => {
    setSearchTerm('')
    searchInputRef.current?.focus()
  }

  const hasActiveFilters = searchTerm.trim() !== ''

  const handleCreateCustomer = async (event) => {
    event.preventDefault()

    if (createLoading) return

    const normalizedEmail = formValues.email.trim().toLowerCase()

    if (!formValues.name.trim()) {
      setError('Customer name is required.')
      return
    }

    if (!normalizedEmail) {
      setError('Customer email is required.')
      return
    }

    if (!isValidEmail(normalizedEmail)) {
      setError('Enter a valid customer email address.')
      return
    }

    setCreateLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      const userId = await getCurrentUserId()
      const { data: existingCustomers, error: lookupError } = await supabase
        .from('clients')
        .select('id, name, email, phone, created_at')
        .eq('email', normalizedEmail)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)

      if (lookupError) throw lookupError

      if (existingCustomers?.[0]) {
        setSuccessMessage('A customer with this email already exists. Showing the existing record.')
        setSearchTerm(existingCustomers[0].email || normalizedEmail)
        setFormValues({ name: '', email: '', phone: '' })
        await fetchCustomers()
        return
      }

      const { error: createError } = await supabase
        .from('clients')
        .insert([
          {
            name: formValues.name.trim(),
            email: normalizedEmail,
            phone: formValues.phone.trim() || null,
            user_id: userId,
          },
        ])

      if (createError) throw createError

      setFormValues({ name: '', email: '', phone: '' })
      setSuccessMessage('Customer created successfully.')
      await fetchCustomers()
    } catch (createError) {
      console.error(createError)
      setError(createError.message || 'Could not create customer.')
    } finally {
      setCreateLoading(false)
    }
  }

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const inputClass =
    'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100'

  return (
    <>
      {error && (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={cardClass}>
          <div className="mb-5 flex flex-col gap-4">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-text-muted">Records</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
                  All customers
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
                  {filteredCustomers.length} records
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

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
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
                  placeholder="Search by name, email, or phone..."
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
            </div>
          </div>

          {customersLoading ? (
            <p className="py-6 text-center text-sm text-text-muted">
              Loading customers...
            </p>
          ) : (
            <CustomerList customers={filteredCustomers} />
          )}
        </div>

      <div className={`${cardClass} xl:sticky xl:top-28`}>
        <div className="mb-6">
          <p className="text-sm font-medium text-text-muted">New customer</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
            Create customer
          </h2>
        </div>

        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <TextInput
            label="Customer name"
            value={formValues.name}
            onChange={(event) =>
              setFormValues((currentValues) => ({
                ...currentValues,
                name: event.target.value,
              }))
            }
            placeholder="Customer name"
            required
          />

          <TextInput
            label="Email"
            type="email"
            value={formValues.email}
            onChange={(event) =>
              setFormValues((currentValues) => ({
                ...currentValues,
                email: event.target.value,
              }))
            }
            placeholder="Email address"
            required
          />

          <TextInput
            label="Phone number optional"
            type="tel"
            value={formValues.phone}
            onChange={(event) =>
              setFormValues((currentValues) => ({
                ...currentValues,
                phone: event.target.value,
              }))
            }
            placeholder="Phone number"
          />

          <button
            type="submit"
            disabled={createLoading}
            className="h-12 w-full rounded-2xl bg-accent-primary text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createLoading ? 'Creating...' : 'Create customer'}
          </button>
        </form>

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

export default Customers



