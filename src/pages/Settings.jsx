import { useEffect, useMemo, useState } from 'react'
import { Palette, Save, Settings as SettingsIcon, Upload, UserCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../auth/useAuth'
import {
  defaultAppSettings,
  isMissingSettingsSchemaError,
  normalizeAppSettings,
} from '../utils/appSettings'
import { isValidEmail, isValidHttpUrl } from '../utils/validation'

const numberOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsedValue = Number(value)

  return Number.isNaN(parsedValue) ? null : parsedValue
}

const integerOrNull = (value) => {
  const parsedValue = numberOrNull(value)

  return parsedValue === null ? null : Math.trunc(parsedValue)
}

const mapSettingsRowToFormData = (settings = {}, user = null) => {
  const normalizedSettings = normalizeAppSettings(settings)
  const userFullName = user?.user_metadata?.full_name || user?.user_metadata?.name || ''

  return {
    businessName: normalizedSettings.business_name ?? '',
    displayName: normalizedSettings.display_name ?? '',
    contactName: normalizedSettings.contact_name ?? '',
    email: normalizedSettings.contact_email || user?.email || '',
    phone: normalizedSettings.phone ?? '',
    website: normalizedSettings.website ?? '',
    address: normalizedSettings.address ?? '',
    businessDescription: normalizedSettings.business_description ?? '',
    invoicePrefix: normalizedSettings.invoice_prefix ?? 'INV',
    nextInvoiceNumber: normalizedSettings.next_invoice_number ?? '',
    defaultDueDays: normalizedSettings.default_due_days ?? 7,
    paymentTermsDays: normalizedSettings.payment_terms_days ?? normalizedSettings.default_due_days ?? 7,
    currency: normalizedSettings.currency ?? 'GBP',
    defaultTaxRate: normalizedSettings.default_tax_rate ?? 0,
    taxEnabled: Boolean(normalizedSettings.tax_enabled),
    taxRate: normalizedSettings.tax_rate ?? normalizedSettings.default_tax_rate ?? 0,
    paymentLinkPlaceholder: normalizedSettings.payment_link_placeholder ?? '',
    defaultDepositPercentage: normalizedSettings.default_deposit_percentage ?? 50,
    defaultBookingStatus: normalizedSettings.default_booking_status ?? 'pending',
    defaultEventDurationHours:
      normalizedSettings.default_event_duration_hours ?? normalizedSettings.default_event_duration ?? 5,
    defaultEventDuration:
      normalizedSettings.default_event_duration ?? normalizedSettings.default_event_duration_hours ?? 5,
    defaultSetupTime: normalizedSettings.default_setup_time ?? 1,
    defaultTravelFee: normalizedSettings.default_travel_fee ?? 0,
    cancellationPolicy: normalizedSettings.cancellation_policy ?? '',
    defaultTerms: normalizedSettings.default_terms ?? '',
    requireContractByDefault: Boolean(normalizedSettings.require_contract_by_default),
    bankAccountName: normalizedSettings.bank_account_name ?? '',
    bankName: normalizedSettings.bank_name ?? '',
    bankSortCode: normalizedSettings.bank_sort_code ?? '',
    bankAccountNumber: normalizedSettings.bank_account_number ?? '',
    iban: normalizedSettings.iban ?? '',
    bicSwift: normalizedSettings.bic_swift ?? '',
    bankDetails: normalizedSettings.bank_details ?? '',
    paymentInstructions: normalizedSettings.payment_instructions ?? '',
    paymentReferenceInstructions: normalizedSettings.payment_reference_instructions ?? '',
    paymentLinkUrl: normalizedSettings.payment_link_url ?? '',
    invoiceFooterText: normalizedSettings.invoice_footer_text ?? '',
    invoiceFooterNote: normalizedSettings.invoice_footer_note ?? '',
    invoiceThankYouMessage: normalizedSettings.invoice_thank_you_message ?? '',
    emailRemindersEnabled: Boolean(normalizedSettings.email_reminders_enabled),
    paymentReminderDays: normalizedSettings.payment_reminder_days ?? 3,
    eventReminderDays: normalizedSettings.event_reminder_days ?? 7,
    followUpReminderDays: normalizedSettings.follow_up_reminder_days ?? 2,
    weeklySummaryEnabled: Boolean(normalizedSettings.weekly_summary_enabled),
    accentColour: normalizedSettings.accent_colour ?? '#111827',
    darkModeEnabled: Boolean(normalizedSettings.dark_mode_enabled),
    pdfStyle: normalizedSettings.pdf_style ?? 'Modern',
    fullName: normalizedSettings.full_name || userFullName,
    timezone: normalizedSettings.timezone ?? 'Europe/London',
  }
}

