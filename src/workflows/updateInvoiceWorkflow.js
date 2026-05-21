import { supabase } from '../supabase.js'

const lockedInvoiceStatuses = ['paid', 'cancelled']

const normalizeEditableItem = (item = {}) => {
  const quantity = Number(item.quantity)
  const unitPrice = Number(item.unit_price)
  const lineTotal = quantity * unitPrice

  return {
    id: item.id || null,
    description: String(item.description || '').trim(),
    quantity,
    unit_price: unitPrice,
    line_total: Number.isFinite(lineTotal) ? lineTotal : 0,
  }
}

export const calculateInvoiceTotals = ({ items = [], tax = 0 }) => {
  const subtotal = items.reduce((total, item) => {
    const normalizedItem = normalizeEditableItem(item)
    return total + normalizedItem.line_total
  }, 0)

  const normalizedTax = Number(tax || 0)
  const safeTax = Number.isFinite(normalizedTax) ? normalizedTax : 0

  return {
    subtotal,
    tax: safeTax,
    total: subtotal + safeTax,
  }
}

export const updateInvoiceDetails = async ({
  invoiceId,
  currentStatus,
  dueDate = '',
  notes = '',
  tax = 0,
  items = [],
}) => {
  if (!invoiceId) {
    throw new Error('Invoice ID is required.')
  }

  if (lockedInvoiceStatuses.includes(currentStatus)) {
    throw new Error(`${currentStatus === 'paid' ? 'Paid' : 'Cancelled'} invoices cannot be edited.`)
  }

  const normalizedItems = items.map((item) => normalizeEditableItem(item))

  if (!normalizedItems.length) {
    throw new Error('At least one invoice item is required.')
  }

  normalizedItems.forEach((item) => {
    if (!item.description) {
      throw new Error('Each invoice item needs a description.')
    }

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error('Each invoice item quantity must be greater than 0.')
    }

    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) {
      throw new Error('Each invoice item unit price must be 0 or more.')
    }
  })

  const totals = calculateInvoiceTotals({
    items: normalizedItems,
    tax,
  })

  if (
    !Number.isFinite(totals.subtotal) ||
    !Number.isFinite(totals.tax) ||
    !Number.isFinite(totals.total)
  ) {
    throw new Error('Invoice totals could not be calculated.')
  }

  const invoicePayload = {
    due_date: dueDate || null,
    notes: notes.trim() || null,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
  }

  const { data: updatedInvoice, error: invoiceError } = await supabase
    .from('invoices')
    .update(invoicePayload)
    .eq('id', invoiceId)
    .not('status', 'in', '("paid","cancelled")')
    .select('id')
    .maybeSingle()

  if (invoiceError) throw invoiceError

  if (!updatedInvoice) {
    throw new Error('This invoice can no longer be edited.')
  }

  for (const item of normalizedItems) {
    if (!item.id) {
      const { error: insertItemError } = await supabase
        .from('invoice_items')
        .insert([
          {
            invoice_id: invoiceId,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            line_total: item.line_total,
          },
        ])

      if (insertItemError) throw insertItemError
      continue
    }

    const { data: updatedItem, error: itemError } = await supabase
      .from('invoice_items')
      .update({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
      })
      .eq('id', item.id)
      .eq('invoice_id', invoiceId)
      .select('id')
      .maybeSingle()

    if (itemError) throw itemError

    if (!updatedItem) {
      throw new Error('One or more invoice items could not be updated.')
    }
  }

  return totals
}
