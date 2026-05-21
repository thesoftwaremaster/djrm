import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import StatusBadge from './ui/StatusBadge'

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0))

const BookingList = ({ bookings = [] }) => {
  if (!bookings.length) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        No bookings yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {bookings.map((booking) => (
        <Link
          key={booking.id}
          to={`/bookings/${booking.id}`}
          className="block min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] transition hover:bg-surface-subtle sm:px-5"
        >
          <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-center gap-2.5 flex-wrap">
                <h2 className="min-w-0 break-words text-base font-semibold tracking-tight text-text-primary">
                  {booking.enquiries?.clients?.name || 'Unknown client'}
                </h2>

                <StatusBadge status={booking.status} />

                {booking.enquiries?.event_type && (
                  <span className="rounded-full border border-border-soft bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
                    {booking.enquiries.event_type}
                  </span>
                )}
              </div>

              <div className="text-left space-y-1 text-sm text-text-secondary">
                {booking.enquiries?.clients?.email && (
                  <p className="break-all">{booking.enquiries.clients.email}</p>
                )}

                {booking.enquiries?.event_date && (
                  <p>Date: {booking.enquiries.event_date}</p>
                )}
              </div>

              <div className="text-left mt-5 flex items-center gap-2 text-sm font-medium text-text-secondary transition hover:text-text-primary">
                View booking
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>

            <div className="shrink-0 rounded-2xl border border-border-soft bg-surface-subtle px-5 py-4 text-left md:text-right">
              <p className="text-xs uppercase tracking-[0.14em] text-text-muted">
                Total
              </p>
              <p className="mt-2 break-words text-xl font-semibold text-text-primary">
                {formatCurrency(booking.total_price)}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default BookingList