const mapFormDataToSettingsPayload = (formData, userId) => {
  const paymentTermsDays = integerOrNull(formData.paymentTermsDays) ?? 7
  const taxRate = numberOrNull(formData.taxRate) ?? 0
  const eventDuration = numberOrNull(formData.defaultEventDuration) ?? 5

  return {
    user_id: userId,
    business_name: formData.businessName.trim() || null,
    display_name: formData.displayName.trim() || null,
    contact_name: formData.contactName.trim() || null,
    contact_email: formData.email.trim() || null,
    phone: formData.phone.trim() || null,
    website: formData.website.trim() || null,
    address: formData.address.trim() || null,
    business_description: formData.businessDescription.trim() || null,
    invoice_prefix: formData.invoicePrefix.trim() || 'INV',
    next_invoice_number: integerOrNull(formData.nextInvoiceNumber),
    default_due_days: paymentTermsDays,
    payment_terms_days: paymentTermsDays,
    currency: formData.currency?.trim() || 'GBP',
    default_tax_rate: taxRate,
    tax_enabled: Boolean(formData.taxEnabled),
    tax_rate: taxRate,
    default_deposit_percentage: numberOrNull(formData.defaultDepositPercentage) ?? 50,
    bank_details: formData.bankDetails.trim() || null,
    payment_instructions: formData.paymentInstructions.trim() || null,
    payment_reference_instructions: formData.paymentInstructions.trim() || null,
    invoice_footer_note: formData.invoiceFooterNote.trim() || null,
    invoice_footer_text: formData.invoiceFooterNote.trim() || null,
    invoice_thank_you_message: formData.invoiceThankYouMessage.trim() || null,
    default_booking_status: formData.defaultBookingStatus || 'pending',
    default_event_duration: eventDuration,
    default_event_duration_hours: eventDuration,
    default_setup_time: numberOrNull(formData.defaultSetupTime) ?? 1,
    default_travel_fee: numberOrNull(formData.defaultTravelFee) ?? 0,
    cancellation_policy: formData.cancellationPolicy.trim() || null,
    default_terms: formData.defaultTerms.trim() || null,
    require_contract_by_default: Boolean(formData.requireContractByDefault),
    email_reminders_enabled: Boolean(formData.emailRemindersEnabled),
    payment_reminder_days: integerOrNull(formData.paymentReminderDays) ?? 3,
    event_reminder_days: integerOrNull(formData.eventReminderDays) ?? 7,
    follow_up_reminder_days: integerOrNull(formData.followUpReminderDays) ?? 2,
    weekly_summary_enabled: Boolean(formData.weeklySummaryEnabled),
    accent_colour: formData.accentColour || '#111827',
    dark_mode_enabled: Boolean(formData.darkModeEnabled),
    pdf_style: formData.pdfStyle || 'Modern',
    full_name: formData.fullName.trim() || null,
    timezone: formData.timezone.trim() || 'Europe/London',
    updated_at: new Date().toISOString(),
  }
}

const toDebugUser = (currentUser) => ({
  id: currentUser?.id || null,
  email: currentUser?.email || null,
})

