import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  BriefcaseBusiness,
  UserRound,
  FileSearch,
  CalendarDays,
  ReceiptText,
  PlusCircle,
  FileCheck2,
  Upload,
  History,
  Trash2,
} from 'lucide-react'
import { supabase } from '../supabase'
import TextInput from '../components/ui/TextInput'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DetailPanel from '../components/common/DetailPanel'
import CommunicationTemplates from '../components/CommunicationTemplates'
import RelatedTasks from '../components/RelatedTasks'
import { useAuth } from '../auth/useAuth'
import { updateBookingDetails, updateBookingStatus } from '../workflows/enquiryBookingActions'
import { deleteBookingGuarded, getBookingDeleteDependencies } from '../workflows/guardedDeleteActions'
import { logActivity } from '../workflows/activityLogActions'
import { fetchBookingConflicts, getConflictLinkText } from '../utils/bookingConflicts'
import { fetchAppSettings } from '../utils/appSettings'
import { isValidDateTimeInput } from '../utils/validation'
import { DEMO_PROTECTED_MESSAGE } from '../utils/demoMode'
import { getInvoicedTotal } from '../utils/bookingFinancials'

const formatDateTimeLocalValue = (value) => {
  if (!value) return ''

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  const timezoneOffset = parsedDate.getTimezoneOffset()
  const localDate = new Date(parsedDate.getTime() - timezoneOffset * 60 * 1000)

  return localDate.toISOString().slice(0, 16)
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0))

