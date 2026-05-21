import { supabase } from '../supabase'
import { DEMO_USER_EMAIL, isDemoUser } from './demoMode'

const getDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const addDays = (date, days) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

const setTime = (date, hour, minute = 0) => {
  const nextDate = new Date(date)
  nextDate.setHours(hour, minute, 0, 0)
  return nextDate
}

const getWeekdayOffset = (targetDay) => {
  const today = new Date()
  const currentDay = today.getDay() || 7

  if (currentDay > targetDay) return 0

  return targetDay - currentDay
}

const demoCustomers = [
  {
    key: 'sarah',
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell.demo@djrm.co',
    phone: '07123 456 101',
  },
  {
    key: 'james',
    name: 'James Carter',
    email: 'james.carter.demo@djrm.co',
    phone: '07123 456 102',
  },
  {
    key: 'amelia',
    name: 'Amelia Brooks',
    email: 'amelia.brooks.demo@djrm.co',
    phone: '07123 456 103',
  },
  {
    key: 'oliver',
    name: 'Oliver Reed',
    email: 'oliver.reed.demo@djrm.co',
    phone: '07123 456 104',
  },
  {
    key: 'nina',
    name: 'Nina Patel',
    email: 'nina.patel.demo@djrm.co',
    phone: '07123 456 105',
  },
]

const getDemoPlan = () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = addDays(today, 1)
  const thisWeek = addDays(today, getWeekdayOffset(6))
  const future = addDays(today, 21)
  const laterFuture = addDays(today, 42)
  const past = addDays(today, -10)

  return [
    {
      key: 'wedding-this-week',
      customerKey: 'sarah',
      eventType: 'Wedding',
      eventDate: getDateKey(thisWeek),
      venue: 'The Glasshouse, Manchester',
      status: 'booked',
      bookingStatus: 'confirmed',
      totalPrice: 1450,
      eventStart: setTime(thisWeek, 18, 30).toISOString(),
      eventEnd: setTime(addDays(thisWeek, 1), 0, 30).toISOString(),
      invoiceNumber: 'DEMO-1001',
      invoiceStatus: 'sent',
      invoiceTotal: 1450,
      invoiceDueDate: getDateKey(addDays(today, 14)),
    },
    {
      key: 'birthday-tomorrow',
      customerKey: 'james',
      eventType: 'Birthday Party',
      eventDate: getDateKey(tomorrow),
      venue: 'The Loft Social Club',
      status: 'booked',
      bookingStatus: 'confirmed',
      totalPrice: 650,
      eventStart: setTime(tomorrow, 19, 0).toISOString(),
      eventEnd: setTime(tomorrow, 23, 30).toISOString(),
      invoiceNumber: 'DEMO-1002',
      invoiceStatus: 'overdue',
      invoiceTotal: 650,
      invoiceDueDate: getDateKey(addDays(today, -3)),
      overdueDeposit: true,
    },
    {
      key: 'corporate-future',
      customerKey: 'amelia',
      eventType: 'Corporate Event',
      eventDate: getDateKey(future),
      venue: 'Northbank Hotel',
      status: 'booked',
      bookingStatus: 'pending',
      totalPrice: 950,
      eventStart: setTime(future, 17, 0).toISOString(),
      eventEnd: setTime(future, 22, 0).toISOString(),
      invoiceNumber: 'DEMO-1003',
      invoiceStatus: 'draft',
      invoiceTotal: 950,
      invoiceDueDate: getDateKey(addDays(today, 21)),
    },
    {
      key: 'engagement-future',
      customerKey: 'oliver',
      eventType: 'Engagement Party',
      eventDate: getDateKey(laterFuture),
      venue: '',
      status: 'booked',
      bookingStatus: 'pending',
      totalPrice: 800,
      eventStart: '',
      eventEnd: '',
      invoiceNumber: 'DEMO-1004',
      invoiceStatus: 'sent',
      invoiceTotal: 800,
      invoiceDueDate: getDateKey(addDays(today, 30)),
    },
    {
      key: 'past-completed',
      customerKey: 'nina',
      eventType: 'Anniversary',
      eventDate: getDateKey(past),
      venue: 'Riverside Hall',
      status: 'booked',
      bookingStatus: 'completed',
      totalPrice: 700,
      eventStart: setTime(past, 18, 0).toISOString(),
      eventEnd: setTime(past, 23, 0).toISOString(),
      invoiceNumber: null,
    },
    {
      key: 'new-enquiry',
      customerKey: 'nina',
      eventType: 'School Prom',
      eventDate: getDateKey(addDays(today, 65)),
      venue: 'Oakfield Academy',
      status: 'quoted',
      bookingStatus: null,
      totalPrice: null,
      invoiceNumber: null,
    },
  ]
}

