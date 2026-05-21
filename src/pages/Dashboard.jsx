import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  FileWarning,
  History,
  PlusCircle,
  Receipt,
  RefreshCw,
  SearchCheck,
  UserPlus,
} from 'lucide-react'
import { supabase } from '../supabase'
import StatusBadge from '../components/ui/StatusBadge'
import { deriveInvoiceStatus, getPaidTotal } from '../utils/statusAutomation'
import { getBookingConflictSummary } from '../utils/bookingConflicts'
import { completeTask, fetchOpenTasks, refreshOperationalTasks } from '../workflows/tasksWorkflow'

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(Number(value || 0))
}

const formatDateTime = (value) => {
  if (!value) return 'No date set'

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const parseDateOnly = (value) => {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const formatDate = (value) => {
  if (!value) return 'No date set'

  const parsedDate = parseDateOnly(value) || new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('en-GB')
}

const formatWeekDate = (value) => {
  if (!value) return ''

  return value.toLocaleDateString('en-GB', {
    day: 'numeric',
  })
}

const formatTime = (value) => {
  if (!value) return ''

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) return ''

  return parsedDate.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getCompactTime = (booking) => {
  return formatTime(booking.event?.start_time)
}

const getDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const getBookingDateKey = (booking) => {
  const value = getBookingDateValue(booking)
  if (!value) return ''

  if (!value.includes('T')) return value

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''

  return getDateKey(parsedDate)
}

const getCurrentWeekDays = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() + mondayOffset)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)

    return {
      date,
      key: getDateKey(date),
      label: date.toLocaleDateString('en-GB', { weekday: 'short' }),
      isToday: getDateKey(date) === getDateKey(today),
    }
  })
}

const getBookingDateValue = (booking) => {
  return booking.event?.start_time || booking.enquiries?.event_date || null
}

const getBookingTimestamp = (booking) => {
  const value = getBookingDateValue(booking)
  if (!value) return Number.MAX_SAFE_INTEGER

  const parsedDate = new Date(value)
  return Number.isNaN(parsedDate.getTime())
    ? Number.MAX_SAFE_INTEGER
    : parsedDate.getTime()
}

const getBookingChipClass = (status) => {
  const chipClasses = {
    confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    pending: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    completed: 'border-gray-200 bg-surface-subtle text-slate-700 hover:bg-gray-100',
  }

  return chipClasses[status] || 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
}

const getBookingDotClass = (status) => {
  const dotClasses = {
    confirmed: 'bg-emerald-500',
    pending: 'bg-amber-500',
    completed: 'bg-gray-400',
  }

  return dotClasses[status] || 'bg-slate-500'
}

const getBookingChipTitle = (booking) => {
  const client = booking.enquiries?.clients?.name || 'Unknown client'
  const eventType = booking.enquiries?.event_type || 'Booking'
  const venue = booking.event?.location || booking.enquiries?.venue || 'No venue'
  const time = getCompactTime(booking) || 'No time set'

  return `${client} | ${eventType} | ${venue} | ${time}`
}

const getActivityPath = (activity) => {
  if (activity.booking_id) return `/bookings/${activity.booking_id}`
  if (activity.entity_type === 'booking' && activity.entity_id) return `/bookings/${activity.entity_id}`
  if (activity.entity_type === 'invoice' && activity.entity_id) return `/invoices/${activity.entity_id}`
  if (activity.metadata?.invoice_id) return `/invoices/${activity.metadata.invoice_id}`
  if (activity.entity_type === 'enquiry' && activity.entity_id) return `/enquiries/${activity.entity_id}`
  if (['client', 'customer'].includes(activity.entity_type) && activity.entity_id) {
    return `/customers/${activity.entity_id}`
  }
  if (activity.client_id) return `/customers/${activity.client_id}`

  return null
}

