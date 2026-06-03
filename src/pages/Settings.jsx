import { useEffect, useState } from 'react'
import { Save, Settings as SettingsIcon } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/useAuth'
import { isMissingSettingsSchemaError } from '../utils/appSettings'
import { isValidEmail, isValidHttpUrl } from '../utils/validation'

const defaultSettings = {
  business_name: '',
  display_name: '',
  contact_email: '',
  phone: '',
  website: '',
  address: '',
  invoice_prefix: 'INV',
  next_invoice_number: '',
  default_due_days: 14,
  currency: 'GBP',
  default_tax_rate: 0,
  payment_link_placeholder: '',
  default_deposit_percentage: 50,
  default_booking_status: 'pending',
  default_event_duration_hours: '',
  require_contract_by_default: true,
  bank_account_name: '',
  bank_name: '',
  bank_sort_code: '',
  bank_account_number: '',
  iban: '',
  bic_swift: '',
  payment_reference_instructions: '',
  payment_link_url: '',
}

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsedValue = Number(value)

  return Number.isNaN(parsedValue) ? null : parsedValue
}

const integerOrNull = (value) => {
  const parsedValue = numberOrNull(value)

  return parsedValue === null ? null : Math.trunc(parsedValue)
}

const normalizeSettings = (settings) => ({
  ...defaultSettings,
  ...settings,
  next_invoice_number: settings?.next_invoice_number ?? '',
  default_event_duration_hours: settings?.default_event_duration_hours ?? '',
})

const Field = ({ label, children }) => (
  <label className="block min-w-0 text-left">
    <span className="text-xs font-medium text-text-secondary">{label}</span>
    <div className="mt-1.5">{children}</div>
  </label>
)

const Section = ({ title, description, children }) => (
  <section className="rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5">
    <div className="mb-5 text-left">
      <h2 className="text-lg font-semibold tracking-tight text-text-primary">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-text-secondary">
        {description}
      </p>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {children}
    </div>
  </section>
)

