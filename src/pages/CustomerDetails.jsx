import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  UserRound,
  FileSearch,
  BriefcaseBusiness,
  ReceiptText,
  Mail,
  Phone,
  ArrowRight,
} from 'lucide-react'
import { supabase } from '../supabase'
import Card from '../components/ui/Card'
import StatusBadge from '../components/ui/StatusBadge'
import EmptyState from '../components/ui/EmptyState'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DetailPanel from '../components/common/DetailPanel'
import CommunicationTemplates from '../components/CommunicationTemplates'
import RelatedTasks from '../components/RelatedTasks'
import { deleteCustomerGuarded } from '../workflows/guardedDeleteActions'
import { createEnquiryWithCustomer, convertEnquiryToBooking } from '../workflows/enquiryBookingActions'
import { createInvoiceWorkflow } from '../workflows/createInvoiceWorkflow'
import TextInput from '../components/ui/TextInput'
import { eventTypes } from '../constants'
import { fetchBookingConflicts, getConflictLinkText } from '../utils/bookingConflicts'
import { fetchAppSettings } from '../utils/appSettings'
import { isValidDateInput, isValidEmail } from '../utils/validation'

const defaultContextForm = {
  eventType: '',
  eventDate: '',
  venue: '',
  bookingId: '',
  dueDate: '',
  itemDescription: 'DJ performance package',
  itemQuantity: '1',
  itemUnitPrice: '',
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0))

const formatDate = (value) => {
  if (!value) return 'No date'

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString()
}

