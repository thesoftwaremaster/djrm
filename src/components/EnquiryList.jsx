import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import StatusBadge from './ui/StatusBadge'
import {
  convertEnquiryToBooking,
  updateEnquiryStatus,
} from '../workflows/enquiryBookingActions'
import { fetchBookingConflicts } from '../utils/bookingConflicts'

const EnquiryList = ({ enquiries = [], onRefresh }) => {
  const navigate = useNavigate()
  const [statusUpdatingId, setStatusUpdatingId] = useState(null)
  const [convertingId, setConvertingId] = useState(null)

  const updateStatus = async (id, status) => {
    if (statusUpdatingId) return

    setStatusUpdatingId(id)

    try {
      await updateEnquiryStatus({ enquiryId: id, status })
      await onRefresh?.()
    } catch (error) {
      console.error(error)
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const convertToBooking = async (enquiry) => {
    if (convertingId) return

    setConvertingId(enquiry.id)

    try {
      try {
        const conflictSummary = await fetchBookingConflicts({
          eventDate: enquiry.event_date,
        })

        if (conflictSummary.hasConflict) {
          const shouldContinue = window.confirm(`${conflictSummary.message} Continue anyway?`)

          if (!shouldContinue) {
            setConvertingId(null)
            return
          }
        }
      } catch (conflictError) {
        console.warn('Booking conflict check failed:', conflictError)
      }

      const booking = await convertEnquiryToBooking({ enquiryId: enquiry.id })
      await onRefresh?.()
      navigate(`/bookings/${booking.id}`)
    } catch (error) {
      console.error(error)
    } finally {
      setConvertingId(null)
    }
  }

  if (!enquiries.length) {
    return (
      <div className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-6 text-sm text-text-muted">
        No enquiries yet.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {enquiries.map((enquiry) => {
        const isUpdatingStatus = statusUpdatingId === enquiry.id
        const isConverting = convertingId === enquiry.id

        return (
          <div
            key={enquiry.id}
            className="min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition hover:bg-surface-subtle sm:px-5"
          >
          <div className="flex w-full flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0 flex-1 text-left">
              <div className="mb-3 flex items-center gap-2.5 flex-wrap">
                {enquiry.clients?.id ? (
                  <Link
                    to={`/customers/${enquiry.clients.id}`}
                    className="min-w-0 break-words text-base font-semibold tracking-tight text-text-primary transition hover:underline"
                  >
                    {enquiry.clients?.name || 'Unknown client'}
                  </Link>
                ) : (
                  <h3 className="min-w-0 break-words text-base font-semibold tracking-tight text-text-primary">
                    Unknown client
                  </h3>
                )}

                <StatusBadge status={enquiry.status} />

                <span className="rounded-full border border-border-soft bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
                  {enquiry.event_type}
                </span>
              </div>

              <p className="mb-4 text-sm leading-6 text-text-secondary">
                {enquiry.event_type} enquiry
              </p>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-secondary">
                {enquiry.clients?.email && <span className="break-all">{enquiry.clients.email}</span>}
                <span>{enquiry.event_date || 'No date set'}</span>
                {enquiry.venue && <span>{enquiry.venue}</span>}
              </div>

              <Link
                to={`/enquiries/${enquiry.id}`}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
              >
                View enquiry
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row md:flex-col md:items-end">
              <select
                value={enquiry.status}
                onChange={(event) => updateStatus(enquiry.id, event.target.value)}
                disabled={Boolean(statusUpdatingId)}
                className="h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-base font-medium text-text-primary outline-none transition focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100 sm:text-sm md:w-auto"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="quoted">Quoted</option>
                <option value="booked">Booked</option>
                <option value="lost">Lost</option>
                <option value="completed">Completed</option>
              </select>

              {enquiry.status !== 'booked' && (
                <button
                  type="button"
                  onClick={() => convertToBooking(enquiry)}
                  disabled={Boolean(convertingId) || isUpdatingStatus}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
                >
                  {isConverting ? 'Converting...' : 'Convert'}
                </button>
              )}
            </div>
          </div>
        </div>
        )
      })}
    </div>
  )
}

export default EnquiryList