const upsertDemoSettings = async (user) => {
  const { data: existingSettings, error: settingsLookupError } = await supabase
    .from('app_settings')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (settingsLookupError) throw settingsLookupError

  const settingsPayload = {
    user_id: user.id,
    business_name: 'DJ RM Demo Events',
    display_name: 'DJ RM Demo',
    contact_email: DEMO_USER_EMAIL,
    phone: '020 7946 0100',
    website: 'https://djrm.co',
    address: 'Demo Studio, London, UK',
    invoice_prefix: 'DEMO',
    next_invoice_number: 1005,
    default_due_days: 14,
    currency: 'GBP',
    default_tax_rate: 0,
    payment_link_placeholder: 'Demo payment link',
    default_deposit_percentage: 50,
    default_booking_status: 'pending',
    default_event_duration_hours: 5,
    require_contract_by_default: true,
    bank_account_name: 'DJ RM Demo Events',
    bank_name: 'Demo Bank',
    bank_sort_code: '00-00-00',
    bank_account_number: '00000000',
    payment_reference_instructions: 'Use the invoice number as your payment reference.',
    payment_link_url: 'https://djrm.co/demo-pay',
    updated_at: new Date().toISOString(),
  }

  const query = existingSettings?.id
    ? supabase.from('app_settings').update(settingsPayload).eq('id', existingSettings.id)
    : supabase.from('app_settings').insert([settingsPayload])

  const { error } = await query
  if (error) throw error
}

const ensureCustomers = async (userId) => {
  const emails = demoCustomers.map((customer) => customer.email)
  const { data: existingCustomers, error: lookupError } = await supabase
    .from('clients')
    .select('id, email')
    .eq('user_id', userId)
    .in('email', emails)

  if (lookupError) throw lookupError

  const existingByEmail = new Map((existingCustomers || []).map((customer) => [customer.email, customer]))
  const customersToInsert = demoCustomers.filter((customer) => !existingByEmail.has(customer.email))

  if (customersToInsert.length) {
    const insertPayload = customersToInsert.map((customer) => ({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      user_id: userId,
    }))

    const { data: insertedCustomers, error: insertError } = await supabase
      .from('clients')
      .insert(insertPayload)
      .select('id, email')

    if (insertError) throw insertError

    ;(insertedCustomers || []).forEach((customer) => existingByEmail.set(customer.email, customer))
  }

  return demoCustomers.reduce((customersByKey, customer) => ({
    ...customersByKey,
    [customer.key]: existingByEmail.get(customer.email),
  }), {})
}

const ensureEnquiriesAndBookings = async (customersByKey, plan, userId) => {
  const { data: existingEnquiries, error: enquiryLookupError } = await supabase
    .from('enquiries')
    .select('id, client_id, event_type')
    .eq('user_id', userId)
    .in('client_id', Object.values(customersByKey).map((customer) => customer.id))

  if (enquiryLookupError) throw enquiryLookupError

  const enquiriesByKey = {}

  for (const item of plan) {
    const customer = customersByKey[item.customerKey]
    const existingEnquiry = (existingEnquiries || []).find((enquiry) => (
      enquiry.client_id === customer.id && enquiry.event_type === item.eventType
    ))

    if (existingEnquiry) {
      enquiriesByKey[item.key] = existingEnquiry
      continue
    }

    const { data: enquiry, error } = await supabase
      .from('enquiries')
      .insert([
        {
          client_id: customer.id,
          user_id: userId,
          event_type: item.eventType,
          event_date: item.eventDate,
          venue: item.venue || null,
          status: item.status,
          notes: 'Demo enquiry for tester walkthrough.',
        },
      ])
      .select('id, client_id, event_type')
      .single()

    if (error) throw error
    enquiriesByKey[item.key] = enquiry
  }

  const { data: existingBookings, error: bookingLookupError } = await supabase
    .from('bookings')
    .select('id, enquiry_id')
    .eq('user_id', userId)
    .in('enquiry_id', Object.values(enquiriesByKey).map((enquiry) => enquiry.id))

  if (bookingLookupError) throw bookingLookupError

  const bookingsByKey = {}

  for (const item of plan.filter((planItem) => planItem.bookingStatus)) {
    const enquiry = enquiriesByKey[item.key]
    const existingBooking = (existingBookings || []).find((booking) => booking.enquiry_id === enquiry.id)

    if (existingBooking) {
      bookingsByKey[item.key] = existingBooking
      continue
    }

    const { data: booking, error } = await supabase
      .from('bookings')
      .insert([
        {
          enquiry_id: enquiry.id,
          user_id: userId,
          status: item.bookingStatus,
          total_price: item.totalPrice,
        },
      ])
      .select('id, enquiry_id')
      .single()

    if (error) throw error
    bookingsByKey[item.key] = booking
  }

  return { enquiriesByKey, bookingsByKey }
}

