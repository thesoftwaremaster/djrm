import { Link } from "react-router-dom"
import StatusBadge from './ui/StatusBadge'

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0))

const InvoiceList = ({ invoices = [] }) => {
  if (!invoices.length) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        No invoices yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice) => (
        <Link
          key={invoice.id}
          to={`/invoices/${invoice.id}`}
          className="block min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-4 transition hover:bg-surface-subtle sm:px-5"
        >
          <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h2 className="min-w-0 break-words text-base font-semibold text-text-primary">
                  {invoice.clients?.name || 'Unknown client'}
                </h2>

                <StatusBadge status={invoice.status} />

                {invoice.invoice_number && (
                  <span className="rounded-full border border-border-soft px-2.5 py-1 text-xs font-medium text-text-secondary">
                    {invoice.invoice_number}
                  </span>
                )}
              </div>

              <div className="space-y-1 text-sm text-text-secondary">
                {invoice.clients?.email && <p className="break-all">{invoice.clients.email}</p>}
                {invoice.due_date && <p>Due: {invoice.due_date}</p>}
              </div>
            </div>

            <div className="shrink-0 text-left md:text-right">
              <p className="text-sm text-text-muted">Total</p>
              <p className="break-words text-xl font-semibold text-text-primary">
                {formatCurrency(invoice.total)}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default InvoiceList
