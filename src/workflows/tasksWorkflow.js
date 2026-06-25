import { supabase } from '../supabase'
import { getCurrentUserId } from '../utils/tenant'
import { logActivity } from './activityLogActions'

const generatedSources = [
  'generated:missing_contract',
  'generated:deposit_overdue',
  'generated:balance_overdue',
  'generated:booking_this_week',
  'generated:booking_tomorrow',
  'generated:missing_event_details',
  'generated:completed_event_follow_up',
]

const getDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const parseDateOnly = (value) => {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const addDays = (date, days) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

const getBookingDateKey = (booking) => {
  const value = booking.event?.start_time || booking.enquiries?.event_date
  if (!value) return ''

  if (!String(value).includes('T')) return value

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''

  return getDateKey(parsedDate)
}

const getTaskKey = (task) => `${task.source}|${task.entity_type}|${task.entity_id}`

const dedupeGeneratedTasks = (tasks) => {
  const taskByKey = new Map()

  tasks.forEach((task) => {
    const key = getTaskKey(task)
    if (!taskByKey.has(key)) {
      taskByKey.set(key, task)
    }
  })

  return [...taskByKey.values()]
}

const getTaskLinkFields = (booking) => ({
  booking_id: booking.id,
  client_id: booking.enquiries?.clients?.id || null,
})

const buildBookingLabel = (booking) => {
  const eventType = booking.enquiries?.event_type || 'Booking'
  const clientName = booking.enquiries?.clients?.name || 'Unknown client'

  return `${eventType} for ${clientName}`
}

const buildGeneratedTasks = ({ bookings, contracts, invoices, payments }) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = addDays(today, 1)
  const mondayOffset = today.getDay() === 0 ? -6 : 1 - today.getDay()
  const weekStart = addDays(today, mondayOffset)
  const weekEnd = addDays(weekStart, 6)
  weekEnd.setHours(23, 59, 59, 999)

  const todayKey = getDateKey(today)
  const tomorrowKey = getDateKey(tomorrow)
  const contractBookingIds = new Set(contracts.map((contract) => contract.booking_id))
  const invoiceById = invoices.reduce((groupedInvoices, invoice) => ({
    ...groupedInvoices,
    [invoice.id]: invoice,
  }), {})

  const tasks = []

  bookings.forEach((booking) => {
    const bookingDateKey = getBookingDateKey(booking)
    const bookingDate = parseDateOnly(bookingDateKey)
    const bookingLabel = buildBookingLabel(booking)
    const linkFields = getTaskLinkFields(booking)
    const isActiveBooking = !['cancelled', 'completed'].includes(booking.status)

    if (
      ['pending', 'confirmed'].includes(booking.status) &&
      !contractBookingIds.has(booking.id)
    ) {
      tasks.push({
        title: 'Missing contract',
        description: `${bookingLabel} does not have a signed contract uploaded.`,
        status: 'open',
        priority: 'high',
        due_date: bookingDateKey || todayKey,
        entity_type: 'booking',
        entity_id: booking.id,
        source: 'generated:missing_contract',
        ...linkFields,
      })
    }

    if (isActiveBooking && bookingDate && bookingDate >= weekStart && bookingDate <= weekEnd) {
      tasks.push({
        title: 'Booking this week',
        description: `${bookingLabel} is scheduled this week.`,
        status: 'open',
        priority: 'normal',
        due_date: bookingDateKey,
        entity_type: 'booking',
        entity_id: booking.id,
        source: 'generated:booking_this_week',
        ...linkFields,
      })
    }

    if (isActiveBooking && bookingDateKey === tomorrowKey) {
      tasks.push({
        title: 'Booking tomorrow',
        description: `${bookingLabel} is scheduled tomorrow.`,
        status: 'open',
        priority: 'high',
        due_date: tomorrowKey,
        entity_type: 'booking',
        entity_id: booking.id,
        source: 'generated:booking_tomorrow',
        ...linkFields,
      })
    }

    if (isActiveBooking && bookingDate && bookingDate >= today) {
      const hasVenue = Boolean(booking.event?.location || booking.enquiries?.venue)
      const hasStartTime = Boolean(booking.event?.start_time)

      if (!hasVenue || !hasStartTime) {
        tasks.push({
          title: 'Missing venue or event time',
          description: `${bookingLabel} is missing ${!hasVenue && !hasStartTime ? 'venue and start time' : !hasVenue ? 'venue' : 'start time'}.`,
          status: 'open',
          priority: 'normal',
          due_date: bookingDateKey || todayKey,
          entity_type: 'booking',
          entity_id: booking.id,
          source: 'generated:missing_event_details',
          ...linkFields,
        })
      }
    }

    if (booking.status === 'completed' && bookingDate && bookingDate < today) {
      tasks.push({
        title: 'Follow up after completed event',
        description: `${bookingLabel} is completed. Send a thank-you or review follow-up.`,
        status: 'open',
        priority: 'normal',
        due_date: getDateKey(addDays(bookingDate, 1)),
        entity_type: 'booking',
        entity_id: booking.id,
        source: 'generated:completed_event_follow_up',
        ...linkFields,
      })
    }
  })

  payments.forEach((payment) => {
    if (payment.paid || !payment.due_date || !['deposit', 'balance'].includes(payment.type)) {
      return
    }

    const dueDate = parseDateOnly(payment.due_date)
    if (!dueDate || Number.isNaN(dueDate.getTime()) || dueDate >= today) return

    const invoice = invoiceById[payment.invoice_id] || null
    if (['paid', 'cancelled'].includes(invoice?.status)) return

    const source = payment.type === 'deposit'
      ? 'generated:deposit_overdue'
      : 'generated:balance_overdue'

    tasks.push({
      title: payment.type === 'deposit' ? 'Deposit overdue' : 'Balance overdue',
      description: `${payment.type === 'deposit' ? 'Deposit' : 'Balance'} payment is overdue${invoice?.invoice_number ? ` for ${invoice.invoice_number}` : ''}.`,
      status: 'open',
      priority: 'high',
      due_date: payment.due_date,
      entity_type: 'payment',
      entity_id: payment.id,
      booking_id: payment.booking_id || invoice?.booking_id || null,
      client_id: invoice?.client_id || null,
      invoice_id: payment.invoice_id,
      source,
    })
  })

  return tasks
}

