const statusStyles = {
  // enquiries
  new: 'border-blue-200 bg-blue-50 text-blue-700',
  contacted: 'border-slate-200 bg-slate-50 text-slate-700',
  quoted: 'border-blue-200 bg-blue-50 text-blue-700',
  booked: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  completed: 'border-slate-200 bg-slate-50 text-slate-700',
  lost: 'border-rose-200 bg-rose-50 text-rose-700',

  // bookings
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  confirmed: 'border-blue-200 bg-blue-50 text-blue-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',

  // invoices
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  sent: 'border-blue-200 bg-blue-50 text-blue-700',
  part_paid: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  overdue: 'border-amber-200 bg-amber-50 text-amber-700',
}

const statusLabels = {
  part_paid: 'Part-paid',
}

const StatusBadge = ({ status }) => {
  const label = statusLabels[status] || status

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
        statusStyles[status] || 'border-slate-200 bg-slate-50 text-slate-700'
      }`}
    >
      {label}
    </span>
  )
}

export default StatusBadge