const toDebugSettings = (settings = {}) => ({
  ...settings,
  bank_details: settings.bank_details ? '[redacted]' : '',
  bankDetails: settings.bankDetails ? '[redacted]' : '',
  payment_instructions: settings.payment_instructions ? '[redacted]' : '',
  paymentInstructions: settings.paymentInstructions ? '[redacted]' : '',
  payment_reference_instructions: settings.payment_reference_instructions ? '[redacted]' : '',
  paymentReferenceInstructions: settings.paymentReferenceInstructions ? '[redacted]' : '',
})

const Field = ({ label, children, className = '' }) => (
  <label className={`block min-w-0 text-left ${className}`}>
    <span className="text-xs font-medium text-text-secondary">{label}</span>
    <div className="mt-1.5">{children}</div>
  </label>
)

const Section = ({ title, description, icon: Icon, children }) => (
  <section className="rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5">
    <div className="mb-5 flex items-start gap-3 text-left">
      {Icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
  </section>
)

const ToggleField = ({ label, description, checked, disabled, onChange }) => (
  <div className="flex min-h-11 items-center justify-between gap-4 rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-left">
    <div className="min-w-0">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      {description && <p className="mt-0.5 text-xs leading-5 text-text-secondary">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-accent-primary' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  </div>
)

const LogoPlaceholder = ({ disabled }) => (
  <div className="rounded-2xl border border-dashed border-border-soft bg-surface-subtle p-4 text-left">
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-text-secondary">
        <Upload className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">Logo upload</p>
        <p className="text-xs leading-5 text-text-secondary">Placeholder for a future logo upload.</p>
      </div>
    </div>
    <button
      type="button"
      disabled={disabled}
      className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-70"
    >
      Upload unavailable
    </button>
  </div>
)

const Settings = () => {
  const { isDemoMode, isTesterMode, user } = useAuth()
  const [, setSettings] = useState(null)
  const [formData, setFormData] = useState(() => mapSettingsRowToFormData(defaultAppSettings, user))
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const fetchSettings = async () => {
      setLoading(true)
      setError('')

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser()

      console.log('Settings load current user:', toDebugUser(currentUser))

      if (!isMounted) return

      if (userError) {
        console.error('Settings load user failed:', userError)
        setError('Could not check your signed-in user.')
        setLoading(false)
        return
      }

      if (!currentUser?.id) {
        setSettings(null)
        setFormData(mapSettingsRowToFormData(defaultAppSettings))
        setError('You must be signed in to load settings.')
        setLoading(false)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      console.log('Settings load response data:', data)
      console.log('Settings load error:', fetchError)

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

      setSettings(data)
      setFormData(mapSettingsRowToFormData(data || defaultAppSettings, currentUser))
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
    'min-h-[96px] w-full rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-muted'

  const updateField = (field, value) => {
    setFormData((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
    setSuccessMessage('')
  }

  const roleDisplay = useMemo(() => {
    if (isDemoMode) return 'Demo workspace'
    if (isTesterMode) return 'Tester workspace'
    return 'Authenticated user'
  }, [isDemoMode, isTesterMode])

  const validateSettings = () => {
    if (formData.email.trim() && !isValidEmail(formData.email)) {
      return 'Enter a valid business email address.'
    }

    if (formData.website.trim() && !isValidHttpUrl(formData.website)) {
      return 'Website must start with http:// or https://.'
    }

    const nextInvoiceNumber = integerOrNull(formData.nextInvoiceNumber)
    if (formData.nextInvoiceNumber !== '' && (!nextInvoiceNumber || nextInvoiceNumber < 1)) {
      return 'Next invoice number must be a positive whole number.'
    }

    const paymentTermsDays = integerOrNull(formData.paymentTermsDays)
    if (paymentTermsDays === null || paymentTermsDays < 0) {
      return 'Payment terms must be 0 days or more.'
    }

    const depositPercentage = numberOrNull(formData.defaultDepositPercentage)
    if (depositPercentage === null || depositPercentage < 0 || depositPercentage > 100) {
      return 'Default deposit percentage must be between 0 and 100.'
    }

    const taxRate = numberOrNull(formData.taxRate)
    if (taxRate === null || taxRate < 0 || taxRate > 100) {
      return 'VAT/tax rate must be between 0 and 100.'
    }

    const eventDuration = numberOrNull(formData.defaultEventDuration)
    if (eventDuration === null || eventDuration <= 0) {
      return 'Default event duration must be greater than 0.'
    }

    const setupTime = numberOrNull(formData.defaultSetupTime)
    if (setupTime === null || setupTime < 0) {
      return 'Default setup time must be 0 or more.'
    }

    const travelFee = numberOrNull(formData.defaultTravelFee)
    if (travelFee === null || travelFee < 0) {
      return 'Default travel fee must be 0 or more.'
    }

    const reminderFields = [
      ['paymentReminderDays', 'Payment reminder days'],
      ['eventReminderDays', 'Event reminder days'],
      ['followUpReminderDays', 'Follow-up reminder days'],
    ]

    for (const [field, label] of reminderFields) {
      const value = integerOrNull(formData[field])
      if (value === null || value < 0) return `${label} must be 0 or more.`
    }

    return ''
  }

  const saveSettings = async (successText) => {
    if (submitting) return

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
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser()

      console.log('Settings save current user:', toDebugUser(currentUser))
      console.log('Settings form state before save:', toDebugSettings(formData))

      if (userError || !currentUser) {
        if (userError) console.error('Settings save user failed:', userError)
        setError('You must be signed in to save settings.')
        return
      }

      const payload = mapFormDataToSettingsPayload(formData, currentUser.id)

      console.log('Settings save payload:', toDebugSettings(payload))

      const { data, error: saveError } = await supabase
        .from('app_settings')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single()

      console.log('Settings save response data:', data)
      console.log('Settings save error:', saveError)

      if (saveError) {
        console.error('Settings save failed:', saveError)
        throw saveError
      }

      const { data: checkData, error: checkError } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle()

      console.log('Settings row after save:', checkData, checkError)

      if (checkError) throw checkError

      if ((checkData?.business_name || null) !== payload.business_name) {
        throw new Error(
          `Settings save verification failed. Expected business_name "${payload.business_name || ''}" but found "${checkData?.business_name || ''}".`
        )
      }

      setSettings(checkData || data)
      setFormData(mapSettingsRowToFormData(checkData || data, currentUser))
      setSuccessMessage(successText)
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

  const handleSubmit = async (event) => {
    event.preventDefault()
    await saveSettings('Settings saved successfully.')
  }

  const handleProfileSave = async () => {
    await saveSettings('Profile saved successfully.')
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
            Store business, invoice, booking, notification, branding, and profile defaults.
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

      {isDemoMode && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Demo Mode settings are isolated to the demo account and may reset with demo data.
        </div>
      )}

      {isTesterMode && !isDemoMode && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          Tester Mode settings are isolated to the tester account and will not affect personal or demo data.
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-border-soft bg-surface p-4 text-sm text-text-secondary">
          Loading settings...
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Section
          title="Business profile"
          description="Details used for your CRM workspace and customer-facing documents."
        >
          <Field label="Business name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formData.businessName}
              onChange={(event) => updateField('businessName', event.target.value)}
            />
          </Field>

          <Field label="Contact name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formData.contactName}
              onChange={(event) => updateField('contactName', event.target.value)}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              disabled={disabled}
              value={formData.email}
              onChange={(event) => updateField('email', event.target.value)}
            />
          </Field>

          <Field label="Phone">
            <input
              className={inputClass}
              disabled={disabled}
              value={formData.phone}
              onChange={(event) => updateField('phone', event.target.value)}
            />
          </Field>

          <Field label="Website">
            <input
              type="url"
              className={inputClass}
              disabled={disabled}
              placeholder="https://example.com"
              value={formData.website}
              onChange={(event) => updateField('website', event.target.value)}
            />
          </Field>

          <Field label="Address">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.address}
              onChange={(event) => updateField('address', event.target.value)}
            />
          </Field>

          <LogoPlaceholder disabled={disabled} />

          <Field label="Business description">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.businessDescription}
              onChange={(event) => updateField('businessDescription', event.target.value)}
            />
          </Field>
        </Section>

        <Section
          title="Invoice settings"
          description="Defaults used when invoices are created and sent."
        >
          <Field label="Invoice prefix">
            <input
              className={inputClass}
              disabled={disabled}
              value={formData.invoicePrefix}
              onChange={(event) => updateField('invoicePrefix', event.target.value)}
            />
          </Field>

          <Field label="Next invoice number">
            <input
              type="number"
              min="1"
              className={inputClass}
              disabled={disabled}
              value={formData.nextInvoiceNumber}
              onChange={(event) => updateField('nextInvoiceNumber', event.target.value)}
            />
          </Field>

          <Field label="Payment terms in days">
            <input
              type="number"
              min="0"
              className={inputClass}
              disabled={disabled}
              value={formData.paymentTermsDays}
              onChange={(event) => updateField('paymentTermsDays', event.target.value)}
            />
          </Field>

          <Field label="Default deposit percentage">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              disabled={disabled}
              value={formData.defaultDepositPercentage}
              onChange={(event) => updateField('defaultDepositPercentage', event.target.value)}
            />
          </Field>

          <ToggleField
            label="VAT/tax enabled"
            description="Stores whether tax should be treated as enabled by default."
            checked={Boolean(formData.taxEnabled)}
            disabled={disabled}
            onChange={(value) => updateField('taxEnabled', value)}
          />

          <Field label="VAT/tax rate">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className={inputClass}
              disabled={disabled}
              value={formData.taxRate}
              onChange={(event) => updateField('taxRate', event.target.value)}
            />
          </Field>

          <Field label="Bank details">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.bankDetails}
              onChange={(event) => updateField('bankDetails', event.target.value)}
            />
          </Field>

          <Field label="Payment instructions">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.paymentInstructions}
              onChange={(event) => updateField('paymentInstructions', event.target.value)}
            />
          </Field>

          <Field label="Invoice footer note">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.invoiceFooterNote}
              onChange={(event) => updateField('invoiceFooterNote', event.target.value)}
            />
          </Field>
        </Section>

        <Section
          title="Booking defaults"
          description="Operational defaults used when new bookings are prepared."
        >
          <Field label="Default booking status">
            <select
              className={inputClass}
              disabled={disabled}
              value={formData.defaultBookingStatus}
              onChange={(event) => updateField('defaultBookingStatus', event.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </Field>

          <Field label="Default event duration">
            <input
              type="number"
              min="0.25"
              step="0.25"
              className={inputClass}
              disabled={disabled}
              value={formData.defaultEventDuration}
              onChange={(event) => updateField('defaultEventDuration', event.target.value)}
            />
          </Field>

          <Field label="Default setup time">
            <input
              type="number"
              min="0"
              step="0.25"
              className={inputClass}
              disabled={disabled}
              value={formData.defaultSetupTime}
              onChange={(event) => updateField('defaultSetupTime', event.target.value)}
            />
          </Field>

          <Field label="Default travel fee">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              disabled={disabled}
              value={formData.defaultTravelFee}
              onChange={(event) => updateField('defaultTravelFee', event.target.value)}
            />
          </Field>

          <Field label="Cancellation policy text">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.cancellationPolicy}
              onChange={(event) => updateField('cancellationPolicy', event.target.value)}
            />
          </Field>

          <Field label="Default terms text">
            <textarea
              className={textareaClass}
              disabled={disabled}
              value={formData.defaultTerms}
              onChange={(event) => updateField('defaultTerms', event.target.value)}
            />
          </Field>
        </Section>

        <Section
          title="Notification preferences"
          description="Reminder timing preferences for future notification workflows."
        >
          <ToggleField
            label="Email reminders"
            checked={Boolean(formData.emailRemindersEnabled)}
            disabled={disabled}
            onChange={(value) => updateField('emailRemindersEnabled', value)}
          />

          <Field label="Payment reminder days before due">
            <input
              type="number"
              min="0"
              className={inputClass}
              disabled={disabled}
              value={formData.paymentReminderDays}
              onChange={(event) => updateField('paymentReminderDays', event.target.value)}
            />
          </Field>

          <Field label="Event reminder days before event">
            <input
              type="number"
              min="0"
              className={inputClass}
              disabled={disabled}
              value={formData.eventReminderDays}
              onChange={(event) => updateField('eventReminderDays', event.target.value)}
            />
          </Field>

          <Field label="Follow-up reminder days">
            <input
              type="number"
              min="0"
              className={inputClass}
              disabled={disabled}
              value={formData.followUpReminderDays}
              onChange={(event) => updateField('followUpReminderDays', event.target.value)}
            />
          </Field>

          <ToggleField
            label="Weekly summary"
            checked={Boolean(formData.weeklySummaryEnabled)}
            disabled={disabled}
            onChange={(value) => updateField('weeklySummaryEnabled', value)}
          />
        </Section>

        <Section
          title="Branding / theme"
          description="Saved branding preferences for future UI and PDF presentation."
          icon={Palette}
        >
          <Field label="Accent colour">
            <div className="flex gap-3">
              <input
                type="color"
                className="h-11 w-14 shrink-0 rounded-2xl border border-border-soft bg-surface p-1 disabled:cursor-not-allowed disabled:bg-surface-subtle"
                disabled={disabled}
                value={formData.accentColour}
                onChange={(event) => updateField('accentColour', event.target.value)}
              />
              <input
                className={inputClass}
                disabled={disabled}
                value={formData.accentColour}
                onChange={(event) => updateField('accentColour', event.target.value)}
              />
            </div>
          </Field>

          <ToggleField
            label="Dark mode"
            description="Stored now; app-wide dark theme can be wired later."
            checked={Boolean(formData.darkModeEnabled)}
            disabled={disabled}
            onChange={(value) => updateField('darkModeEnabled', value)}
          />

          <Field label="PDF style selector">
            <select
              className={inputClass}
              disabled={disabled}
              value={formData.pdfStyle}
              onChange={(event) => updateField('pdfStyle', event.target.value)}
            >
              <option value="Minimal">Minimal</option>
              <option value="Modern">Modern</option>
              <option value="Bold">Bold</option>
            </select>
          </Field>

          <LogoPlaceholder disabled={disabled} />
        </Section>

        <Section
          title="User profile"
          description="Profile details for this signed-in user."
          icon={UserCircle}
        >
          <Field label="Full name">
            <input
              className={inputClass}
              disabled={disabled}
              value={formData.fullName}
              onChange={(event) => updateField('fullName', event.target.value)}
            />
          </Field>

          <Field label="User email">
            <input className={inputClass} disabled value={user?.email || ''} />
          </Field>

          <Field label="Role display">
            <input className={inputClass} disabled value={roleDisplay} />
          </Field>

          <Field label="Timezone">
            <input
              className={inputClass}
              disabled={disabled}
              value={formData.timezone}
              onChange={(event) => updateField('timezone', event.target.value)}
            />
          </Field>

          <div className="md:col-span-2">
            <button
              type="button"
              disabled={disabled}
              onClick={handleProfileSave}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {submitting ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </Section>

        <div className="sticky bottom-4 flex justify-end">
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
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