const Settings = () => {
  const { user } = useAuth()
  const [settingsId, setSettingsId] = useState(null)
  const [formValues, setFormValues] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const fetchSettings = async () => {
      if (!user?.id) return

      setLoading(true)
      setError('')

      const { data, error: fetchError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!isMounted) return

      if (fetchError) {
        console.error(fetchError)
        setError(
          isMissingSettingsSchemaError(fetchError)
            ? 'Settings storage is not available yet. Apply the latest Supabase migrations, then reload this page.'
            : 'Could not load settings.'
        )
        setLoading(false)
        return
      }

      setSettingsId(data?.id || null)
      setFormValues(normalizeSettings(data || {}))
      setLoading(false)
    }

    void fetchSettings()

    return () => {
      isMounted = false
    }
  }, [user?.id])

  const inputClass =
    'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted'

  const textareaClass =
    'min-h-[84px] w-full rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted'

  const updateField = (field, value) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
    setSuccessMessage('')
  }

  const buildPayload = () => ({
    user_id: user.id,
    business_name: formValues.business_name.trim() || null,
    display_name: formValues.display_name.trim() || null,
    contact_email: formValues.contact_email.trim() || null,
    phone: formValues.phone.trim() || null,
    website: formValues.website.trim() || null,
    address: formValues.address.trim() || null,
    invoice_prefix: formValues.invoice_prefix.trim() || 'INV',
    next_invoice_number: integerOrNull(formValues.next_invoice_number),
    default_due_days: integerOrNull(formValues.default_due_days) ?? 14,
    currency: formValues.currency.trim() || 'GBP',
    default_tax_rate: numberOrNull(formValues.default_tax_rate) ?? 0,
    payment_link_placeholder: formValues.payment_link_placeholder.trim() || null,
    default_deposit_percentage: numberOrNull(formValues.default_deposit_percentage) ?? 50,
    default_booking_status: formValues.default_booking_status || 'pending',
    default_event_duration_hours: numberOrNull(formValues.default_event_duration_hours),
    require_contract_by_default: Boolean(formValues.require_contract_by_default),
    bank_account_name: formValues.bank_account_name.trim() || null,
    bank_name: formValues.bank_name.trim() || null,
    bank_sort_code: formValues.bank_sort_code.trim() || null,
    bank_account_number: formValues.bank_account_number.trim() || null,
    iban: formValues.iban.trim() || null,
    bic_swift: formValues.bic_swift.trim() || null,
    payment_reference_instructions: formValues.payment_reference_instructions.trim() || null,
    payment_link_url: formValues.payment_link_url.trim() || null,
    updated_at: new Date().toISOString(),
  })

  const validateSettings = () => {
    if (formValues.contact_email.trim() && !isValidEmail(formValues.contact_email)) {
      return 'Enter a valid contact email address.'
    }

    const nextInvoiceNumber = integerOrNull(formValues.next_invoice_number)
    if (formValues.next_invoice_number !== '' && (!nextInvoiceNumber || nextInvoiceNumber < 1)) {
      return 'Next invoice number must be a positive whole number.'
    }

    const dueDays = integerOrNull(formValues.default_due_days)
    if (dueDays === null || dueDays < 0) {
      return 'Default due days must be 0 or more.'
    }

    const taxRate = numberOrNull(formValues.default_tax_rate)
    if (taxRate === null || taxRate < 0 || taxRate > 100) {
      return 'Default tax rate must be between 0 and 100.'
    }

    const depositPercentage = numberOrNull(formValues.default_deposit_percentage)
    if (depositPercentage === null || depositPercentage < 0 || depositPercentage > 100) {
      return 'Default deposit percentage must be between 0 and 100.'
    }

    const eventDuration = numberOrNull(formValues.default_event_duration_hours)
    if (formValues.default_event_duration_hours !== '' && (!eventDuration || eventDuration <= 0)) {
      return 'Default event duration must be greater than 0 hours.'
    }

    if (formValues.payment_link_url.trim() && !isValidHttpUrl(formValues.payment_link_url)) {
      return 'Payment link URL must start with http:// or https://.'
    }

    return ''
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (submitting || !user?.id) return

    const validationError = validateSettings()
    if (validationError) {
      setError(validationError)
      setSuccessMessage('')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccessMessage('')

    try {
      const payload = buildPayload()
      const query = settingsId
        ? supabase
            .from('app_settings')
            .update(payload)
            .eq('id', settingsId)
            .eq('user_id', user.id)
            .select()
            .single()
        : supabase
            .from('app_settings')
            .insert([payload])
            .select()
            .single()

      const { data, error: saveError } = await query

      if (saveError) throw saveError

      setSettingsId(data.id)
      setFormValues(normalizeSettings(data))
      setSuccessMessage('Settings saved successfully.')
    } catch (saveError) {
      console.error(saveError)
      setError(
        isMissingSettingsSchemaError(saveError)
          ? 'Settings storage is not available yet. Apply the latest Supabase migrations, then try again.'
          : saveError.message || 'Could not save settings.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = loading || submitting

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Workspace
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Settings
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            Store business and workflow defaults for invoices and bookings.
          </p>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface text-text-secondary shadow-[0_4px_14px_rgba(15,23,42,0.025)]">
          <SettingsIcon className="h-5 w-5" />
        </div>
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <Section
          title="Business profile"
          description="Details used as the CRM source of truth for customer-facing documents."
        >
          <Field label="Business name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.business_name}
              onChange={(event) => updateField('business_name', event.target.value)}
            />
          </Field>

          <Field label="Display name / DJ name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.display_name}
              onChange={(event) => updateField('display_name', event.target.value)}
            />
          </Field>

          <Field label="Contact email">
            <input
              type="email"
              className={inputClass}
              disabled={disabled}
              value={formValues.contact_email}
              onChange={(event) => updateField('contact_email', event.target.value)}
            />
          </Field>

          <Field label="Phone">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.phone}
              onChange={(event) => updateField('phone', event.target.value)}
            />
          </Field>

          <Field label="Website">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.website}
              onChange={(event) => updateField('website', event.target.value)}
            />
          </Field>

          <Field label="Address">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formValues.address}
              onChange={(event) => updateField('address', event.target.value)}
            />
          </Field>
        </Section>

        <Section
          title="Invoice defaults"
          description="Defaults to store for invoice numbering, payment terms, tax, and currency."
        >
          <Field label="Invoice prefix">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.invoice_prefix}
              onChange={(event) => updateField('invoice_prefix', event.target.value)}
            />
          </Field>

          <Field label="Next invoice number">
            <input
              type="number"
              min="1"
              className={inputClass}
              disabled={disabled}
              value={formValues.next_invoice_number}
              onChange={(event) => updateField('next_invoice_number', event.target.value)}
            />
          </Field>

          <Field label="Default due days">
            <input
              type="number"
              min="0"
              className={inputClass}
              disabled={disabled}
              value={formValues.default_due_days}
              onChange={(event) => updateField('default_due_days', event.target.value)}
            />
          </Field>

          <Field label="Currency">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.currency}
              onChange={(event) => updateField('currency', event.target.value.toUpperCase())}
            />
          </Field>

          <Field label="Default tax rate">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              disabled={disabled}
              value={formValues.default_tax_rate}
              onChange={(event) => updateField('default_tax_rate', event.target.value)}
            />
          </Field>

          <Field label="Payment link placeholder">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.payment_link_placeholder}
              onChange={(event) => updateField('payment_link_placeholder', event.target.value)}
            />
          </Field>
        </Section>

        <Section
          title="Booking defaults"
          description="Operational defaults to keep future booking setup consistent."
        >
          <Field label="Default deposit percentage">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              disabled={disabled}
              value={formValues.default_deposit_percentage}
              onChange={(event) => updateField('default_deposit_percentage', event.target.value)}
            />
          </Field>

          <Field label="Default booking status">
            <select
              className={inputClass}
              disabled={disabled}
              value={formValues.default_booking_status}
              onChange={(event) => updateField('default_booking_status', event.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </Field>

          <Field label="Default event duration hours">
            <input
              type="number"
              min="0"
              step="0.25"
              className={inputClass}
              disabled={disabled}
              value={formValues.default_event_duration_hours}
              onChange={(event) => updateField('default_event_duration_hours', event.target.value)}
            />
          </Field>

          <div className="flex min-h-11 items-center rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3">
            <label className="flex min-w-0 items-center gap-3 text-left">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-soft accent-accent-primary"
                disabled={disabled}
                checked={formValues.require_contract_by_default}
                onChange={(event) => updateField('require_contract_by_default', event.target.checked)}
              />
              <span>
                <span className="block text-sm font-medium text-text-primary">
                  Require contract by default
                </span>
                <span className="block text-xs text-text-secondary">
                  Store this preference for future booking workflows.
                </span>
              </span>
            </label>
          </div>
        </Section>

        <Section
          title="Bank/payment details"
          description="Sensitive payment details stored for authenticated CRM use only."
        >
          <Field label="Bank account name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.bank_account_name}
              onChange={(event) => updateField('bank_account_name', event.target.value)}
            />
          </Field>

          <Field label="Bank name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.bank_name}
              onChange={(event) => updateField('bank_name', event.target.value)}
            />
          </Field>

          <Field label="Sort code">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.bank_sort_code}
              onChange={(event) => updateField('bank_sort_code', event.target.value)}
            />
          </Field>

          <Field label="Account number">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.bank_account_number}
              onChange={(event) => updateField('bank_account_number', event.target.value)}
            />
          </Field>

          <Field label="IBAN">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.iban}
              onChange={(event) => updateField('iban', event.target.value)}
            />
          </Field>

          <Field label="BIC / SWIFT">
            <input
              className={inputClass}
              disabled={disabled}
              value={formValues.bic_swift}
              onChange={(event) => updateField('bic_swift', event.target.value)}
            />
          </Field>

          <Field label="Payment reference instructions">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formValues.payment_reference_instructions}
              onChange={(event) => updateField('payment_reference_instructions', event.target.value)}
            />
          </Field>

          <Field label="Payment link URL">
            <input
              type="url"
              className={inputClass}
              disabled={disabled}
              value={formValues.payment_link_url}
              onChange={(event) => updateField('payment_link_url', event.target.value)}
            />
          </Field>
        </Section>

        <div className="sticky bottom-4 flex justify-end">
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            <Save className="h-4 w-4" />
            {submitting ? 'Saving...' : loading ? 'Loading...' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default Settings