export const refreshOperationalTasks = async () => {
  const userId = await getCurrentUserId()
  const [
    bookingsResponse,
    contractsResponse,
    invoicesResponse,
    paymentsResponse,
    existingTasksResponse,
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id,
        status,
        total_price,
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
      `)
      .eq('user_id', userId),
    supabase
      .from('booking_contracts')
      .select('id, booking_id')
      .eq('user_id', userId),
    supabase
      .from('invoices')
      .select('id, invoice_number, booking_id, client_id, status')
      .eq('user_id', userId),
    supabase
      .from('payments')
      .select('id, amount, type, paid, due_date, invoice_id, booking_id')
      .eq('user_id', userId),
    supabase
      .from('tasks')
      .select('id, source, entity_type, entity_id, status')
      .eq('user_id', userId)
      .in('source', generatedSources),
  ])

  const firstError = [
    bookingsResponse,
    contractsResponse,
    invoicesResponse,
    paymentsResponse,
    existingTasksResponse,
  ].find((response) => response.error)

  if (firstError?.error) throw firstError.error

  const eventsResponse = await supabase
    .from('events')
    .select('id, booking_id, start_time, end_time, location, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (eventsResponse.error) throw eventsResponse.error

  const eventsByBookingId = (eventsResponse.data || []).reduce((groupedEvents, event) => {
    if (!event.booking_id || groupedEvents[event.booking_id]) return groupedEvents

    return {
      ...groupedEvents,
      [event.booking_id]: event,
    }
  }, {})

  const bookings = (bookingsResponse.data || []).map((booking) => ({
    ...booking,
    event: eventsByBookingId[booking.id] || null,
  }))
  const generatedTasks = dedupeGeneratedTasks(buildGeneratedTasks({
    bookings,
    contracts: contractsResponse.data || [],
    invoices: invoicesResponse.data || [],
    payments: paymentsResponse.data || [],
  }))
  const generatedTaskKeys = new Set(generatedTasks.map(getTaskKey))
  const existingTasks = existingTasksResponse.data || []
  const existingTaskByKey = existingTasks.reduce((groupedTasks, task) => ({
    ...groupedTasks,
    [getTaskKey(task)]: task,
  }), {})

  const tasksToInsert = generatedTasks
    .filter((task) => !existingTaskByKey[getTaskKey(task)])
    .map((task) => ({ ...task, user_id: userId }))
  const tasksToUpdate = generatedTasks.filter((task) => {
    const existingTask = existingTaskByKey[getTaskKey(task)]

    return existingTask && existingTask.status !== 'completed'
  })
  const staleTaskIds = existingTasks
    .filter((task) => task.status === 'open' && !generatedTaskKeys.has(getTaskKey(task)))
    .map((task) => task.id)
  const staleCompletedTaskIds = existingTasks
    .filter((task) => task.status === 'completed' && !generatedTaskKeys.has(getTaskKey(task)))
    .map((task) => task.id)

  const updateOperations = tasksToUpdate.map((task) => {
    const existingTask = existingTaskByKey[getTaskKey(task)]

    return supabase
      .from('tasks')
      .update({
        ...task,
        user_id: userId,
        status: 'open',
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingTask.id)
      .eq('user_id', userId)
  })

  const operations = [...updateOperations]

  if (tasksToInsert.length) {
    operations.push(supabase.from('tasks').insert(tasksToInsert))
  }

  if (staleTaskIds.length) {
    operations.push(
      supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .in('id', staleTaskIds)
    )
  }

  if (staleCompletedTaskIds.length) {
    operations.push(
      supabase
        .from('tasks')
        .delete()
        .eq('user_id', userId)
        .in('id', staleCompletedTaskIds)
    )
  }

  const operationResponses = await Promise.all(operations)
  const operationError = operationResponses.find((response) => response.error)

  if (operationError?.error) throw operationError.error

  return {
    created: tasksToInsert.length,
    refreshed: tasksToUpdate.length,
    completed: staleTaskIds.length,
    cleared: staleCompletedTaskIds.length,
  }
}

export const fetchOpenTasks = async () => {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  return data || []
}

export const fetchTasks = async () => {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  return data || []
}

export const fetchTaskLinkOptions = async () => {
  const userId = await getCurrentUserId()

  const [customersResponse, enquiriesResponse, bookingsResponse, invoicesResponse] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, email, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('enquiries')
      .select(`
        id,
        event_type,
        event_date,
        client_id,
        clients (
          name
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(`
        id,
        enquiry_id,
        status,
        created_at,
        enquiries (
          event_type,
          event_date,
          client_id,
          clients (
            name
          )
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        client_id,
        booking_id,
        total,
        created_at,
        clients (
          name
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  const firstError = [
    customersResponse,
    enquiriesResponse,
    bookingsResponse,
    invoicesResponse,
  ].find((response) => response.error)

  if (firstError?.error) throw firstError.error

  return {
    customers: customersResponse.data || [],
    enquiries: enquiriesResponse.data || [],
    bookings: bookingsResponse.data || [],
    invoices: invoicesResponse.data || [],
  }
}

export const createManualTask = async ({
  title,
  description = '',
  priority = 'normal',
  dueDate = '',
  linkType = '',
  linkId = '',
  linkContext = null,
}) => {
  const userId = await getCurrentUserId()
  const payload = {
    title: title.trim(),
    description: description.trim() || null,
    status: 'open',
    priority,
    due_date: dueDate || null,
    source: 'manual',
    user_id: userId,
  }

  if (linkType && linkId) {
    payload.entity_type = linkType === 'customer' ? 'client' : linkType
    payload.entity_id = linkId
  }

  if (linkType === 'customer') {
    payload.client_id = linkId
  }

  if (linkType === 'enquiry') {
    payload.client_id = linkContext?.clientId || null
  }

  if (linkType === 'booking') {
    payload.booking_id = linkId
    payload.client_id = linkContext?.clientId || null
  }

  if (linkType === 'invoice') {
    payload.invoice_id = linkId
    payload.booking_id = linkContext?.bookingId || null
    payload.client_id = linkContext?.clientId || null
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([payload])
    .select()
    .single()

  if (error) throw error

  try {
    await logActivity({
      entityType: 'task',
      entityId: data.id,
      bookingId: data.booking_id,
      clientId: data.client_id,
      action: 'task_created',
      title: 'Task created',
      description: data.title || 'A manual task was created.',
      metadata: {
        task_id: data.id,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        invoice_id: data.invoice_id,
      },
    })
  } catch (activityLogError) {
    console.warn('Activity log failed:', activityLogError)
  }

  return data
}

export const fetchOpenTasksForRecord = async ({ field, id }) => {
  const userId = await getCurrentUserId()
  if (!field || !id) return []

  const allowedFields = ['booking_id', 'invoice_id', 'client_id']

  if (!allowedFields.includes(field)) {
    throw new Error('Unsupported task relation.')
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .eq(field, id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  return data || []
}

export const completeTask = async (taskId) => {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error

  await logActivity({
    entityType: 'task',
    entityId: data.id,
    bookingId: data.booking_id,
    clientId: data.client_id,
    action: 'task_completed',
    title: 'Task completed',
    description: data.title || 'A task was completed.',
    metadata: {
      task_id: data.id,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      invoice_id: data.invoice_id,
    },
  })

  return data
}

export const reopenTask = async (taskId) => {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: 'open',
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error

  return data
}
