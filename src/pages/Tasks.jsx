import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ListChecks, RefreshCw, RotateCcw } from 'lucide-react'
import {
  completeTask,
  fetchTasks,
  refreshOperationalTasks,
  reopenTask,
} from '../workflows/tasksWorkflow'

const parseDateOnly = (value) => {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const isValidDueDate = (value) => {
  const parsedDate = parseDateOnly(value)

  return parsedDate && !Number.isNaN(parsedDate.getTime())
}

const getDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const formatDate = (value) => {
  if (!value) return 'No due date'

  const parsedDate = parseDateOnly(value) || new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return value

  return parsedDate.toLocaleDateString('en-GB')
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

const getTaskType = (task) => {
  if (task.source?.includes('contract')) return 'contract'
  if (task.entity_type === 'payment') return 'payment'
  if (task.invoice_id || task.entity_type === 'invoice') return 'invoice'
  if (task.booking_id || task.entity_type === 'booking') return 'booking'
  if (task.client_id || ['client', 'customer'].includes(task.entity_type)) return 'customer'

  return task.entity_type || 'task'
}

const badgeClass = (tone) => {
  const tones = {
    high: 'border-amber-200 bg-amber-50 text-amber-700',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    open: 'border-blue-200 bg-blue-50 text-blue-700',
    muted: 'border-border-soft bg-surface-subtle text-text-secondary',
  }

  return tones[tone] || tones.muted
}

const Tasks = () => {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingTaskId, setUpdatingTaskId] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const loadTasks = async () => {
    setLoading(true)
    setError('')

    try {
      const nextTasks = await fetchTasks()
      setTasks(nextTasks)
    } catch (taskError) {
      console.error(taskError)
      setError('Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTasks())
  }, [])

  const filteredTasks = useMemo(() => (
    tasks.filter((task) => {
      const taskStatus = task.status || 'open'
      const taskPriority = task.priority || 'normal'
      const taskType = getTaskType(task)

      const matchesStatus = statusFilter === 'all' || taskStatus === statusFilter
      const matchesPriority = priorityFilter === 'all' || taskPriority === priorityFilter
      const matchesType = typeFilter === 'all' || taskType === typeFilter

      return matchesStatus && matchesPriority && matchesType
    })
  ), [priorityFilter, statusFilter, tasks, typeFilter])

  const groupedTasks = useMemo(() => {
    const todayKey = getDateKey(new Date())

    return {
      overdue: filteredTasks.filter((task) => task.status !== 'completed' && isValidDueDate(task.due_date) && task.due_date < todayKey),
      today: filteredTasks.filter((task) => task.status !== 'completed' && isValidDueDate(task.due_date) && task.due_date === todayKey),
      upcoming: filteredTasks.filter((task) => task.status !== 'completed' && isValidDueDate(task.due_date) && task.due_date > todayKey),
      noDueDate: filteredTasks.filter((task) => task.status !== 'completed' && !isValidDueDate(task.due_date)),
      completed: filteredTasks.filter((task) => task.status === 'completed'),
    }
  }, [filteredTasks])

  const handleRefreshGeneratedTasks = async () => {
    if (refreshing) return

    setRefreshing(true)
    setError('')
    setSuccessMessage('')

    try {
      const result = await refreshOperationalTasks()
      const nextTasks = await fetchTasks()
      setTasks(nextTasks)
      setSuccessMessage(
        `Generated tasks refreshed. Created ${result.created}, updated ${result.refreshed}, completed ${result.completed}, cleared ${result.cleared}.`
      )
    } catch (taskError) {
      console.error(taskError)
      setError('Could not refresh generated tasks.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleCompleteTask = async (taskId) => {
    if (updatingTaskId) return

    setUpdatingTaskId(taskId)
    setError('')
    setSuccessMessage('')

    try {
      await completeTask(taskId)
      const nextTasks = await fetchTasks()
      setTasks(nextTasks)
      setSuccessMessage('Task completed.')
    } catch (taskError) {
      console.error(taskError)
      setError('Could not complete task.')
    } finally {
      setUpdatingTaskId('')
    }
  }

  const handleReopenTask = async (taskId) => {
    if (updatingTaskId) return

    setUpdatingTaskId(taskId)
    setError('')
    setSuccessMessage('')

    try {
      await reopenTask(taskId)
      const nextTasks = await fetchTasks()
      setTasks(nextTasks)
      setSuccessMessage('Task reopened.')
    } catch (taskError) {
      console.error(taskError)
      setError('Could not reopen task.')
    } finally {
      setUpdatingTaskId('')
    }
  }

  const renderTaskRow = (task) => {
    const taskPath = getTaskPath(task)
    const isCompleted = task.status === 'completed'

    return (
      <div
        key={task.id}
        className="grid gap-3 border-b border-border-soft px-4 py-3 text-left text-sm last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_0.7fr_0.65fr_0.65fr_0.7fr_0.8fr] md:items-center"
      >
        <div className="min-w-0">
          <p className="break-words font-semibold text-text-primary">{task.title}</p>
          {task.description && (
            <p className="mt-1 break-words text-xs leading-5 text-text-secondary">
              {task.description}
            </p>
          )}
        </div>

        <span className="text-text-secondary">{formatDate(task.due_date)}</span>

        <span>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(task.priority)}`}>
            {task.priority || 'normal'}
          </span>
        </span>

        <span className="capitalize text-text-secondary">{getTaskType(task)}</span>

        <span>
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(isCompleted ? 'completed' : 'open')}`}>
            {task.status || 'open'}
          </span>
        </span>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {taskPath && (
            <Link
              to={taskPath}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border-soft bg-surface-subtle px-3 text-xs font-medium text-text-primary transition hover:bg-surface"
            >
              Open
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}

          {isCompleted ? (
            <button
              type="button"
              onClick={() => handleReopenTask(task.id)}
              disabled={Boolean(updatingTaskId)}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border-soft bg-surface px-3 text-xs font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reopen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleCompleteTask(task.id)}
              disabled={Boolean(updatingTaskId)}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-border-soft bg-surface px-3 text-xs font-medium text-text-primary transition hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Complete
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderGroup = (title, groupTasks) => {
    if (!groupTasks.length) return null

    return (
      <section className="rounded-2xl border border-border-soft bg-surface shadow-[0_4px_14px_rgba(15,23,42,0.025)]">
        <div className="border-b border-border-soft px-4 py-3 text-left">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <p className="mt-1 text-sm text-text-muted">{groupTasks.length} tasks</p>
        </div>
        <div>{groupTasks.map(renderTaskRow)}</div>
      </section>
    )
  }

  const hasTasks =
    groupedTasks.overdue.length ||
    groupedTasks.today.length ||
    groupedTasks.upcoming.length ||
    groupedTasks.noDueDate.length ||
    groupedTasks.completed.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Operations
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Tasks
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            Review generated and manual operational work across bookings, invoices, and customers.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefreshGeneratedTasks}
          disabled={refreshing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent-primary px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh generated tasks'}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {successMessage && !error && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-left">
            <span className="text-xs font-medium text-text-secondary">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-2xl border border-border-soft bg-surface px-3.5 text-sm text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
            >
              <option value="open">Open</option>
              <option value="completed">Completed</option>
              <option value="all">All</option>
            </select>
          </label>

          <label className="text-left">
            <span className="text-xs font-medium text-text-secondary">Priority</span>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-2xl border border-border-soft bg-surface px-3.5 text-sm text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">All</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>

          <label className="text-left">
            <span className="text-xs font-medium text-text-secondary">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-2xl border border-border-soft bg-surface px-3.5 text-sm text-text-primary outline-none transition focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100"
            >
              <option value="all">All</option>
              <option value="booking">Booking</option>
              <option value="invoice">Invoice</option>
              <option value="customer">Customer</option>
              <option value="payment">Payment</option>
              <option value="contract">Contract</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center text-sm text-text-muted">
          Loading tasks...
        </div>
      ) : hasTasks ? (
        <div className="space-y-5">
          {renderGroup('Overdue', groupedTasks.overdue)}
          {renderGroup('Due today', groupedTasks.today)}
          {renderGroup('Upcoming', groupedTasks.upcoming)}
          {renderGroup('No due date', groupedTasks.noDueDate)}
          {renderGroup('Completed', groupedTasks.completed)}
        </div>
      ) : (
        <div className="rounded-2xl border border-border-soft bg-surface p-6 text-center">
          <ListChecks className="mx-auto h-8 w-8 text-text-muted" />
          <p className="mt-3 text-sm text-text-muted">No tasks found.</p>
        </div>
      )}
    </div>
  )
}

export default Tasks