const getTaskPath = (task) => {
  if (task.invoice_id) return `/invoices/${task.invoice_id}`
  if (task.booking_id) return `/bookings/${task.booking_id}`
  if (task.client_id) return `/customers/${task.client_id}`
  if (task.entity_type === 'invoice' && task.entity_id) return `/invoices/${task.entity_id}`
  if (task.entity_type === 'booking' && task.entity_id) return `/bookings/${task.entity_id}`
  if (['client', 'customer'].includes(task.entity_type) && task.entity_id) return `/customers/${task.entity_id}`

  return null
}

const isMissingPaymentDueDateError = (error) => {
  const message = error?.message || ''

  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('payments.due_date') ||
    message.includes("'due_date' column") ||
    message.includes('Could not find the')
  )
}

const fetchDashboardPayments = async () => {
  const paymentsWithDueDate = await supabase
    .from('payments')
    .select('id, amount, paid, type, due_date, invoice_id')

  if (!paymentsWithDueDate.error) {
    return paymentsWithDueDate
  }

  if (!isMissingPaymentDueDateError(paymentsWithDueDate.error)) {
    return paymentsWithDueDate
  }

  console.warn(
    'payments.due_date is not available yet. Run the latest Supabase migration to enable tracked payment due dates.'
  )

  const fallbackPayments = await supabase
    .from('payments')
    .select('id, amount, paid, type, invoice_id')

  if (fallbackPayments.error) {
    return fallbackPayments
  }

  return {
    ...fallbackPayments,
    data: (fallbackPayments.data || []).map((payment) => ({
      ...payment,
      due_date: null,
    })),
  }
}

