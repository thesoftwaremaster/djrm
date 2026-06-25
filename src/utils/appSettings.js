import { supabase } from '../supabase'

export const defaultAppSettings = {
  business_name: '',
  display_name: '',
  contact_name: '',
  contact_email: '',
  phone: '',
  website: '',
  address: '',
  business_description: '',
  invoice_prefix: 'INV',
  next_invoice_number: null,
  default_due_days: 7,
  payment_terms_days: 7,
  currency: 'GBP',
  default_tax_rate: 0,
  tax_enabled: false,
  tax_rate: 0,
  payment_link_placeholder: '',
  default_deposit_percentage: 50,
  default_booking_status: 'pending',
  default_event_duration_hours: null,
  default_event_duration: 5,
  default_setup_time: 1,
  default_travel_fee: 0,
  cancellation_policy: '',
  default_terms: '',
  require_contract_by_default: true,
  bank_account_name: '',
  bank_name: '',
  bank_sort_code: '',
  bank_account_number: '',
  iban: '',
  bic_swift: '',
  bank_details: '',
  payment_instructions: '',
  payment_reference_instructions: '',
  payment_link_url: '',
  invoice_footer_text: '',
  invoice_footer_note: '',
  invoice_thank_you_message: '',
  email_reminders_enabled: true,
  payment_reminder_days: 3,
  event_reminder_days: 7,
  follow_up_reminder_days: 2,
  weekly_summary_enabled: false,
  accent_colour: '#111827',
  dark_mode_enabled: false,
  pdf_style: 'Modern',
  full_name: '',
  timezone: 'Europe/London',
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
  default_due_days: Number(
    settings.default_due_days ?? settings.payment_terms_days ?? defaultAppSettings.default_due_days
  ),
  payment_terms_days: Number(
    settings.payment_terms_days ?? settings.default_due_days ?? defaultAppSettings.payment_terms_days
  ),
  currency: settings.currency || defaultAppSettings.currency,
  default_tax_rate: Number(
    settings.default_tax_rate ?? settings.tax_rate ?? defaultAppSettings.default_tax_rate
  ),
  tax_enabled: Boolean(settings.tax_enabled ?? defaultAppSettings.tax_enabled),
  tax_rate: Number(settings.tax_rate ?? settings.default_tax_rate ?? defaultAppSettings.tax_rate),
  default_deposit_percentage: Number(
    settings.default_deposit_percentage ?? defaultAppSettings.default_deposit_percentage
  ),
  default_booking_status: settings.default_booking_status || defaultAppSettings.default_booking_status,
  default_event_duration_hours: Number(
    settings.default_event_duration_hours ??
      settings.default_event_duration ??
      defaultAppSettings.default_event_duration_hours
  ),
  default_event_duration: Number(
    settings.default_event_duration ??
      settings.default_event_duration_hours ??
      defaultAppSettings.default_event_duration
  ),
  default_setup_time: Number(settings.default_setup_time ?? defaultAppSettings.default_setup_time),
  default_travel_fee: Number(settings.default_travel_fee ?? defaultAppSettings.default_travel_fee),
  bank_details: settings.bank_details || getPaymentDetailsLines(settings).join('\n'),
  payment_instructions: settings.payment_instructions || settings.payment_reference_instructions || '',
  invoice_footer_note: settings.invoice_footer_note || settings.invoice_footer_text || '',
  email_reminders_enabled: Boolean(
    settings.email_reminders_enabled ?? defaultAppSettings.email_reminders_enabled
  ),
  payment_reminder_days: Number(
    settings.payment_reminder_days ?? defaultAppSettings.payment_reminder_days
  ),
  event_reminder_days: Number(settings.event_reminder_days ?? defaultAppSettings.event_reminder_days),
  follow_up_reminder_days: Number(
    settings.follow_up_reminder_days ?? defaultAppSettings.follow_up_reminder_days
  ),
  weekly_summary_enabled: Boolean(
    settings.weekly_summary_enabled ?? defaultAppSettings.weekly_summary_enabled
  ),
  accent_colour: settings.accent_colour || defaultAppSettings.accent_colour,
  pdf_style: settings.pdf_style || defaultAppSettings.pdf_style,
  timezone: settings.timezone || defaultAppSettings.timezone,
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
  settings.bank_details,
  settings.bank_name,
  settings.bank_account_name,
  settings.bank_sort_code ? `Sort code: ${settings.bank_sort_code}` : '',
  settings.bank_account_number ? `Account: ${settings.bank_account_number}` : '',
  settings.iban ? `IBAN: ${settings.iban}` : '',
  settings.bic_swift ? `BIC/SWIFT: ${settings.bic_swift}` : '',
  settings.payment_instructions,
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
