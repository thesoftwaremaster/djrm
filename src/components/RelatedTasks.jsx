import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { completeTask, fetchOpenTasksForRecord } from '../workflows/tasksWorkflow'

const formatTaskDate = (value) => {
  if (!value) return 'No due date'

  const [year, month, day] = value.split('-').map(Number)
  const parsedDate = year && month && day
    ? new Date(year, month - 1, day)
    : new Date(value)

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

const getRelation = ({ bookingId, invoiceId, customerId, clientId }) => {
  if (bookingId) return { field: 'booking_id', id: bookingId }
  if (invoiceId) return { field: 'invoice_id', id: invoiceId }
  if (clientId || customerId) return { field: 'client_id', id: clientId || customerId }

  return null
}

const RelatedTasks = ({
  title = 'Open tasks',
  bookingId,
  invoiceId,
  customerId,
  clientId,
  tasks,
  scheduleMode = false,
  emptyMessage = 'No open tasks.',
  currentPath = '',
  onTaskCompleted,
}) => {
  const [fetchedTasks, setFetchedTasks] = useState([])
  const [updatingTaskId, setUpdatingTaskId] = useState('')

  const loadTasks = useCallback(async () => {
    if (tasks) return

    const relation = getRelation({ bookingId, invoiceId, customerId, clientId })
    if (!relation) {
      setFetchedTasks([])
      return
    }

    try {
      const nextTasks = await fetchOpenTasksForRecord(relation)
      setFetchedTasks(nextTasks)
    } catch (taskError) {
      console.error(taskError)
      setFetchedTasks([])
    }
  }, [bookingId, clientId, customerId, invoiceId, tasks])

  useEffect(() => {
    void Promise.resolve().then(() => loadTasks())
  }, [loadTasks])

  const visibleTasks = tasks || fetchedTasks

  const handleComplete = async (taskId) => {
    if (updatingTaskId) return

    setUpdatingTaskId(taskId)

    try {
      await completeTask(taskId)

      if (!tasks) {
        setFetchedTasks((currentTasks) => (
          currentTasks.filter((task) => task.id !== taskId)
        ))
      }

      onTaskCompleted?.(taskId)
    } catch (taskError) {
      console.error(taskError)
    } finally {
      setUpdatingTaskId('')
    }
  }

  return (
    <div className="rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5">
      <div className="mb-4 text-left">
        <p className="text-sm font-medium text-text-muted">
          {scheduleMode ? 'Schedule tasks' : 'Tasks'}
        </p>
        <h2 className="mt-1 text-xl font-semibold text-text-primary">{title}</h2>
      </div>

      {visibleTasks.length ? (
        <div className="space-y-2">
          {visibleTasks.map((task) => {
            const taskPath = getTaskPath(task)
            const showLink = taskPath && taskPath !== currentPath

            return (
              <div
                key={task.id}
                className="flex gap-2 rounded-2xl border border-border-soft bg-surface-subtle px-3 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-text-primary">
                    {task.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
                    <span className="rounded-full border border-border-soft bg-surface px-2 py-0.5 text-text-secondary">
                      {formatTaskDate(task.due_date)}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 ${
                      task.priority === 'high'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-border-soft bg-surface text-text-secondary'
                    }`}>
                      {task.priority || 'normal'}
                    </span>
                  </div>
                  {showLink && (
                    <Link
                      to={taskPath}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-text-secondary transition hover:text-text-primary"
                    >
                      Open related record
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleComplete(task.id)}
                  disabled={Boolean(updatingTaskId)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-surface text-text-secondary transition hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Complete ${task.title}`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">
          {emptyMessage}
        </p>
      )}
    </div>
  )
}

export default RelatedTasks
