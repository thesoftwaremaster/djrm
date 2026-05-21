import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRightLeft } from 'lucide-react'
import { supabase } from '../supabase'
import {
  convertEnquiryToBooking,
  updateEnquiryDetails,
  updateEnquiryStatus,
} from '../workflows/enquiryBookingActions'
import { deleteEnquiryGuarded } from '../workflows/guardedDeleteActions'
import TextInput from '../components/ui/TextInput'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { eventTypes } from '../constants'
import { fetchBookingConflicts, getConflictLinkText } from '../utils/bookingConflicts'
import { isValidDateInput } from '../utils/validation'

const EnquiryDetails = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [enquiry, setEnquiry] = useState(null)
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [conflictWarning, setConflictWarning] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)
  const [convertLoading, setConvertLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [formValues, setFormValues] = useState({
    eventType: '',
    eventDate: '',
    venue: '',
    notes: '',
    status: 'new',
  })

  const fetchEnquiryDetails = useCallback(async () => {
    setError('')

    const { data: enquiryData, error: enquiryError } = await supabase
      .from('enquiries')
      .select(`
        id,
        event_type,
        event_date,
        venue,
        notes,
        status,
        created_at,
        client_id,
        clients (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (enquiryError) {
      console.error(enquiryError)
      setError('Could not load enquiry.')
      return
    }

    if (!enquiryData) {
      setError('Enquiry not found. It may have been deleted or you may not have access.')
      return
    }

    setEnquiry(enquiryData)
    setFormValues({
      eventType: enquiryData.event_type || '',
      eventDate: enquiryData.event_date || '',
      venue: enquiryData.venue || '',
      notes: enquiryData.notes || '',
      status: enquiryData.status || 'new',
    })

    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        id,
        enquiry_id,
        status,
        total_price,
        created_at
      `)
      .eq('enquiry_id', id)
      .order('created_at', { ascending: true })
      .limit(1)

    if (bookingError) {
      console.error(bookingError)
      return
    }

    setBooking(bookingData?.[0] || null)
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(() => fetchEnquiryDetails())
  }, [fetchEnquiryDetails])

  const handleEditStart = () => {
    if (!enquiry) return

    setActionError('')
    setSuccessMessage('')
    setConfirmDelete(false)
    setFormValues({
      eventType: enquiry.event_type || '',
      eventDate: enquiry.event_date || '',
      venue: enquiry.venue || '',
      notes: enquiry.notes || '',
      status: enquiry.status || 'new',
    })
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    if (!enquiry) return

    setActionError('')
    setSuccessMessage('')
    setFormValues({
      eventType: enquiry.event_type || '',
      eventDate: enquiry.event_date || '',
      venue: enquiry.venue || '',
      notes: enquiry.notes || '',
      status: enquiry.status || 'new',
    })
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (saveLoading) return
    if (!enquiry) return

    if (!formValues.eventType.trim()) {
      setActionError('Event type is required.')
      return
    }

    if (formValues.eventDate && !isValidDateInput(formValues.eventDate)) {
      setActionError('Enter a valid event date.')
      return
    }

    if (booking && formValues.status !== 'booked') {
      setActionError(
        'Booked enquiries with a linked booking must keep the status as booked.'
      )
      return
    }

    setSaveLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await updateEnquiryDetails({
        enquiryId: enquiry.id,
        eventType: formValues.eventType.trim(),
        eventDate: formValues.eventDate,
        venue: formValues.venue,
        notes: formValues.notes.trim(),
        status: formValues.status,
      })

      await fetchEnquiryDetails()
      setIsEditing(false)
      setSuccessMessage('Enquiry updated successfully.')
    } catch (saveError) {
      console.error(saveError)
      setActionError(saveError.message || 'Could not update enquiry.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleStatusChange = async (event) => {
    if (statusLoading) return

    const nextStatus = event.target.value

    setStatusLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await updateEnquiryStatus({ enquiryId: enquiry.id, status: nextStatus })
      await fetchEnquiryDetails()
      setSuccessMessage('Enquiry status updated successfully.')
    } catch (statusError) {
      console.error(statusError)
      setActionError(statusError.message || 'Could not update enquiry status.')
    } finally {
      setStatusLoading(false)
    }
  }

  const handleConvertToBooking = async () => {
    if (convertLoading) return
    if (!enquiry) return

    setConvertLoading(true)
    setActionError('')
    setConflictWarning(null)
    setSuccessMessage('')

    try {
      let warningMessage = ''

      try {
        const conflictSummary = await fetchBookingConflicts({
          eventDate: enquiry.event_date,
        })

        if (conflictSummary.hasConflict) {
          setConflictWarning(conflictSummary)
          warningMessage = conflictSummary.message
        }
      } catch (conflictError) {
        console.warn('Booking conflict check failed:', conflictError)
      }

      const savedBooking = await convertEnquiryToBooking({ enquiryId: enquiry.id })
      navigate(`/bookings/${savedBooking.id}`, {
        state: {
          successMessage: 'Booking created successfully.',
          warningMessage,
        },
      })
    } catch (convertError) {
      console.error(convertError)
      setActionError(convertError.message || 'Could not convert enquiry to booking.')
    } finally {
      setConvertLoading(false)
    }
  }

  const handleDelete = async () => {
    if (deleteLoading) return
    if (!enquiry) return

    setDeleteLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      await deleteEnquiryGuarded({ enquiryId: enquiry.id })
      navigate('/enquiries', {
        state: {
          successMessage: 'Enquiry deleted successfully.',
        },
      })
    } catch (deleteError) {
      console.error(deleteError)
      setActionError(deleteError.message || 'Could not delete enquiry.')
      setConfirmDelete(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          to="/enquiries"
          className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
        >
          Back to enquiries
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      </div>
    )
  }

  if (!enquiry) {
    return <p className="text-sm text-text-muted">Loading enquiry...</p>
  }

  return (
    <div className="space-y-6">
      <Link
        to="/enquiries"
        className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
      >
        Back to enquiries
      </Link>

      <div className="rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5">
        <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0">
            {isEditing ? (
              <div className="max-w-xl space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Event type
                  </label>
                  <select
                    value={formValues.eventType}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        eventType: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-border-soft bg-surface px-4 text-base text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
                    required
                  >
                    <option value="">Select event type</option>
                    {formValues.eventType &&
                      !eventTypes.includes(formValues.eventType) && (
                        <option value={formValues.eventType}>
                          {formValues.eventType}
                        </option>
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
                  value={formValues.eventDate}
                  onChange={(event) =>
                    setFormValues((currentValues) => ({
                      ...currentValues,
                      eventDate: event.target.value,
                    }))
                  }
                />

                <TextInput
                  label="Venue optional"
                  value={formValues.venue}
                  onChange={(event) =>
                    setFormValues((currentValues) => ({
                      ...currentValues,
                      venue: event.target.value,
                    }))
                  }
                  placeholder="Venue or location"
                />

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Notes optional
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
                    placeholder="Add enquiry notes"
                    className="w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-3 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Status
                  </label>
                  <select
                    value={formValues.status}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        status: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-border-soft bg-surface px-4 text-base text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="quoted">Quoted</option>
                    <option value="booked">Booked</option>
                    <option value="lost">Lost</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveLoading}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveLoading ? 'Saving...' : 'Save enquiry'}
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
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <h1 className="break-words text-2xl font-bold text-text-primary sm:text-3xl">
                    {enquiry.event_type}
                  </h1>

                  <span className="rounded-full border border-border-soft px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
                    {enquiry.status}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-text-secondary">
                  {enquiry.event_date && <p>Date: {enquiry.event_date}</p>}
                  {enquiry.venue && <p>Venue: {enquiry.venue}</p>}
                  {enquiry.notes && <p>{enquiry.notes}</p>}
                </div>

                <div className="mt-5">
                  <button
                    type="button"
                    onClick={handleEditStart}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    Edit Enquiry
                  </button>
                </div>
              </>
            )}
          </div>

          {!isEditing && (
            <div className="w-full max-w-sm space-y-3">
              <select
                value={enquiry.status}
                onChange={handleStatusChange}
                disabled={statusLoading}
                className="h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-base font-medium text-text-primary outline-none transition focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100 sm:text-sm"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="quoted">Quoted</option>
                <option value="booked">Booked</option>
                <option value="lost">Lost</option>
                <option value="completed">Completed</option>
              </select>

              <button
                type="button"
                onClick={handleConvertToBooking}
                disabled={convertLoading || Boolean(booking) || enquiry.status === 'booked'}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-text-secondary"
              >
                <ArrowRightLeft className="h-4 w-4" />
                {convertLoading ? 'Converting...' : booking ? 'Already converted' : 'Convert to Booking'}
              </button>
            </div>
          )}
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

        <div className="mt-6 border-t border-border-soft pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-left">
              <p className="text-sm font-medium text-text-muted">Danger zone</p>
              <p className="mt-1 text-sm text-text-secondary">
                Delete this enquiry only when it has no linked booking.
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
              Delete enquiry
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete enquiry"
        message="Delete this enquiry? This action cannot be undone."
        confirmLabel="Delete enquiry"
        loadingLabel="Deleting..."
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5">
          <h2 className="mb-4 text-xl font-semibold">Client</h2>

          {enquiry.clients ? (
            <div className="space-y-2 text-sm text-text-secondary">
              <Link
                to={`/customers/${enquiry.clients.id}`}
                className="text-lg font-semibold text-text-primary hover:underline"
              >
                {enquiry.clients.name}
              </Link>

              {enquiry.clients.email && <p className="break-all">{enquiry.clients.email}</p>}
              {enquiry.clients.phone && <p>{enquiry.clients.phone}</p>}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">No client linked.</p>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5">
          <h2 className="mb-4 text-xl font-semibold">Booking</h2>

          {booking ? (
            <div className="space-y-2 text-sm text-text-secondary">
              <Link
                to={`/bookings/${booking.id}`}
                className="inline-flex font-medium text-text-primary hover:underline"
              >
                Booking #{booking.id.slice(0, 8)}
              </Link>
              <p className="capitalize">{booking.status}</p>
              <p>£{Number(booking.total_price || 0).toFixed(2)}</p>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">
              No booking yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default EnquiryDetails