const formatDisplayDateTime = (value) => {
  if (!value) return 'Not set'

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleString()
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

const CONTRACT_BUCKET = 'contracts'
const CONTRACT_MAX_SIZE_BYTES = 10 * 1024 * 1024
const CONTRACT_ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx']
const CONTRACT_ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const sanitizeContractFileName = (fileName = '') => {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
}

const getContractFileExtension = (fileName = '') => {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

const BookingDetails = () => {
  const { isDemoMode, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [booking, setBooking] = useState(null)
  const [event, setEvent] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [contract, setContract] = useState(null)
  const [deleteDependencies, setDeleteDependencies] = useState({
    invoiceCount: 0,
    paymentCount: 0,
    eventCount: 0,
    contractCount: 0,
  })
  const [activityLogs, setActivityLogs] = useState([])
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [conflictWarning, setConflictWarning] = useState(
    location.state?.warningMessage
      ? {
          hasConflict: true,
          message: location.state.warningMessage,
          conflicts: [],
        }
      : null
  )
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || '')
  const [statusLoading, setStatusLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [contractLoading, setContractLoading] = useState(false)
  const [contractViewLoading, setContractViewLoading] = useState(false)
  const [contractRemoveLoading, setContractRemoveLoading] = useState(false)
  const [confirmRemoveContract, setConfirmRemoveContract] = useState(false)
  const [showCommunicationsPanel, setShowCommunicationsPanel] = useState(false)
  const [showActivityPanel, setShowActivityPanel] = useState(false)
  const [appSettings, setAppSettings] = useState(null)
  const [formValues, setFormValues] = useState({
    status: 'pending',
    totalPrice: '',
    location: '',
    startTime: '',
    endTime: '',
    notes: '',
  })

  const fetchBookingDetails = useCallback(async () => {
    setError('')

    const { data: bookingData, error: bookingError } = await supabase
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
          venue,
          notes,
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
      .eq('id', id)
      .maybeSingle()

    if (bookingError) {
      console.error(bookingError)
      setError('Could not load booking.')
      return
    }

    if (!bookingData) {
      setError('Booking not found. It may have been deleted or you may not have access.')
      return
    }

    setBooking(bookingData)

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select(`
        id,
        booking_id,
        location,
        start_time,
        end_time,
        notes
      `)
      .eq('booking_id', id)
      .order('created_at', { ascending: true })
      .limit(1)

    if (eventError) {
      console.error(eventError)
    } else {
      setEvent(eventData?.[0] || null)
    }

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        status,
        total,
        due_date
      `)
      .eq('booking_id', id)
      .order('created_at', { ascending: false })

    if (invoiceError) {
      console.error(invoiceError)
    } else {
      const linkedInvoices = invoiceData || []
      setInvoices(linkedInvoices)

      const invoiceIds = linkedInvoices.map((invoice) => invoice.id)

      if (invoiceIds.length > 0) {
        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .select('id, invoice_id, amount, paid')
          .in('invoice_id', invoiceIds)

        if (paymentError) {
          console.error(paymentError)
          setPayments([])
        } else {
          setPayments(paymentData || [])
        }
      } else {
        setPayments([])
      }
    }

    const { data: contractData, error: contractError } = await supabase
      .from('booking_contracts')
      .select(`
        id,
        booking_id,
        file_name,
        file_path,
        status,
        uploaded_at
      `)
      .eq('booking_id', id)
      .maybeSingle()

    if (contractError) {
      console.error(contractError)
    } else {
      setContract(contractData || null)
    }

    const { data: activityData, error: activityError } = await supabase
      .from('activity_logs')
      .select(`
        id,
        entity_type,
        entity_id,
        action,
        title,
        description,
        metadata,
        created_at
      `)
      .eq('booking_id', id)
      .order('created_at', { ascending: false })

    if (activityError) {
      console.error(activityError)
    } else {
      setActivityLogs(activityData || [])
    }

    try {
      const dependencies = await getBookingDeleteDependencies({ bookingId: id })
      setDeleteDependencies(dependencies)
    } catch (dependencyError) {
      console.error(dependencyError)
    }
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(() => fetchBookingDetails())
  }, [fetchBookingDetails])

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

  useEffect(() => {
    if (!location.state?.successMessage) return

    setSuccessMessage(location.state.successMessage)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const statusStyles = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    confirmed: 'border-blue-200 bg-blue-50 text-blue-700',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    cancelled: 'border-slate-200 bg-slate-50 text-text-secondary',
  }

  const bookingClient = booking?.enquiries?.clients || null
  const canCreateInvoice = Boolean(booking?.id && bookingClient?.id && bookingClient?.email?.trim())
  const hasEventDetails = Boolean(
    event?.location || event?.start_time || event?.end_time || event?.notes
  )
  const contractStatus = contract ? 'Signed' : 'Not uploaded'
  const invoicedTotal = getInvoicedTotal(invoices)
  const bookingPrice = Number(booking?.total_price || 0)
  const bookingTotal = bookingPrice > 0 ? bookingPrice : invoicedTotal
  const paidTotal = payments.reduce((sum, payment) => {
    if (!payment.paid) return sum
    return sum + Number(payment.amount || 0)
  }, 0)
  const outstandingTotal = Math.max(0, bookingTotal - paidTotal)
  const deleteWarningItems = [
    deleteDependencies.invoiceCount > 0
      ? `${deleteDependencies.invoiceCount} linked invoice${deleteDependencies.invoiceCount === 1 ? '' : 's'}`
      : null,
    deleteDependencies.paymentCount > 0
      ? `${deleteDependencies.paymentCount} linked payment${deleteDependencies.paymentCount === 1 ? '' : 's'}`
      : null,
    deleteDependencies.eventCount > 0
      ? `${deleteDependencies.eventCount} event record${deleteDependencies.eventCount === 1 ? '' : 's'}`
      : null,
    deleteDependencies.contractCount > 0
      ? `${deleteDependencies.contractCount} contract record${deleteDependencies.contractCount === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean)

  const bookingTemplateData = {
    clientName: bookingClient?.name || 'there',
    eventDate: formatMessageDate(booking?.enquiries?.event_date),
    eventType: booking?.enquiries?.event_type || 'your event',
    venue: event?.location || booking?.enquiries?.venue || '',
    signOff: appSettings?.display_name || appSettings?.business_name || 'DJ',
  }
  const bookingEventContext = [
    bookingTemplateData.eventDate ? `on ${bookingTemplateData.eventDate}` : null,
    bookingTemplateData.venue ? `at ${bookingTemplateData.venue}` : null,
  ].filter(Boolean).join(' ')

  const bookingTemplates = [
    {
      id: 'booking-confirmation',
      title: 'Booking confirmation',
      body: `Hi ${bookingTemplateData.clientName},

Thanks for booking me for ${bookingTemplateData.eventType}${bookingEventContext ? ` ${bookingEventContext}` : ''}.

I have your booking noted in my diary. I will keep everything updated here and confirm the final details closer to the date.

Thanks,
${bookingTemplateData.signOff}`,
    },
    {
      id: 'contract-reminder',
      title: 'Contract reminder',
      body: `Hi ${bookingTemplateData.clientName},

Just a quick reminder to review and complete the contract for ${bookingTemplateData.eventType}.

Contract link: [contract link]

Let me know if you have any questions.`,
    },
    {
      id: 'event-week-confirmation',
      title: 'Event week confirmation',
      body: `Hi ${bookingTemplateData.clientName},

I am checking in ahead of ${bookingTemplateData.eventType}${bookingTemplateData.eventDate ? ` on ${bookingTemplateData.eventDate}` : ''}.

Current details I have are:
Venue/location: ${bookingTemplateData.venue || 'To confirm'}

Please send over any final timings, music notes, or access details when you can.`,
    },
    {
      id: 'booking-follow-up',
      title: 'Thank-you / follow-up',
      body: `Hi ${bookingTemplateData.clientName},

Thank you again for having me for ${bookingTemplateData.eventType}${bookingTemplateData.venue ? ` at ${bookingTemplateData.venue}` : ''}. I hope everyone had a brilliant time.

If you have a moment, I would really appreciate any feedback or a short review.

Thanks,
${bookingTemplateData.signOff}`,
    },
  ]

  const syncFormValues = useCallback(() => {
    setFormValues({
      status: booking?.status || 'pending',
      totalPrice: booking?.total_price != null ? String(booking.total_price) : '',
      location: event?.location || '',
      startTime: formatDateTimeLocalValue(event?.start_time),
      endTime: formatDateTimeLocalValue(event?.end_time),
      notes: event?.notes || '',
    })
  }, [booking, event])

  const handleCreateInvoice = () => {
    if (!booking || !bookingClient) {
      return
    }

    navigate('/invoices', {
      state: {
        bookingContext: {
          bookingId: booking.id,
          clientId: bookingClient.id,
          clientName: bookingClient.name || '',
          clientEmail: bookingClient.email || '',
          clientPhone: bookingClient.phone || '',
          eventType: booking.enquiries?.event_type || '',
          eventDate: booking.enquiries?.event_date || '',
          venue: event?.location || booking.enquiries?.venue || '',
        },
      },
    })
  }

  const handleStatusChange = async (event) => {
    if (statusLoading) return
    if (!booking) return

    const nextStatus = event.target.value

    setStatusLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await updateBookingStatus({ bookingId: booking.id, status: nextStatus })
      await fetchBookingDetails()
      setFormValues((currentValues) => ({
        ...currentValues,
        status: nextStatus,
      }))
      setSuccessMessage('Booking status updated successfully.')
    } catch (statusError) {
      console.error(statusError)
      setActionError(statusError.message || 'Could not update booking status.')
    } finally {
      setStatusLoading(false)
    }
  }

  const handleDelete = async () => {
    if (deleteLoading) return
    if (!booking) return

    setDeleteLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await deleteBookingGuarded({ bookingId: booking.id })
      navigate('/bookings', {
        state: {
          successMessage: 'Booking deleted successfully.',
        },
      })
    } catch (deleteError) {
      console.error(deleteError)
      setActionError(deleteError.message || 'Could not delete booking.')
      setConfirmDelete(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleEditStart = () => {
    if (!booking) return

    setActionError('')
    setSuccessMessage('')
    setConfirmDelete(false)
    syncFormValues()
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setActionError('')
    setSuccessMessage('')
    syncFormValues()
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (saveLoading) return
    if (!booking) return

    const normalizedPrice = formValues.totalPrice.trim()
    const parsedPrice = Number(normalizedPrice)

    if (!normalizedPrice || Number.isNaN(parsedPrice)) {
      setActionError('Total price must be a valid number.')
      return
    }

    if (parsedPrice < 0) {
      setActionError('Total price cannot be negative.')
      return
    }

    if (!isValidDateTimeInput(formValues.startTime) || !isValidDateTimeInput(formValues.endTime)) {
      setActionError('Enter valid event start and end times.')
      return
    }

    if (
      formValues.startTime &&
      formValues.endTime &&
      new Date(formValues.endTime) < new Date(formValues.startTime)
    ) {
      setActionError('End time cannot be before start time.')
      return
    }

    setActionError('')
    setConflictWarning(null)
    setSuccessMessage('')

    try {
      try {
        const conflictSummary = await fetchBookingConflicts({
          eventDate: booking.enquiries?.event_date,
          startTime: formValues.startTime,
          endTime: formValues.endTime,
          excludeBookingId: booking.id,
        })

        if (conflictSummary.hasConflict) {
          setConflictWarning(conflictSummary)
        }
      } catch (conflictError) {
        console.warn('Booking conflict check failed:', conflictError)
      }

      setSaveLoading(true)

      await updateBookingDetails({
        bookingId: booking.id,
        status: formValues.status,
        totalPrice: parsedPrice,
        eventId: event?.id || null,
        location: formValues.location,
        startTime: formValues.startTime,
        endTime: formValues.endTime,
        notes: formValues.notes,
      })

      await fetchBookingDetails()
      setIsEditing(false)
      setSuccessMessage('Booking updated successfully.')
    } catch (saveError) {
      console.error(saveError)
      setActionError(saveError.message || 'Could not update booking.')
    } finally {
      setSaveLoading(false)
    }
  }

  const validateContractFile = (file) => {
    if (!file) {
      return 'Choose a contract file to upload.'
    }

    const extension = getContractFileExtension(file.name)

    if (!CONTRACT_ALLOWED_EXTENSIONS.includes(extension)) {
      return 'Contract must be a PDF, DOC, or DOCX file.'
    }

    if (file.type && !CONTRACT_ALLOWED_TYPES.includes(file.type)) {
      return 'Contract file type is not supported.'
    }

    if (file.size > CONTRACT_MAX_SIZE_BYTES) {
      return 'Contract file must be 10 MB or smaller.'
    }

    return ''
  }

  const handleContractUpload = async (uploadEvent) => {
    if (contractLoading) return
    if (!booking) return

    const file = uploadEvent.target.files?.[0] || null
    uploadEvent.target.value = ''

    if (isDemoMode && contract?.file_path) {
      setActionError(DEMO_PROTECTED_MESSAGE)
      setSuccessMessage('')
      return
    }

    const validationError = validateContractFile(file)

    if (validationError) {
      setActionError(validationError)
      setSuccessMessage('')
      return
    }

    setContractLoading(true)
    setActionError('')
    setSuccessMessage('')
    setConfirmRemoveContract(false)

    try {
      if (!user?.id) {
        throw new Error('You must be signed in to upload contracts.')
      }

      const safeFileName = sanitizeContractFileName(file.name)
      if (!safeFileName) {
        throw new Error('Contract file name is not valid.')
      }

      const filePath = `${user.id}/${booking.id}/${Date.now()}-${safeFileName}`
      const previousFilePath = contract?.file_path || null

      const { error: uploadError } = await supabase.storage
        .from(CONTRACT_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type || undefined,
        })

      if (uploadError) throw uploadError

      const { data: savedContract, error: contractError } = await supabase
        .from('booking_contracts')
        .upsert(
          {
            booking_id: booking.id,
            user_id: user.id,
            file_name: file.name,
            file_path: filePath,
            status: 'signed',
            uploaded_at: new Date().toISOString(),
          },
          { onConflict: 'booking_id' }
        )
        .select(`
          id,
          booking_id,
          file_name,
          file_path,
          status,
          uploaded_at
        `)
        .single()

      if (contractError) throw contractError

      if (previousFilePath && previousFilePath !== filePath) {
        const { error: removeError } = await supabase.storage
          .from(CONTRACT_BUCKET)
          .remove([previousFilePath])

        if (removeError) {
          console.error(removeError)
        }
      }

      await logActivity({
        entityType: 'booking_contract',
        entityId: savedContract.id,
        bookingId: booking.id,
        clientId: bookingClient?.id || null,
        action: previousFilePath ? 'contract_replaced' : 'contract_uploaded',
        title: previousFilePath ? 'Contract replaced' : 'Contract uploaded',
        description: previousFilePath
          ? 'The booking contract file was replaced.'
          : 'A contract file was uploaded for this booking.',
        metadata: {
          contract_id: savedContract.id,
          file_name: savedContract.file_name,
        },
      })

      setContract(savedContract)
      setSuccessMessage(
        previousFilePath ? 'Contract replaced successfully.' : 'Contract uploaded successfully.'
      )
      await fetchBookingDetails()
    } catch (uploadError) {
      console.error(uploadError)
      setActionError(uploadError.message || 'Could not upload contract.')
    } finally {
      setContractLoading(false)
    }
  }

  const handleViewContract = async () => {
    if (contractViewLoading) return
    if (!contract?.file_path) return

    setContractViewLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from(CONTRACT_BUCKET)
        .createSignedUrl(contract.file_path, 60)

      if (signedUrlError) throw signedUrlError

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (viewError) {
      console.error(viewError)
      setActionError(viewError.message || 'Could not open contract.')
    } finally {
      setContractViewLoading(false)
    }
  }

  const handleRemoveContract = async () => {
    if (contractRemoveLoading) return
    if (!contract?.id || !contract?.file_path) return

    if (isDemoMode) {
      setActionError(DEMO_PROTECTED_MESSAGE)
      setSuccessMessage('')
      setConfirmRemoveContract(false)
      return
    }

    setContractRemoveLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      const { error: removeFileError } = await supabase.storage
        .from(CONTRACT_BUCKET)
        .remove([contract.file_path])

      if (removeFileError) {
        throw new Error(
          `Could not remove the contract file from private storage. The contract record was kept. ${
            removeFileError.message || ''
          }`.trim()
        )
      }

      const { error: deleteMetadataError } = await supabase
        .from('booking_contracts')
        .delete()
        .eq('id', contract.id)
        .eq('booking_id', booking.id)

      if (deleteMetadataError) {
        await fetchBookingDetails()
        throw new Error(
          `The private file was removed, but the contract record could not be deleted. ${
            deleteMetadataError.message || ''
          }`.trim()
        )
      }

      await logActivity({
        entityType: 'booking_contract',
        entityId: contract.id,
        bookingId: booking.id,
        clientId: bookingClient?.id || null,
        action: 'contract_removed',
        title: 'Contract removed',
        description: 'The booking contract file was removed.',
        metadata: {
          contract_id: contract.id,
          file_name: contract.file_name,
        },
      })

      setContract(null)
      setConfirmRemoveContract(false)
      setSuccessMessage('Contract removed successfully.')
      await fetchBookingDetails()
    } catch (removeError) {
      console.error(removeError)
      setActionError(removeError.message || 'Could not remove contract.')
    } finally {
      setContractRemoveLoading(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          to="/bookings"
          className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
        >
          Back to bookings
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      </div>
    )
  }

  if (!booking) {
    return <p className="text-sm text-text-muted">Loading booking...</p>
  }

  return (
    <div className="space-y-6">
      <Link
        to="/bookings"
        className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
      >
        Back to bookings
      </Link>

      <div className={cardClass}>
        <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0 text-left">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>

            {isEditing ? (
              <div className="max-w-2xl space-y-4">
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <h1 className="break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                    {booking.enquiries?.clients?.name || 'Unknown client'}
                  </h1>
                </div>

                <div className="space-y-1 text-left text-sm text-text-secondary">
                  {booking.enquiries?.event_type && <p>{booking.enquiries.event_type}</p>}
                  {booking.enquiries?.event_date && <p>Date: {booking.enquiries.event_date}</p>}
                  {(event?.location || booking.enquiries?.venue) && (
                    <p>Location: {event?.location || booking.enquiries.venue}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-primary">
                      Booking status
                    </label>
                    <select
                      value={formValues.status}
                      onChange={(event) =>
                        setFormValues((currentValues) => ({
                          ...currentValues,
                          status: event.target.value,
                        }))
                      }
                      className="h-11 w-full rounded-2xl border border-border-soft bg-surface px-3.5 text-base text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <TextInput
                    label="Total price"
                    type="number"
                    value={formValues.totalPrice}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        totalPrice: event.target.value,
                      }))
                    }
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Location optional"
                    value={formValues.location}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        location: event.target.value,
                      }))
                    }
                    placeholder="Venue or address"
                  />

                  <div />

                  <TextInput
                    label="Start time optional"
                    type="datetime-local"
                    value={formValues.startTime}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        startTime: event.target.value,
                      }))
                    }
                  />

                  <TextInput
                    label="End time optional"
                    type="datetime-local"
                    value={formValues.endTime}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        endTime: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Event notes optional
                  </label>
                  <textarea
                    value={formValues.notes}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        notes: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Add event notes"
                    className="w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-3 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveLoading}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveLoading ? 'Saving...' : 'Save booking'}
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
                <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                    {booking.enquiries?.clients?.name || 'Unknown client'}
                  </h1>

                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                      statusStyles[booking.status] || 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {booking.status}
                  </span>
                </div>

                <div className="space-y-1 text-left text-sm text-text-secondary">
                  {booking.enquiries?.event_type && <p>{booking.enquiries.event_type}</p>}
                  {booking.enquiries?.event_date && <p>Date: {booking.enquiries.event_date}</p>}
                  {(event?.location || booking.enquiries?.venue) && (
                    <p>Location: {event?.location || booking.enquiries.venue}</p>
                  )}
                </div>

              </>
            )}
          </div>

          <div className="self-start rounded-2xl border border-border-soft bg-surface-subtle px-5 py-4 text-left md:text-right">
            <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
              Total
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">
              {formatCurrency(isEditing ? formValues.totalPrice : bookingTotal)}
            </p>
          </div>
        </div>

        {!isEditing && (
          <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
              <select
                value={booking.status}
                onChange={handleStatusChange}
                disabled={statusLoading}
                className="h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary outline-none transition focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100 sm:w-auto"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <button
                type="button"
                onClick={handleEditStart}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle sm:w-auto"
              >
                Edit Booking
              </button>

              <button
                type="button"
                onClick={() => setShowCommunicationsPanel(true)}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle sm:w-auto"
              >
                Communications
              </button>

              <button
                type="button"
                onClick={() => setShowActivityPanel(true)}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle sm:w-auto"
              >
                Activity
              </button>

              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={!canCreateInvoice}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white shadow-[0_6px_20px_rgba(79,70,229,0.16)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-text-muted sm:w-auto"
                title={
                  canCreateInvoice
                    ? 'Create invoice for this booking'
                    : 'This booking needs a linked customer email before creating an invoice.'
                }
              >
                <PlusCircle className="h-4 w-4" />
                Create Invoice
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setActionError('')
                setSuccessMessage('')
                setConfirmDelete(true)
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100 sm:w-auto xl:ml-auto"
            >
              Delete booking
            </button>
          </div>
        )}

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

      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete booking"
        message="Delete this booking? Events and operational records may be removed, but financial history is protected. This action cannot be undone."
        confirmLabel="Delete booking"
        loadingLabel="Deleting..."
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        {deleteWarningItems.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">This will affect:</p>
            <p className="mt-1">{deleteWarningItems.join(', ')}.</p>
          </div>
        )}
      </ConfirmDialog>

      <RelatedTasks
        title="Open booking tasks"
        bookingId={booking.id}
        emptyMessage="No open tasks for this booking."
        currentPath={`/bookings/${booking.id}`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={cardClass}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="min-w-0 text-xl font-semibold text-text-primary">Client</h2>
          </div>

          {booking.enquiries?.clients ? (
            <div className="space-y-2 text-left text-sm text-text-secondary">
              <Link
                to={`/customers/${booking.enquiries.clients.id}`}
                className="break-words text-lg font-semibold text-text-primary hover:underline"
              >
                {booking.enquiries.clients.name}
              </Link>
              {booking.enquiries.clients.email && <p className="break-all">{booking.enquiries.clients.email}</p>}
              {booking.enquiries.clients.phone && <p>{booking.enquiries.clients.phone}</p>}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">No client linked.</p>
          )}
        </div>

        <div className={cardClass}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <FileSearch className="h-5 w-5" />
            </div>
            <h2 className="min-w-0 text-xl font-semibold text-text-primary">Enquiry</h2>
          </div>

          {booking.enquiries ? (
            <div className="space-y-2 text-left text-sm text-text-secondary">
              <Link
                to={`/enquiries/${booking.enquiries.id}`}
                className="break-words text-lg font-semibold text-text-primary hover:underline"
              >
                {booking.enquiries.event_type}
              </Link>
              {booking.enquiries.event_date && <p>{booking.enquiries.event_date}</p>}
              {booking.enquiries.venue && <p className="break-words">{booking.enquiries.venue}</p>}
              <p className="capitalize">{booking.enquiries.status}</p>
              {booking.enquiries.notes && <p className="break-words">{booking.enquiries.notes}</p>}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">No enquiry linked.</p>
          )}
        </div>

        <div className={cardClass}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <h2 className="min-w-0 text-xl font-semibold text-text-primary">Event</h2>
          </div>

          {hasEventDetails ? (
            <div className="space-y-3 text-left text-sm text-text-secondary">
              {event.location && (
                <div className="rounded-2xl bg-surface-subtle px-4 py-3 text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Location</p>
                  <p className="mt-1 break-words text-text-primary">{event.location}</p>
                </div>
              )}

              {event.start_time && (
                <div className="rounded-2xl bg-surface-subtle px-4 py-3 text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Start</p>
                  <p className="mt-1 text-text-primary">
                    {new Date(event.start_time).toLocaleString()}
                  </p>
                </div>
              )}

              {event.end_time && (
                <div className="rounded-2xl bg-surface-subtle px-4 py-3 text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">End</p>
                  <p className="mt-1 text-text-primary">
                    {new Date(event.end_time).toLocaleString()}
                  </p>
                </div>
              )}

              {event.notes && (
                <div className="rounded-2xl bg-surface-subtle px-4 py-3 text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Notes</p>
                  <p className="mt-1 break-words text-text-primary">{event.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">No event details yet.</p>
          )}
        </div>

        <div className={cardClass}>
          <div className="mb-4 flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <h2 className="min-w-0 text-xl font-semibold text-text-primary">Contract</h2>
          </div>

          <div className="space-y-4 text-left text-sm text-text-secondary">
            <div className="rounded-2xl bg-surface-subtle px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                Status
              </p>
              <p className="mt-1 font-semibold text-text-primary">{contractStatus}</p>
            </div>

            {contract ? (
              <div className="space-y-2">
                <p className="break-words font-medium text-text-primary">
                  {contract.file_name}
                </p>
                {contract.uploaded_at && (
                  <p>Uploaded {formatDisplayDateTime(contract.uploaded_at)}</p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-text-muted">
                No contract uploaded.
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 sm:w-auto">
                <Upload className="h-4 w-4" />
                {contractLoading ? 'Uploading...' : contract ? 'Replace contract' : 'Upload contract'}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleContractUpload}
                  disabled={contractLoading}
                  className="sr-only"
                />
              </label>

              {contract && (
                <button
                  type="button"
                  onClick={handleViewContract}
                  disabled={contractViewLoading || contractRemoveLoading}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {contractViewLoading ? 'Opening...' : 'View / download'}
                </button>
              )}

              {contract && !confirmRemoveContract && (
                <button
                  type="button"
                  onClick={() => {
                    setActionError('')
                    setSuccessMessage('')
                    setConfirmRemoveContract(true)
                  }}
                  disabled={contractLoading || contractViewLoading || contractRemoveLoading}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove contract
                </button>
              )}
            </div>

            <p className="text-xs leading-5 text-text-muted">
              PDF, DOC, or DOCX. Maximum 10 MB.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemoveContract}
        title="Remove contract"
        message="Remove this contract? This action cannot be undone."
        confirmLabel="Remove contract"
        loadingLabel="Removing..."
        loading={contractRemoveLoading}
        onConfirm={handleRemoveContract}
        onCancel={() => setConfirmRemoveContract(false)}
      />

      <DetailPanel
        open={showCommunicationsPanel}
        title="Communications"
        subtitle="Copy a ready-to-send client message for this booking."
        onClose={() => setShowCommunicationsPanel(false)}
        size="xl"
      >
        <CommunicationTemplates
          title="Booking messages"
          templates={bookingTemplates}
        />
      </DetailPanel>

      <div className={cardClass}>
        <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <p className="text-sm font-medium text-text-muted">Billing</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
              Linked invoices
            </h2>
          </div>

          <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
            {invoices.length} invoices
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Booking total</p>
            <p className="mt-2 text-lg font-semibold text-text-primary">{formatCurrency(bookingTotal)}</p>
          </div>

          <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Invoiced</p>
            <p className="mt-2 text-lg font-semibold text-text-primary">{formatCurrency(invoicedTotal)}</p>
          </div>

          <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Paid</p>
            <p className="mt-2 text-lg font-semibold text-emerald-700">{formatCurrency(paidTotal)}</p>
          </div>

          <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3">
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Outstanding</p>
            <p className="mt-2 text-lg font-semibold text-amber-700">{formatCurrency(outstandingTotal)}</p>
          </div>
        </div>

        {invoices.length ? (
          <div className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft">
            {invoices.map((invoice) => (
              <Link
                key={invoice.id}
                to={`/invoices/${invoice.id}`}
                className="flex flex-col items-start gap-3 bg-surface px-4 py-3 transition hover:bg-surface sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0 text-left">
                  <p className="break-words font-medium text-text-primary">
                    {invoice.invoice_number || 'Draft invoice'}
                  </p>
                  <p className="mt-1 text-sm capitalize text-text-secondary">
                    {invoice.status}
                  </p>
                  {invoice.due_date && (
                    <p className="mt-1 text-sm text-text-muted">Due: {invoice.due_date}</p>
                  )}
                </div>

                <p className="shrink-0 font-semibold text-text-primary sm:text-right">
                  {formatCurrency(invoice.total)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-text-muted">No invoices linked yet.</p>
        )}
      </div>

      <DetailPanel
        open={showActivityPanel}
        title="Activity"
        subtitle={`${activityLogs.length} event${activityLogs.length === 1 ? '' : 's'}`}
        onClose={() => setShowActivityPanel(false)}
        size="xl"
      >
        <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <History className="h-5 w-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-muted">History</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
                Activity
              </h2>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
            {activityLogs.length} events
          </div>
        </div>

        {activityLogs.length ? (
          <div className="divide-y divide-border-soft overflow-hidden rounded-2xl border border-border-soft">
            {activityLogs.map((activity) => (
              <div
                key={activity.id}
                className="bg-surface px-4 py-3 text-left"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-text-primary">
                      {activity.title}
                    </p>
                    {activity.description && (
                      <p className="mt-1 text-sm text-text-secondary">
                        {activity.description}
                      </p>
                    )}
                  </div>

                  {activity.created_at && (
                    <p className="shrink-0 text-sm text-text-muted">
                      {formatDisplayDateTime(activity.created_at)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-text-muted">
            No recent activity.
          </p>
        )}
      </DetailPanel>
    </div>
  )
}

export default BookingDetails