const ensureEvents = async (bookingsByKey, plan, userId) => {
  const bookingIds = Object.values(bookingsByKey).map((booking) => booking.id)
  if (!bookingIds.length) return

  const { data: existingEvents, error: eventLookupError } = await supabase
    .from('events')
    .select('id, booking_id')
    .eq('user_id', userId)
    .in('booking_id', bookingIds)

  if (eventLookupError) throw eventLookupError

  const existingEventBookingIds = new Set((existingEvents || []).map((event) => event.booking_id))
  const eventsToInsert = plan
    .filter((item) => bookingsByKey[item.key] && !existingEventBookingIds.has(bookingsByKey[item.key].id))
    .map((item) => ({
      booking_id: bookingsByKey[item.key].id,
      user_id: userId,
      location: item.venue || null,
      start_time: item.eventStart || null,
      end_time: item.eventEnd || null,
      notes: `${item.eventType} demo event`,
    }))

  if (!eventsToInsert.length) return

  const { error } = await supabase.from('events').insert(eventsToInsert)
  if (error) throw error
}

const ensureInvoices = async (customersByKey, bookingsByKey, plan, userId) => {
  const invoiceNumbers = plan.map((item) => item.invoiceNumber).filter(Boolean)
  const { data: existingInvoices, error: invoiceLookupError } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .eq('user_id', userId)
    .in('invoice_number', invoiceNumbers)

  if (invoiceLookupError) throw invoiceLookupError

  const invoicesByNumber = new Map((existingInvoices || []).map((invoice) => [invoice.invoice_number, invoice]))
  const invoicesByKey = {}

  for (const item of plan.filter((planItem) => planItem.invoiceNumber)) {
    if (invoicesByNumber.has(item.invoiceNumber)) {
      invoicesByKey[item.key] = invoicesByNumber.get(item.invoiceNumber)
      continue
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([
        {
          client_id: customersByKey[item.customerKey].id,
          user_id: userId,
          booking_id: bookingsByKey[item.key]?.id || null,
          invoice_number: item.invoiceNumber,
          status: item.invoiceStatus,
          subtotal: item.invoiceTotal,
          tax: 0,
          total: item.invoiceTotal,
          currency: 'GBP',
          due_date: item.invoiceDueDate,
          notes: 'Demo invoice.',
        },
      ])
      .select('id, invoice_number')
      .single()

    if (invoiceError) throw invoiceError

    const { error: itemError } = await supabase
      .from('invoice_items')
      .insert([
        {
          invoice_id: invoice.id,
          user_id: userId,
          description: `${item.eventType} DJ performance package`,
          quantity: 1,
          unit_price: item.invoiceTotal,
          line_total: item.invoiceTotal,
        },
      ])

    if (itemError) throw itemError

    invoicesByKey[item.key] = invoice
  }

  return invoicesByKey
}

const ensurePayments = async (bookingsByKey, invoicesByKey, plan, userId) => {
  const invoiceIds = Object.values(invoicesByKey).map((invoice) => invoice.id)
  if (!invoiceIds.length) return

  const { data: existingPayments, error: paymentLookupError } = await supabase
    .from('payments')
    .select('id, invoice_id')
    .eq('user_id', userId)
    .in('invoice_id', invoiceIds)

  if (paymentLookupError) throw paymentLookupError

  const invoiceIdsWithPayments = new Set((existingPayments || []).map((payment) => payment.invoice_id))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const paymentsToInsert = plan
    .filter((item) => invoicesByKey[item.key] && !invoiceIdsWithPayments.has(invoicesByKey[item.key].id))
    .flatMap((item) => {
      const invoice = invoicesByKey[item.key]
      const booking = bookingsByKey[item.key]
      const depositAmount = Math.round(Number(item.invoiceTotal) * 50) / 100
      const balanceAmount = Number(item.invoiceTotal) - depositAmount

      return [
        {
          invoice_id: invoice.id,
          user_id: userId,
          booking_id: booking?.id || null,
          amount: depositAmount,
          type: 'deposit',
          paid: item.overdueDeposit ? false : true,
          due_date: item.overdueDeposit ? getDateKey(addDays(today, -3)) : getDateKey(today),
        },
        {
          invoice_id: invoice.id,
          user_id: userId,
          booking_id: booking?.id || null,
          amount: balanceAmount,
          type: 'balance',
          paid: false,
          due_date: item.invoiceDueDate,
        },
      ]
    })

  if (!paymentsToInsert.length) return

  const { error } = await supabase.from('payments').insert(paymentsToInsert)
  if (error) throw error
}

const ensureTasks = async (customersByKey, bookingsByKey, invoicesByKey, plan, userId) => {
  const taskPayloads = [
    {
      itemKey: 'engagement-future',
      title: 'Missing venue or event time',
      description: 'Confirm the venue and start time before sending final details.',
      priority: 'normal',
      due_date: plan.find((item) => item.key === 'engagement-future')?.eventDate,
      source: 'demo:missing_event_details',
      entity_type: 'booking',
    },
    {
      itemKey: 'birthday-tomorrow',
      title: 'Deposit overdue',
      description: 'Demo overdue deposit to test payment chasing.',
      priority: 'high',
      due_date: getDateKey(addDays(new Date(), -3)),
      source: 'demo:deposit_overdue',
      entity_type: 'payment',
    },
    {
      itemKey: 'wedding-this-week',
      title: 'Booking this week',
      description: 'Review final timings and setup notes.',
      priority: 'normal',
      due_date: plan.find((item) => item.key === 'wedding-this-week')?.eventDate,
      source: 'demo:booking_this_week',
      entity_type: 'booking',
    },
    {
      itemKey: 'birthday-tomorrow',
      title: 'Booking tomorrow',
      description: 'Send a final confirmation message to the client.',
      priority: 'high',
      due_date: plan.find((item) => item.key === 'birthday-tomorrow')?.eventDate,
      source: 'demo:booking_tomorrow',
      entity_type: 'booking',
    },
    {
      itemKey: 'past-completed',
      title: 'Follow up after completed event',
      description: 'Send a thank-you message and request a review.',
      priority: 'normal',
      due_date: getDateKey(addDays(new Date(), -1)),
      source: 'demo:completed_event_follow_up',
      entity_type: 'booking',
    },
  ]

  const { data: existingTasks, error: taskLookupError } = await supabase
    .from('tasks')
    .select('id, source, entity_type, entity_id')
    .eq('user_id', userId)
    .like('source', 'demo:%')

  if (taskLookupError) throw taskLookupError

  const existingTaskKeys = new Set((existingTasks || []).map((task) => (
    `${task.source}|${task.entity_type}|${task.entity_id}`
  )))
  const tasksToInsert = taskPayloads
    .map((task) => {
      const planItem = plan.find((item) => item.key === task.itemKey)
      const booking = bookingsByKey[task.itemKey]
      const invoice = invoicesByKey[task.itemKey]

      return {
        title: task.title,
        user_id: userId,
        description: task.description,
        status: 'open',
        priority: task.priority,
        due_date: task.due_date,
        entity_type: task.entity_type,
        entity_id: task.entity_type === 'payment' ? invoice?.id : booking?.id,
        booking_id: booking?.id || null,
        client_id: customersByKey[planItem.customerKey]?.id || null,
        invoice_id: invoice?.id || null,
        source: task.source,
      }
    })
    .filter((task) => task.entity_id && !existingTaskKeys.has(`${task.source}|${task.entity_type}|${task.entity_id}`))

  if (!tasksToInsert.length) return

  const { error } = await supabase.from('tasks').insert(tasksToInsert)
  if (error) throw error
}

export const ensureDemoSeedData = async (user) => {
  if (!isDemoUser(user)) return { seeded: false }

  const plan = getDemoPlan()

  await upsertDemoSettings(user)
  const customersByKey = await ensureCustomers(user.id)
  const { bookingsByKey } = await ensureEnquiriesAndBookings(customersByKey, plan, user.id)
  await ensureEvents(bookingsByKey, plan, user.id)
  const invoicesByKey = await ensureInvoices(customersByKey, bookingsByKey, plan, user.id)
  await ensurePayments(bookingsByKey, invoicesByKey, plan, user.id)
  await ensureTasks(customersByKey, bookingsByKey, invoicesByKey, plan, user.id)

  return { seeded: true }
}
