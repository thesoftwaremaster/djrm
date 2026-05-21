import { Link } from 'react-router-dom'

const CustomerList = ({ customers = [] }) => {
  if (!customers.length) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        No customers yet.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {customers.map((customer) => (
        <Link
          key={customer.id}
          to={`/customers/${customer.id}`}
          className="block min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-4 transition hover:bg-surface-subtle sm:px-5"
        >
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-base font-semibold text-text-primary">
                {customer.name}
              </h2>

              <div className="mt-2 space-y-1 text-sm text-text-secondary">
                {customer.email && <p className="break-all">{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default CustomerList
