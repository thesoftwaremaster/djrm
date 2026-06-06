import { supabase } from '../supabase'

export const defaultAppSettings = {
  business_name: '',
  display_name: '',
  contact_email: '',
  phone: '',
  website: '',
  address: '',
  invoice_prefix: 'INV',
  next_invoice_number: null,
  default_due_days: 14,
  currency: 'GBP',
  default_tax_rate: 0,
  payment_link_placeholder: '',
  default_deposit_percentage: 50,
  default_booking_status: 'pending',
  default_event_duration_hours: null,
  require_contract_by_default: true,
  bank_account_name: '',
  bank_name: '',
  bank_sort_code: '',
  bank_account_number: '',
  iban: '',
  bic_swift: '',
  payment_reference_instructions: '',
  payment_link_url: '',
  invoice_footer_text: '',
  invoice_thank_you_message: '',
}

export const isMissingSettingsSchemaError = (error) => {
  const message = error?.message || ''

  return (
    error?.code === '42P01' ||
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    error?.code === 'PGRST205' ||
    message.includes('app_settings') ||
    message.includes('Could not find the')
  )
}

export const normalizeAppSettings = (settings = {}) => ({
  ...defaultAppSettings,
  ...settings,
  invoice_prefix: settings.invoice_prefix || defaultAppSettings.invoice_prefix,
  default_due_days: Number(settings.default_due_days ?? defaultAppSettings.default_due_days),
  currency: settings.currency || defaultAppSettings.currency,
  default_tax_rate: Number(settings.default_tax_rate ?? defaultAppSettings.default_tax_rate),
  default_deposit_percentage: Number(
    settings.default_deposit_percentage ?? defaultAppSettings.default_deposit_percentage
  ),
  default_booking_status: settings.default_booking_status || defaultAppSettings.default_booking_status,
})

export const fetchAppSettings = async () => {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .maybeSingle()

  if (error) {
    if (isMissingSettingsSchemaError(error)) {
      return normalizeAppSettings()
    }

    throw error
  }

  return normalizeAppSettings(data || {})
}

export const getDateAfterDays = (days) => {
  const date = new Date()
  const safeDays = Number.isFinite(Number(days)) ? Number(days) : defaultAppSettings.default_due_days
  date.setDate(date.getDate() + safeDays)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export const createSettingsInvoiceNumber = (settings) => {
  const prefix = settings.invoice_prefix || defaultAppSettings.invoice_prefix
  const nextInvoiceNumber = Number(settings.next_invoice_number)

  if (Number.isFinite(nextInvoiceNumber) && nextInvoiceNumber > 0) {
    return `${prefix}-${nextInvoiceNumber}`
  }

  return `${prefix}-${Date.now()}`
}

export const getNextInvoiceNumberValue = (settings) => {
  const nextInvoiceNumber = Number(settings.next_invoice_number)

  return Number.isFinite(nextInvoiceNumber) && nextInvoiceNumber > 0
    ? nextInvoiceNumber
    : null
}

export const incrementSettingsInvoiceNumber = async (settings, usedInvoiceNumberValue = null) => {
  const nextInvoiceNumber = getNextInvoiceNumberValue(settings)

  if (!settings.id || !nextInvoiceNumber) return

  const nextValue = Math.max(
    nextInvoiceNumber,
    Number(usedInvoiceNumberValue) || nextInvoiceNumber
  ) + 1

  const { error } = await supabase
    .from('app_settings')
    .update({
      next_invoice_number: nextValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', settings.id)

  if (error) return
}

export const getPaymentDetailsLines = (settings) => [
  settings.payment_link_url ? `Payment link: ${settings.payment_link_url}` : '',
  settings.bank_name,
  settings.bank_account_name,
  settings.bank_sort_code ? `Sort code: ${settings.bank_sort_code}` : '',
  settings.bank_account_number ? `Account: ${settings.bank_account_number}` : '',
  settings.iban ? `IBAN: ${settings.iban}` : '',
  settings.bic_swift ? `BIC/SWIFT: ${settings.bic_swift}` : '',
  settings.payment_reference_instructions,
].filter(Boolean)

export const isMissingInvoiceCurrencyError = (error) => {
  const message = error?.message || ''

  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    message.includes('invoices.currency') ||
    message.includes("'currency' column") ||
    message.includes('Could not find the')
  )
}