const formatMessageDate = (value) => {
  if (!value) return ''

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const CustomerDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [enquiries, setEnquiries] = useState([])
  const [invoices, setInvoices] = useState([])
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [conflictWarning, setConflictWarning] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [quickAction, setQuickAction] = useState('enquiry')
  const [contextLoading, setContextLoading] = useState(false)
  const [showCommunicationsPanel, setShowCommunicationsPanel] = useState(false)
  const [showHistoryPanel, setShowHistoryPanel] = useState(false)
  const [appSettings, setAppSettings] = useState(null)
  const [contextForm, setContextForm] = useState(defaultContextForm)
  const [formValues, setFormValues] = useState({
    name: '',
    email: '',
    phone: '',
  })

  const fetchCustomerDetails = useCallback(async () => {
    setError('')

    const { data: customerData, error: customerError } = await supabase
      .from('clients')
      .select(`
        id,
        name,
        email,
        phone,
        created_at
      `)
      .eq('id', id)
      .maybeSingle()

    if (customerError) {
      console.error(customerError)
      setError('Could not load customer.')
      return
    }

    if (!customerData) {
      setError('Customer not found. They may have been deleted or you may not have access.')
      return
    }

    setCustomer(customerData)
    setFormValues({
      name: customerData.name || '',
      email: customerData.email || '',
      phone: customerData.phone || '',
    })

    const { data: enquiryData, error: enquiryError } = await supabase
      .from('enquiries')
      .select(`
        id,
        event_type,
        event_date,
        venue,
        status,
        created_at
      `)
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    if (enquiryError) {
      console.error(enquiryError)
    } else {
      setEnquiries(enquiryData || [])
    }

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        status,
        total,
        due_date,
        created_at
      `)
      .eq('client_id', id)
      .order('created_at', { ascending: false })

    if (invoiceError) {
      console.error(invoiceError)
    } else {
      setInvoices(invoiceData || [])
    }

    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        status,
        total_price,
        created_at,
        enquiries!inner (
          id,
          client_id,
          event_type,
          event_date,
          venue,
          status
        )
      `)
      .eq('enquiries.client_id', id)
      .order('created_at', { ascending: false })

    if (bookingError) {
      console.error(bookingError)
    } else {
      setBookings(bookingData || [])
    }
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(() => fetchCustomerDetails())
  }, [fetchCustomerDetails])

  useEffect(() => {
    let isMounted = true

    const fetchSettings = async () => {
      try {
        const settings = await fetchAppSettings()
        if (isMounted) setAppSettings(settings)
      } catch (settingsError) {
        console.error(settingsError)
      }
    }

    void fetchSettings()

    return () => {
      isMounted = false
    }
  }, [])

  const handleEditStart = () => {
    if (!customer) return

    setActionError('')
    setSuccessMessage('')
    setConfirmDelete(false)
    setFormValues({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
    })
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    if (!customer) return

    setActionError('')
    setSuccessMessage('')
    setFormValues({
      name: customer.name || '',
      email: customer.email || '',
      phone: customer.phone || '',
    })
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (saveLoading) return
    if (!customer) return

    const normalizedEmail = formValues.email.trim().toLowerCase()

    if (!formValues.name.trim()) {
      setActionError('Customer name is required.')
      return
    }

    if (!normalizedEmail) {
      setActionError('Email is required.')
      return
    }

    if (!isValidEmail(normalizedEmail)) {
      setActionError('Enter a valid customer email address.')
      return
    }

    setSaveLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      const { data: duplicateCustomers, error: duplicateError } = await supabase
        .from('clients')
        .select('id')
        .eq('email', normalizedEmail)
        .neq('id', customer.id)
        .limit(1)

      if (duplicateError) throw duplicateError

      if (duplicateCustomers?.[0]) {
        setActionError('Another customer already uses this email address.')
        return
      }

      const { error: updateError } = await supabase
        .from('clients')
        .update({
          name: formValues.name.trim(),
          email: normalizedEmail,
          phone: formValues.phone.trim() || null,
        })
        .eq('id', customer.id)

      if (updateError) throw updateError

      await fetchCustomerDetails()
      setIsEditing(false)
      setSuccessMessage('Customer updated successfully.')
    } catch (saveError) {
      console.error(saveError)
      setActionError(saveError.message || 'Could not update customer.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDelete = async () => {
    if (deleteLoading) return
    if (!customer) return

    setDeleteLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await deleteCustomerGuarded({ customerId: customer.id })
      navigate('/customers', {
        state: {
          successMessage: 'Customer deleted successfully.',
        },
      })
    } catch (deleteError) {
      console.error(deleteError)
      setActionError(deleteError.message || 'Could not delete customer.')
      setConfirmDelete(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCreateCustomerEnquiry = async () => {
    if (contextLoading) return
    if (!customer) return

    if (!contextForm.eventType.trim()) {
      setActionError('Event type is required.')
      return
    }

    if (!contextForm.eventDate) {
      setActionError('Event date is required.')
      return
    }

    if (!isValidDateInput(contextForm.eventDate)) {
      setActionError('Enter a valid event date.')
      return
    }

    setContextLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await createEnquiryWithCustomer({
        clientId: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        eventType: contextForm.eventType,
        eventDate: contextForm.eventDate,
        venue: contextForm.venue,
      })

      setContextForm(defaultContextForm)
      await fetchCustomerDetails()
      setSuccessMessage('Enquiry created successfully.')
    } catch (createError) {
      console.error(createError)
      setActionError(createError.message || 'Could not create enquiry.')
    } finally {
      setContextLoading(false)
    }
  }

  const handleCreateCustomerBooking = async () => {
    if (contextLoading) return
    if (!customer) return

    if (!contextForm.eventType.trim()) {
      setActionError('Event type is required.')
      return
    }

    if (!contextForm.eventDate) {
      setActionError('Event date is required.')
      return
    }

    if (!isValidDateInput(contextForm.eventDate)) {
      setActionError('Enter a valid event date.')
      return
    }

    setContextLoading(true)
    setActionError('')
    setConflictWarning(null)
    setSuccessMessage('')

    try {
      try {
        const conflictSummary = await fetchBookingConflicts({
          eventDate: contextForm.eventDate,
        })

        if (conflictSummary.hasConflict) {
          setConflictWarning(conflictSummary)
        }
      } catch (conflictError) {
        console.warn('Booking conflict check failed:', conflictError)
      }

      const { enquiry } = await createEnquiryWithCustomer({
        clientId: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        eventType: contextForm.eventType,
        eventDate: contextForm.eventDate,
        venue: contextForm.venue,
      })

      await convertEnquiryToBooking({ enquiryId: enquiry.id })
      setContextForm(defaultContextForm)
      await fetchCustomerDetails()
      setSuccessMessage('Booking created successfully.')
    } catch (createError) {
      console.error(createError)
      setActionError(createError.message || 'Could not create booking.')
    } finally {
      setContextLoading(false)
    }
  }

  const handleCreateCustomerInvoice = async () => {
    if (contextLoading) return
    if (!customer) return

    const quantity = Number(contextForm.itemQuantity)
    const unitPrice = Number(contextForm.itemUnitPrice)
    const selectedBooking = bookings.find((booking) => booking.id === contextForm.bookingId)

    if (!contextForm.bookingId) {
      setActionError('Select a booking before creating an invoice.')
      return
    }

    if (!selectedBooking) {
      setActionError('The selected booking is no longer available. Reload this customer and try again.')
      return
    }

    if (!contextForm.itemDescription.trim()) {
      setActionError('Item description is required.')
      return
    }

    if (contextForm.dueDate && !isValidDateInput(contextForm.dueDate)) {
      setActionError('Enter a valid invoice due date.')
      return
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setActionError('Item quantity must be greater than 0.')
      return
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setActionError('Item unit price must be 0 or more.')
      return
    }

    setContextLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      const lineTotal = quantity * unitPrice

      await createInvoiceWorkflow({
        client: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
        booking: {
          id: contextForm.bookingId,
        },
        invoice: {
          status: 'draft',
          due_date: contextForm.dueDate,
          subtotal: lineTotal,
        },
        items: [
          {
            description: contextForm.itemDescription,
            quantity,
            unit_price: unitPrice,
            line_total: lineTotal,
          },
        ],
      })

      setContextForm(defaultContextForm)
      await fetchCustomerDetails()
      setSuccessMessage('Invoice created successfully. Status: draft')
    } catch (createError) {
      console.error(createError)
      setActionError(createError.message || 'Could not create invoice.')
    } finally {
      setContextLoading(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          to="/customers"
          className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
        >
          Back to customers
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      </div>
    )
  }

  if (!customer) {
    return <p className="text-sm text-text-muted">Loading customer...</p>
  }

  const activeEnquiries = enquiries.filter((enquiry) => enquiry.status !== 'booked')
  const bookedEnquiryCount = enquiries.length - activeEnquiries.length
  const recordCount = activeEnquiries.length + bookings.length + invoices.length
  const latestEnquiry = enquiries[0] || null
  const customerTemplateData = {
    clientName: customer?.name || 'there',
    eventDate: formatMessageDate(latestEnquiry?.event_date),
    eventType: latestEnquiry?.event_type || 'your event',
    venue: latestEnquiry?.venue || '',
    signOff: appSettings?.display_name || appSettings?.business_name || 'DJ',
  }
  const customerEventContext = [
    customerTemplateData.eventDate ? `on ${customerTemplateData.eventDate}` : null,
    customerTemplateData.venue ? `at ${customerTemplateData.venue}` : null,
  ].filter(Boolean).join(' ')

  const customerTemplates = [
    {
      id: 'new-enquiry-reply',
      title: 'New enquiry reply',
      body: `Hi ${customerTemplateData.clientName},

Thanks for getting in touch about ${customerTemplateData.eventType}.

I would be happy to help with your event${customerEventContext ? ` ${customerEventContext}` : ''}. Could you send over any timings, music preferences, and a rough guest count when you have a moment?

Thanks,
${customerTemplateData.signOff}`,
    },
    {
      id: 'general-message',
      title: 'General message',
      body: `Hi ${customerTemplateData.clientName},

Hope you are well. I just wanted to follow up${latestEnquiry ? ` about ${customerTemplateData.eventType}` : ''}.

Let me know if there is anything else you need from me at this stage.`,
    },
    {
      id: 'thank-you-follow-up',
      title: 'Thank-you/follow-up message',
      body: `Hi ${customerTemplateData.clientName},

Thank you again${latestEnquiry ? ` for having me for ${customerTemplateData.eventType}` : ''}. I hope everyone had a brilliant time.

If you have a moment, I would really appreciate any feedback or a short review.`,
    },
  ]
  const inputClass =
    'h-11 w-full rounded-2xl border border-border-soft bg-surface px-3.5 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm'
  const quickActionButtonClass =
    'inline-flex h-10 items-center justify-center rounded-2xl border px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div className="space-y-6">
      <Link
        to="/customers"
        className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
      >
        Back to customers
      </Link>

      <Card>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
          <div className="min-w-0 text-left">
            {isEditing ? (
              <div className="max-w-xl space-y-4">
                <div>
                  <p className="text-sm font-medium text-text-muted">Customer workspace</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
                    Edit customer
                  </h1>
                </div>

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
                  label="Phone optional"
                  value={formValues.phone}
                  onChange={(event) =>
                    setFormValues((currentValues) => ({
                      ...currentValues,
                      phone: event.target.value,
                    }))
                  }
                  placeholder="Phone number"
                />

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveLoading}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveLoading ? 'Saving...' : 'Save customer'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saveLoading}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
                    <UserRound className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-muted">Customer workspace</p>
                  </div>
                </div>

                <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                  {customer.name}
                </h1>

                <div className="mt-5 grid gap-3 text-sm text-text-secondary sm:grid-cols-2">
                  <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border-soft bg-surface-subtle px-3 py-2">
                    <Mail className="h-4 w-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 break-all">{customer.email || 'No email'}</span>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-border-soft bg-surface-subtle px-3 py-2">
                    <Phone className="h-4 w-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 break-words">{customer.phone || 'No phone'}</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleEditStart}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    Edit Customer
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCommunicationsPanel(true)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    Communications
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowHistoryPanel(true)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    History
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="grid h-full grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 lg:auto-rows-fr">
            <div className="flex min-h-[84px] flex-col justify-between rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                Active
              </p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {activeEnquiries.length}
              </p>
            </div>

            <div className="flex min-h-[84px] flex-col justify-between rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                Bookings
              </p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {bookings.length}
              </p>
            </div>

            <div className="flex min-h-[84px] flex-col justify-between rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                Invoices
              </p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {invoices.length}
              </p>
            </div>

            <div className="flex min-h-[84px] flex-col justify-between rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-text-muted">
                Records
              </p>
              <p className="mt-2 text-2xl font-semibold text-text-primary">
                {recordCount}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border-soft pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-left">
              <p className="text-sm font-medium text-text-muted">Danger zone</p>
              <p className="mt-1 text-sm text-text-secondary">
                Delete this customer only when no linked enquiries, bookings, or invoices exist.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setActionError('')
                setConfirmDelete(true)
              }}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
            >
              Delete customer
            </button>
          </div>
        </div>

        {actionError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {actionError}
          </div>
        )}

        {conflictWarning?.hasConflict && !actionError && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">{conflictWarning.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {conflictWarning.conflicts.slice(0, 3).map((conflict) => (
                <Link
                  key={conflict.id}
                  to={`/bookings/${conflict.id}`}
                  className="font-medium underline"
                >
                  {getConflictLinkText(conflict)}
                </Link>
              ))}
            </div>
          </div>
        )}

        {successMessage && !actionError && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete customer"
        message="Delete this customer? This action cannot be undone."
        confirmLabel="Delete customer"
        loadingLabel="Deleting..."
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        {recordCount > 0 && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Financial history is protected and cannot be deleted.
          </p>
        )}
      </ConfirmDialog>

      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="text-sm font-medium text-text-muted">Quick actions</p>
            <h2 className="mt-1 text-xl font-semibold text-text-primary">
              Create for this customer
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              ['enquiry', 'Enquiry'],
              ['booking', 'Booking'],
              ['invoice', 'Invoice'],
            ].map(([action, label]) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setQuickAction(action)
                  setActionError('')
                  setSuccessMessage('')
                }}
                disabled={contextLoading}
                className={`${quickActionButtonClass} ${
                  quickAction === action
                    ? 'border-accent-primary bg-accent-primary text-white'
                    : 'border-border-soft bg-surface text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {quickAction !== 'invoice' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Event type
              </label>
              <select
                value={contextForm.eventType}
                onChange={(event) =>
                  setContextForm((currentForm) => ({
                    ...currentForm,
                    eventType: event.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value="">Select event type</option>
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
              value={contextForm.eventDate}
              onChange={(event) =>
                setContextForm((currentForm) => ({
                  ...currentForm,
                  eventDate: event.target.value,
                }))
              }
            />

            <TextInput
              label="Venue optional"
              value={contextForm.venue}
              onChange={(event) =>
                setContextForm((currentForm) => ({
                  ...currentForm,
                  venue: event.target.value,
                }))
              }
              placeholder="Venue or location"
            />

            <div className="md:col-span-3">
              <button
                type="button"
                onClick={
                  quickAction === 'booking'
                    ? handleCreateCustomerBooking
                    : handleCreateCustomerEnquiry
                }
                disabled={contextLoading}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contextLoading
                  ? quickAction === 'booking'
                    ? 'Creating booking...'
                    : 'Creating enquiry...'
                  : quickAction === 'booking'
                    ? 'Create booking'
                    : 'Create enquiry'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-left text-sm font-medium text-text-primary">
                Booking
              </label>
              <select
                value={contextForm.bookingId}
                onChange={(event) =>
                  setContextForm((currentForm) => ({
                    ...currentForm,
                    bookingId: event.target.value,
                  }))
                }
                disabled={!bookings.length}
                className={inputClass}
              >
                <option value="">
                  {bookings.length ? 'Select booking' : 'No bookings available'}
                </option>
                {bookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.enquiries?.event_type || 'Booking'} - {formatDate(booking.enquiries?.event_date)}
                  </option>
                ))}
              </select>
            </div>

            <TextInput
              label="Due date optional"
              type="date"
              value={contextForm.dueDate}
              onChange={(event) =>
                setContextForm((currentForm) => ({
                  ...currentForm,
                  dueDate: event.target.value,
                }))
              }
            />

            <TextInput
              label="Item description"
              value={contextForm.itemDescription}
              onChange={(event) =>
                setContextForm((currentForm) => ({
                  ...currentForm,
                  itemDescription: event.target.value,
                }))
              }
              placeholder="DJ performance package"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput
                label="Quantity"
                type="number"
                min="1"
                value={contextForm.itemQuantity}
                onChange={(event) =>
                  setContextForm((currentForm) => ({
                    ...currentForm,
                    itemQuantity: event.target.value,
                  }))
                }
              />

              <TextInput
                label="Unit price"
                type="number"
                min="0"
                step="0.01"
                value={contextForm.itemUnitPrice}
                onChange={(event) =>
                  setContextForm((currentForm) => ({
                    ...currentForm,
                    itemUnitPrice: event.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleCreateCustomerInvoice}
                disabled={contextLoading || !bookings.length}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contextLoading ? 'Creating invoice...' : 'Create invoice'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <DetailPanel
        open={showCommunicationsPanel}
        title="Communications"
        subtitle="Copy a quick message using this customer context."
        onClose={() => setShowCommunicationsPanel(false)}
        size="xl"
      >
        <CommunicationTemplates
          title="Customer messages"
          templates={customerTemplates}
        />
      </DetailPanel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
                  <FileSearch className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-text-muted">Pipeline</p>
                  <h2 className="text-xl font-semibold text-text-primary">Active enquiries</h2>
                </div>
              </div>

              {bookedEnquiryCount > 0 && (
                <span className="rounded-full border border-border-soft bg-surface-subtle px-3 py-1 text-xs font-medium text-text-secondary">
                  {bookedEnquiryCount} converted
                </span>
              )}
            </div>

            {activeEnquiries.length ? (
              <div className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft">
                {activeEnquiries.map((enquiry) => (
                  <Link
                    key={enquiry.id}
                    to={`/enquiries/${enquiry.id}`}
                    className="flex flex-col gap-3 bg-surface px-4 py-3 text-left transition hover:bg-surface sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-text-primary">
                          {enquiry.event_type || 'Enquiry'}
                        </p>
                        <StatusBadge status={enquiry.status} />
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {formatDate(enquiry.event_date)}
                        {enquiry.venue ? ` - ${enquiry.venue}` : ''}
                      </p>
                    </div>

                    <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState text="No active enquiries." />
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-text-muted">Operations</p>
                <h2 className="text-xl font-semibold text-text-primary">Bookings</h2>
              </div>
            </div>

            {bookings.length ? (
              <div className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft">
                {bookings.map((booking) => (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className="grid gap-3 bg-surface px-4 py-3 text-left transition hover:bg-surface md:grid-cols-[minmax(0,1fr)_120px_96px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-text-primary">
                          {booking.enquiries?.event_type || 'Booking'}
                        </p>
                        <StatusBadge status={booking.status} />
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {formatDate(booking.enquiries?.event_date)}
                        {booking.enquiries?.venue ? ` - ${booking.enquiries.venue}` : ''}
                      </p>
                      {booking.enquiries?.status === 'booked' && (
                        <p className="mt-1 text-xs text-text-muted">
                          Converted from enquiry
                        </p>
                      )}
                    </div>

                    <p className="text-sm text-text-secondary md:text-right">
                      {formatCurrency(booking.total_price)}
                    </p>

                    <div className="flex items-center justify-start gap-2 text-sm font-medium text-text-secondary md:justify-end">
                      View
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState text="No bookings yet." />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <RelatedTasks
            title="Open customer tasks"
            clientId={customer.id}
            emptyMessage="No open tasks for this customer."
            currentPath={`/customers/${customer.id}`}
          />

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
                <ReceiptText className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-text-muted">Billing</p>
                <h2 className="text-xl font-semibold text-text-primary">Invoices</h2>
              </div>
            </div>

            {invoices.length ? (
              <div className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft">
                {invoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className="block bg-surface px-4 py-3 text-left transition hover:bg-surface"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-text-primary">
                            {invoice.invoice_number || 'Draft invoice'}
                          </p>
                          <StatusBadge status={invoice.status} />
                        </div>

                        <p className="mt-1 text-sm text-text-secondary">
                          {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : 'No due date'}
                        </p>
                      </div>

                      <p className="shrink-0 text-sm font-semibold text-text-primary">
                        {formatCurrency(invoice.total)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState text="No invoices yet." />
            )}
          </Card>

          <DetailPanel
            open={showHistoryPanel}
            title="History"
            subtitle="Customer relationship summary."
            onClose={() => setShowHistoryPanel(false)}
          >
            <div className="text-left">
              <p className="text-sm font-medium text-text-muted">Customer context</p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">
                Relationship history
              </h2>
              <div className="mt-4 space-y-3 text-sm text-text-secondary">
                <div className="flex items-center justify-between rounded-2xl bg-surface-subtle px-4 py-3">
                  <span>Active enquiries</span>
                  <span className="font-semibold text-text-primary">{activeEnquiries.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-subtle px-4 py-3">
                  <span>Converted enquiries</span>
                  <span className="font-semibold text-text-primary">{bookedEnquiryCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-surface-subtle px-4 py-3">
                  <span>Bookings</span>
                  <span className="font-semibold text-text-primary">{bookings.length}</span>
                </div>
              </div>
            </div>
          </DetailPanel>
        </div>
      </div>
    </div>
  )
}

export default CustomerDetails