const Dashboard = () => {
  const [metrics, setMetrics] = useState({
    totalEnquiries: 0,
    upcomingBookings: 0,
    unpaidInvoices: 0,
    paidRevenue: 0,
    outstandingRevenue: 0,
    missingContracts: 0,
  })
  const [upcomingBookings, setUpcomingBookings] = useState([])
  const [weeklyBookings, setWeeklyBookings] = useState([])
  const [unpaidInvoices, setUnpaidInvoices] = useState([])
  const [overduePayments, setOverduePayments] = useState([])
  const [missingContracts, setMissingContracts] = useState([])
  const [tasks, setTasks] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [error, setError] = useState('')
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [tasksRefreshing, setTasksRefreshing] = useState(false)

  const fetchDashboardData = async () => {
    setError('')
    setDashboardLoading(true)

    const [
      enquiriesResponse,
      invoicesResponse,
      paymentsResponse,
      bookingsResponse,
      eventsResponse,
      contractsResponse,
      activityResponse,
    ] = await Promise.all([
      supabase.from('enquiries').select('id, status'),

      supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          status,
          total,
          due_date,
          client_id,
          booking_id,
          clients (
            id,
            name
          )
        `)
        .order('due_date', { ascending: true, nullsFirst: false }),

      fetchDashboardPayments(),

      supabase
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
            clients (
              id,
              name
            )
          )
        `),

      supabase
        .from('events')
        .select(`
          id,
          booking_id,
          start_time,
          end_time,
          location
        `),

      supabase
        .from('booking_contracts')
        .select('id, booking_id'),

      supabase
        .from('activity_logs')
        .select(`
          id,
          entity_type,
          entity_id,
          booking_id,
          client_id,
          title,
          description,
          metadata,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(8),
    ])

    const responses = [
      enquiriesResponse,
      invoicesResponse,
      paymentsResponse,
      bookingsResponse,
      eventsResponse,
      contractsResponse,
      activityResponse,
    ]

    const firstError = responses.find((response) => response.error)

    if (firstError?.error) {
      console.error(firstError.error)
      setError('Could not load dashboard data.')
      setDashboardLoading(false)
      return
    }

    const enquiries = enquiriesResponse.data || []
    const invoices = invoicesResponse.data || []
    const payments = paymentsResponse.data || []
    const bookings = bookingsResponse.data || []
    const events = eventsResponse.data || []
    const contracts = contractsResponse.data || []

    const paymentsByInvoice = payments.reduce((groupedPayments, payment) => {
      if (!payment.invoice_id) return groupedPayments

      return {
        ...groupedPayments,
        [payment.invoice_id]: [
          ...(groupedPayments[payment.invoice_id] || []),
          payment,
        ],
      }
    }, {})

    const invoicesWithPaymentState = invoices.map((invoice) => {
      const invoicePayments = paymentsByInvoice[invoice.id] || []
      const totalPaid = getPaidTotal(invoicePayments)
      const derivedStatus = deriveInvoiceStatus({ invoice, totalPaid })

      return {
        ...invoice,
        totalPaid,
        outstandingBalance: Math.max(0, Number(invoice.total || 0) - totalPaid),
        derivedStatus,
      }
    })

    const visibleUnpaidInvoices = invoicesWithPaymentState
      .filter((invoice) => (
        invoice.derivedStatus !== 'paid' &&
        invoice.derivedStatus !== 'cancelled'
      ))
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1

        const firstDate = parseDateOnly(a.due_date) || new Date(a.due_date)
        const secondDate = parseDateOnly(b.due_date) || new Date(b.due_date)

        return firstDate - secondDate
      })

    const invoiceById = invoicesWithPaymentState.reduce((groupedInvoices, invoice) => {
      return {
        ...groupedInvoices,
        [invoice.id]: invoice,
      }
    }, {})

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const visibleOverduePayments = payments
      .filter((payment) => {
        if (payment.paid || !payment.due_date) return false

        const invoice = invoiceById[payment.invoice_id]

        if (!invoice) return false
        if (['paid', 'cancelled'].includes(invoice.derivedStatus)) return false

        const dueDate = parseDateOnly(payment.due_date) || new Date(payment.due_date)
        dueDate.setHours(0, 0, 0, 0)

        return !Number.isNaN(dueDate.getTime()) && dueDate < today
      })
      .map((payment) => ({
        ...payment,
        invoice: invoiceById[payment.invoice_id],
      }))
      .sort((a, b) => {
        const firstDate = parseDateOnly(a.due_date) || new Date(a.due_date)
        const secondDate = parseDateOnly(b.due_date) || new Date(b.due_date)

        return firstDate - secondDate
      })

    const paidRevenue = payments.reduce((sum, payment) => {
      if (!payment.paid) return sum
      return sum + Number(payment.amount || 0)
    }, 0)

    const outstandingRevenue = invoicesWithPaymentState.reduce((sum, invoice) => {
      if (invoice.derivedStatus === 'cancelled') return sum
      return sum + invoice.outstandingBalance
    }, 0)

    const eventsByBookingId = events.reduce((groupedEvents, event) => {
      if (!event.booking_id) return groupedEvents
      const currentEvent = groupedEvents[event.booking_id]

      if (!currentEvent) {
        return {
          ...groupedEvents,
          [event.booking_id]: event,
        }
      }

      if (!currentEvent.start_time) return groupedEvents
      if (!event.start_time) return groupedEvents

      return new Date(event.start_time) < new Date(currentEvent.start_time)
        ? {
            ...groupedEvents,
            [event.booking_id]: event,
          }
        : groupedEvents
    }, {})

    const bookingsWithEvents = bookings.map((booking) => ({
      ...booking,
      event: eventsByBookingId[booking.id] || null,
    }))

    const nextBookings = bookingsWithEvents
      .filter((booking) => {
        if (['cancelled', 'completed'].includes(booking.status)) return false

        const value = getBookingDateValue(booking)
        if (!value) return false

        const parsedDate = new Date(value)
        return !Number.isNaN(parsedDate.getTime()) && parsedDate >= today
      })
      .sort((a, b) => getBookingTimestamp(a) - getBookingTimestamp(b))
      .slice(0, 6)

    const weekDays = getCurrentWeekDays()
    const weekStart = new Date(weekDays[0].date)
    const weekEnd = new Date(weekDays[6].date)
    weekEnd.setHours(23, 59, 59, 999)

    const currentWeekBookings = bookingsWithEvents
      .filter((booking) => {
        if (booking.status === 'cancelled') return false

        const bookingKey = getBookingDateKey(booking)
        if (!bookingKey) return false

        const bookingDate = parseDateOnly(bookingKey)
        if (!bookingDate) return false

        return bookingDate >= weekStart && bookingDate <= weekEnd
      })
      .sort((a, b) => getBookingTimestamp(a) - getBookingTimestamp(b))

    const contractBookingIds = new Set(
      contracts.map((contract) => contract.booking_id)
    )

    const bookingsMissingContracts = bookingsWithEvents
      .filter((booking) => (
        ['pending', 'confirmed'].includes(booking.status) &&
        !contractBookingIds.has(booking.id)
      ))
      .sort((a, b) => getBookingTimestamp(a) - getBookingTimestamp(b))
      .slice(0, 6)

    setMetrics({
      totalEnquiries: enquiries.length,
      upcomingBookings: nextBookings.length,
      unpaidInvoices: visibleUnpaidInvoices.length,
      paidRevenue,
      outstandingRevenue,
      missingContracts: bookingsMissingContracts.length,
    })

    setUpcomingBookings(nextBookings)
    setWeeklyBookings(currentWeekBookings)
    setUnpaidInvoices(visibleUnpaidInvoices.slice(0, 6))
    setOverduePayments(visibleOverduePayments.slice(0, 6))
    setMissingContracts(bookingsMissingContracts)
    try {
      await refreshOperationalTasks()
      const openTasks = await fetchOpenTasks()
      setTasks(openTasks)
    } catch (tasksError) {
      console.error(tasksError)
      setTasks([])
      setError('Dashboard loaded, but tasks could not be refreshed.')
    }
    setRecentActivity(activityResponse.data || [])
    setDashboardLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => fetchDashboardData())
  }, [])

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const tableClass =
    'overflow-hidden rounded-2xl border border-border-soft bg-surface'

  const tableHeaderClass =
    'hidden border-b border-border-soft bg-surface-subtle px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted md:grid'

  const tableRowClass =
    'grid min-w-0 gap-2 border-b border-border-soft px-4 py-3 text-sm transition last:border-b-0 hover:bg-surface-subtle md:items-center [&>*]:min-w-0 [&>*]:break-words'

  const metricCards = [
    {
      label: 'Total enquiries',
      value: metrics.totalEnquiries,
      icon: SearchCheck,
      iconClassName: 'border-blue-200 bg-blue-50 text-blue-700',
    },
    {
      label: 'Upcoming bookings',
      value: metrics.upcomingBookings,
      icon: CalendarClock,
      iconClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      label: 'Unpaid invoices',
      value: metrics.unpaidInvoices,
      icon: Receipt,
      iconClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Paid revenue',
      value: formatCurrency(metrics.paidRevenue),
      icon: CircleDollarSign,
      iconClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Outstanding revenue',
      value: formatCurrency(metrics.outstandingRevenue),
      icon: CircleDollarSign,
      iconClassName: 'border-amber-200 bg-amber-50 text-amber-700',
    },
    {
      label: 'Missing contracts',
      value: metrics.missingContracts,
      icon: FileWarning,
      iconClassName: metrics.missingContracts > 0
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700',
      valueClassName: metrics.missingContracts > 0 ? 'text-amber-800' : 'text-[var(--text-primary)]',
    },
  ]

  const quickActions = useMemo(() => [
    {
      label: 'New enquiry',
      to: '/enquiries',
      icon: PlusCircle,
    },
    {
      label: 'New customer',
      to: '/customers',
      icon: UserPlus,
    },
    {
      label: 'New invoice',
      to: '/invoices',
      icon: Receipt,
    },
    {
      label: 'View bookings',
      to: '/bookings',
      icon: BriefcaseBusiness,
    },
  ], [])

  const weekDays = useMemo(() => getCurrentWeekDays(), [])
  const weeklyBookingsByDay = useMemo(() => {
    return weeklyBookings.reduce((bookingsByDay, booking) => {
      const dateKey = getBookingDateKey(booking)
      if (!dateKey) return bookingsByDay

      return {
        ...bookingsByDay,
        [dateKey]: [
          ...(bookingsByDay[dateKey] || []),
          booking,
        ],
      }
    }, {})
  }, [weeklyBookings])

  const getDayConflictState = (dayBookings) => {
    if (dayBookings.length < 2) {
      return {
        hasMultiple: false,
        hasOverlap: false,
      }
    }

    const hasOverlap = dayBookings.some((booking) => {
      const conflictSummary = getBookingConflictSummary({
        candidate: {
          eventDate: booking.enquiries?.event_date,
          startTime: booking.event?.start_time,
          endTime: booking.event?.end_time,
          excludeBookingId: booking.id,
        },
        bookings: dayBookings,
      })

      return conflictSummary.hasOverlap
    })

    return {
      hasMultiple: true,
      hasOverlap,
    }
  }

  const taskGroups = useMemo(() => {
    const todayKey = getDateKey(new Date())

    return {
      overdue: tasks.filter((task) => task.due_date && task.due_date < todayKey),
      today: tasks.filter((task) => task.due_date === todayKey),
      upcoming: tasks.filter((task) => !task.due_date || task.due_date > todayKey),
    }
  }, [tasks])

  const visibleTaskCount =
    taskGroups.overdue.length + taskGroups.today.length + taskGroups.upcoming.length

  const handleRefreshTasks = async () => {
    if (tasksRefreshing) return

    setTasksRefreshing(true)
    setError('')

    try {
      await refreshOperationalTasks()
      const openTasks = await fetchOpenTasks()
      setTasks(openTasks)
    } catch (tasksError) {
      console.error(tasksError)
      setError('Could not refresh tasks.')
    } finally {
      setTasksRefreshing(false)
    }
  }

  const handleCompleteTask = async (taskId) => {
    setError('')

    try {
      await completeTask(taskId)
      setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
    } catch (taskError) {
      console.error(taskError)
      setError('Could not complete task.')
    }
  }

  const renderTaskGroup = (label, groupTasks) => {
    if (!groupTasks.length) return null

    return (
      <div className="space-y-2">
        <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
          {label}
        </p>
        {groupTasks.slice(0, 5).map((task) => {
          const taskPath = getTaskPath(task)
          const taskContent = (
            <div className="min-w-0 flex-1 text-left">
              <p className="break-words text-sm font-semibold text-text-primary">
                {task.title}
              </p>
              {task.description && (
                <p className="mt-1 text-xs leading-5 text-text-secondary">
                  {task.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
                <span className={`rounded-full border px-2 py-0.5 ${
                  task.priority === 'high'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-border-soft bg-surface-subtle text-text-secondary'
                }`}>
                  {task.priority || 'normal'}
                </span>
                <span className="rounded-full border border-border-soft bg-surface-subtle px-2 py-0.5 text-text-secondary">
                  {task.due_date ? formatDate(task.due_date) : 'No due date'}
                </span>
              </div>
            </div>
          )

          return (
            <div
              key={task.id}
              className="flex gap-2 rounded-2xl border border-border-soft bg-surface px-3 py-3"
            >
              {taskPath ? (
                <Link to={taskPath} className="min-w-0 flex-1">
                  {taskContent}
                </Link>
              ) : (
                taskContent
              )}

              <button
                type="button"
                onClick={() => handleCompleteTask(task.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-surface-subtle text-text-secondary transition hover:bg-emerald-50 hover:text-emerald-700"
                aria-label={`Complete ${task.title}`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Command centre
          </p>
          <h1 className="mt-1.5 max-w-sm break-words text-2xl font-semibold leading-tight tracking-tight text-text-primary sm:text-3xl">
            Today&apos;s operations
          </h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
            A daily view of bookings, billing, contracts, and recent movement across the CRM.
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {quickActions.map((action) => {
            const Icon = action.icon

            return (
              <Link
                key={action.label}
                to={action.to}
                className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-border-soft bg-surface px-3 text-sm font-medium text-text-primary shadow-[0_3px_10px_rgba(15,23,42,0.025)] transition hover:bg-surface-subtle"
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border-soft bg-surface-subtle text-text-secondary">
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="truncate">{action.label}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </Link>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon

          return (
            <div
              key={metric.label}
              className="min-w-0 rounded-xl border border-border-soft bg-surface p-3 shadow-[0_4px_14px_rgba(15,23,42,0.025)]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${metric.iconClassName}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
              </div>

              <p className="truncate text-left text-xs font-medium text-text-secondary">
                {metric.label}
              </p>
              <p className={`mt-1 break-words text-left text-sm font-semibold ${metric.valueClassName || 'text-text-primary'}`}>
                {dashboardLoading ? '...' : metric.value}
              </p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className={cardClass}>
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-left">
                <p className="text-sm font-medium text-[var(--text-muted)]">This week</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  Weekly calendar
                </h2>
              </div>

              <Link
                to="/schedule"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                View schedule
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {dashboardLoading ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                Loading this week...
              </p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="grid min-w-[760px] grid-cols-7 gap-2">
                  {weekDays.map((day) => {
                    const dayBookings = weeklyBookingsByDay[day.key] || []
                    const conflictState = getDayConflictState(dayBookings)
                    const dayClassName = [
                      'border-[var(--border-soft)] bg-[var(--surface)]',
                      day.isToday ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : '',
                      conflictState.hasOverlap
                        ? 'border-amber-300 bg-amber-50/80 ring-1 ring-inset ring-amber-200'
                        : '',
                      conflictState.hasMultiple && !conflictState.hasOverlap
                        ? 'border-amber-200 bg-amber-50/45'
                        : '',
                    ].filter(Boolean).join(' ')

                    return (
                      <div
                        key={day.key}
                        className={`min-h-[158px] rounded-2xl border p-2.5 text-left ${dayClassName}`}
                      >
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                              {day.label}
                            </p>
                            <p className="mt-0.5 text-lg font-semibold leading-none text-[var(--text-primary)]">
                              {formatWeekDate(day.date)}
                            </p>
                          </div>

                          {conflictState.hasMultiple ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                              <AlertTriangle className="h-3 w-3" />
                              {dayBookings.length}
                            </span>
                          ) : day.isToday && (
                            <span className="shrink-0 rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                              Today
                            </span>
                          )}
                        </div>

                        {dayBookings.length ? (
                          <div className="space-y-1.5">
                            {dayBookings.slice(0, 3).map((booking) => {
                              const compactTime = getCompactTime(booking)

                              return (
                                <Link
                                  key={booking.id}
                                  to={`/bookings/${booking.id}`}
                                  title={getBookingChipTitle(booking)}
                                  className={`block min-h-10 rounded-xl border px-2 py-1.5 text-left text-xs transition ${getBookingChipClass(booking.status)}`}
                                >
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${getBookingDotClass(booking.status)}`} />
                                    <span className="min-w-0 truncate font-semibold">
                                      {booking.enquiries?.clients?.name || 'Unknown client'}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block truncate pl-3.5 text-[11px] opacity-80">
                                    {compactTime ? `${compactTime} - ` : ''}
                                    {booking.enquiries?.event_type || 'Booking'}
                                  </span>
                                </Link>
                              )
                            })}

                            {dayBookings.length > 3 && (
                              <p className="rounded-xl bg-white/75 px-2 py-1 text-xs font-medium text-[var(--text-secondary)]">
                                +{dayBookings.length - 3} more
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="pt-8 text-center text-xs text-[var(--text-muted)]">
                            No bookings
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className={cardClass}>
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-left">
                <p className="text-sm font-medium text-[var(--text-muted)]">Schedule</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  Upcoming bookings
                </h2>
              </div>

              <Link
                to="/bookings"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                View bookings
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {dashboardLoading ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                Loading upcoming bookings...
              </p>
            ) : upcomingBookings.length ? (
              <div className={tableClass}>
                <div className={`${tableHeaderClass} grid-cols-[0.9fr_1fr_0.9fr_1fr_0.7fr_0.5fr]`}>
                  <span>Date</span>
                  <span>Client</span>
                  <span>Event</span>
                  <span>Venue</span>
                  <span>Status</span>
                  <span>Link</span>
                </div>
                {upcomingBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className={`${tableRowClass} md:grid-cols-[0.9fr_1fr_0.9fr_1fr_0.7fr_0.5fr]`}
                  >
                    <span className="text-[var(--text-secondary)]">
                      {booking.event?.start_time
                        ? formatDateTime(booking.event.start_time)
                        : formatDate(booking.enquiries?.event_date)}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {booking.enquiries?.clients?.name || 'Unknown client'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {booking.enquiries?.event_type || 'Booking'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {booking.event?.location || booking.enquiries?.venue || 'No venue'}
                    </span>
                    <span><StatusBadge status={booking.status} /></span>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      Open
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                No upcoming bookings.
              </p>
            )}
          </div>

          <div className={cardClass}>
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-left">
                <p className="text-sm font-medium text-[var(--text-muted)]">Billing</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  Unpaid invoices
                </h2>
              </div>

              <Link
                to="/invoices"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                View invoices
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {dashboardLoading ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                Loading unpaid invoices...
              </p>
            ) : unpaidInvoices.length ? (
              <div className={tableClass}>
                <div className={`${tableHeaderClass} grid-cols-[0.9fr_1fr_0.75fr_0.75fr_0.75fr_0.8fr_0.7fr_0.5fr]`}>
                  <span>Invoice</span>
                  <span>Client</span>
                  <span>Total</span>
                  <span>Paid</span>
                  <span>Remaining</span>
                  <span>Due date</span>
                  <span>Status</span>
                  <span>Link</span>
                </div>
                {unpaidInvoices.map((invoice) => (
                  <Link
                    key={invoice.id}
                    to={`/invoices/${invoice.id}`}
                    className={`${tableRowClass} md:grid-cols-[0.9fr_1fr_0.75fr_0.75fr_0.75fr_0.8fr_0.7fr_0.5fr]`}
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {invoice.invoice_number || 'Draft invoice'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {invoice.clients?.name || 'Unknown client'}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCurrency(invoice.total)}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {formatCurrency(invoice.totalPaid)}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCurrency(invoice.outstandingBalance)}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {formatDate(invoice.due_date)}
                    </span>
                    <span><StatusBadge status={invoice.derivedStatus} /></span>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      Open
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                No unpaid invoices.
              </p>
            )}
          </div>

          <div className={cardClass}>
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-left">
                <p className="text-sm font-medium text-[var(--text-muted)]">Chasing</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  Overdue tracked payments
                </h2>
              </div>

              <Link
                to="/invoices"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
              >
                View invoices
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {dashboardLoading ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                Loading tracked payments...
              </p>
            ) : overduePayments.length ? (
              <div className={tableClass}>
                <div className={`${tableHeaderClass} grid-cols-[0.9fr_1fr_0.8fr_0.75fr_0.8fr_0.5fr]`}>
                  <span>Invoice</span>
                  <span>Client</span>
                  <span>Type</span>
                  <span>Amount</span>
                  <span>Due date</span>
                  <span>Link</span>
                </div>
                {overduePayments.map((payment) => (
                  <Link
                    key={payment.id}
                    to={`/invoices/${payment.invoice_id}`}
                    className={`${tableRowClass} md:grid-cols-[0.9fr_1fr_0.8fr_0.75fr_0.8fr_0.5fr]`}
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {payment.invoice?.invoice_number || 'Draft invoice'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {payment.invoice?.clients?.name || 'Unknown client'}
                    </span>
                    <span className="capitalize text-[var(--text-secondary)]">
                      {payment.type || 'payment'}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatCurrency(payment.amount)}
                    </span>
                    <span className="font-medium text-amber-700">
                      {formatDate(payment.due_date)}
                    </span>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      Open
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                No overdue tracked payments.
              </p>
            )}
          </div>

          <div className={cardClass}>
            <div className="mb-4 text-left">
              <p className="text-sm font-medium text-[var(--text-muted)]">Contracts</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                Missing contracts
              </h2>
            </div>

            {dashboardLoading ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                Loading contracts...
              </p>
            ) : missingContracts.length ? (
              <div className={tableClass}>
                <div className={`${tableHeaderClass} grid-cols-[1fr_1fr_0.9fr_0.9fr_0.8fr_0.5fr]`}>
                  <span>Booking</span>
                  <span>Client</span>
                  <span>Event</span>
                  <span>Date</span>
                  <span>Contract</span>
                  <span>Link</span>
                </div>
                {missingContracts.map((booking) => (
                  <Link
                    key={booking.id}
                    to={`/bookings/${booking.id}`}
                    className={`${tableRowClass} md:grid-cols-[1fr_1fr_0.9fr_0.9fr_0.8fr_0.5fr]`}
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      Booking #{booking.id.slice(0, 8)}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">
                      {booking.enquiries?.clients?.name || 'Unknown client'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {booking.event?.location || booking.enquiries?.venue || 'No venue'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      {formatDate(getBookingDateValue(booking))}
                    </span>
                    <span className="text-sm font-medium text-amber-800">
                      Missing
                    </span>
                    <span className="text-sm font-medium text-[var(--text-secondary)]">
                      Open
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                No missing contracts.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
        <div className={`${cardClass} self-start`}>
          <div className="mb-4 flex min-w-0 items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-muted)]">Tasks</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                Needs attention
              </h2>
            </div>

            <button
              type="button"
              onClick={handleRefreshTasks}
              disabled={dashboardLoading || tasksRefreshing}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-border-soft bg-surface-subtle px-3 text-xs font-medium text-text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${tasksRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {dashboardLoading ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Loading tasks...
            </p>
          ) : visibleTaskCount ? (
            <div className="space-y-4">
              {renderTaskGroup('Overdue', taskGroups.overdue)}
              {renderTaskGroup('Due today', taskGroups.today)}
              {renderTaskGroup('Upcoming', taskGroups.upcoming)}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No tasks needing attention.
            </p>
          )}
        </div>

        <div className={`${cardClass} self-start`}>
          <div className="mb-4 flex min-w-0 items-center gap-3 text-left">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[var(--surface-subtle)] text-[var(--text-secondary)]">
              <History className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-muted)]">History</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                Recent activity
              </h2>
            </div>
          </div>

          {dashboardLoading ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Loading recent activity...
            </p>
          ) : recentActivity.length ? (
            <div className="divide-y divide-[var(--border-soft)] overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-subtle)]">
              {recentActivity.slice(0, 5).map((activity) => {
                const activityPath = getActivityPath(activity)
                const content = (
                  <div className="px-4 py-3 text-left transition hover:bg-white">
                    <p className="break-words text-sm font-medium text-[var(--text-primary)]">
                      {activity.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {formatDateTime(activity.created_at)}
                    </p>
                    {activity.description && (
                      <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                        {activity.description}
                      </p>
                    )}
                  </div>
                )

                return activityPath ? (
                  <Link key={activity.id} to={activityPath}>
                    {content}
                  </Link>
                ) : (
                  <div key={activity.id}>{content}</div>
                )
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No recent activity.
            </p>
          )}
        </div>
        </div>

      </div>
    </div>
  )
}

export default Dashboard

