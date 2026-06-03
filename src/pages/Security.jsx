import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  Monitor,
  Shield,
  Smartphone,
  Trash2,
  UserCog,
} from 'lucide-react'

const overviewCards = [
  {
    label: 'Account status',
    value: 'Secure',
    detail: 'No immediate action needed',
    icon: Shield,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  {
    label: 'Two-factor authentication',
    value: 'Not enabled',
    detail: 'Add another layer of protection',
    icon: Smartphone,
    accent: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  {
    label: 'Last login',
    value: '28 May 2026, 09:42',
    detail: 'Chrome on Windows',
    icon: KeyRound,
    accent: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  {
    label: 'Active sessions',
    value: '1 device',
    detail: 'Current workspace session',
    icon: Monitor,
    accent: 'border-slate-200 bg-slate-50 text-slate-700',
  },
]

const roles = [
  {
    title: 'Owner/Admin',
    description: 'Full workspace access, including settings, invoices, bookings, contracts, and account controls.',
  },
  {
    title: 'Assistant',
    description: 'Can help manage clients, enquiries, bookings, timelines, and music requests without account deletion access.',
  },
  {
    title: 'Read-only',
    description: 'Can view records and event details, but cannot edit, delete, invoice, or upload files.',
  },
]

const activityItems = [
  { title: 'Password changed', detail: 'Account credentials updated', time: '2 days ago' },
  { title: 'Login from Chrome', detail: 'Windows Desktop, United Kingdom', time: 'Just now' },
  { title: 'Invoice deleted', detail: 'Placeholder audit record', time: '5 days ago' },
  { title: 'Contract uploaded', detail: 'Booking document added', time: '1 week ago' },
]

const inputClass =
  'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100'

const Field = ({ label, children }) => (
  <label className="block min-w-0 text-left">
    <span className="text-xs font-medium text-text-secondary">{label}</span>
    <div className="mt-1.5">{children}</div>
  </label>
)

const Card = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5 ${className}`}>
    {children}
  </section>
)

const SectionTitle = ({ title, description }) => (
  <div className="mb-5 text-left">
    <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
    {description && (
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
    )}
  </div>
)

const Security = () => {
  const [passwordValues, setPasswordValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const updatePasswordField = (field, value) => {
    setPasswordValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
    setMessage('')
    setError('')
  }

  const handlePasswordSubmit = (event) => {
    event.preventDefault()

    if (!passwordValues.currentPassword || !passwordValues.newPassword || !passwordValues.confirmPassword) {
      setError('Enter your current password, new password, and confirmation.')
      setMessage('')
      return
    }

    if (passwordValues.newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      setMessage('')
      return
    }

    if (passwordValues.newPassword !== passwordValues.confirmPassword) {
      setError('New password and confirmation must match.')
      setMessage('')
      return
    }

    setPasswordValues({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    })
    setError('')
    setMessage('Password update saved locally. Supabase password updates will be connected later.')
  }

  const showPlaceholder = (text) => {
    setError('')
    setMessage(text)
  }

  const handleDeleteAccount = () => {
    const confirmed = window.confirm('This is a placeholder only. No account data will be deleted. Continue?')

    if (confirmed) {
      showPlaceholder('Delete account request captured locally. No data was deleted.')
    }
  }

  return (
    <div className="space-y-6">
      {(message || error) && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            error
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => {
          const Icon = card.icon

          return (
            <Card key={card.label} className="min-h-[142px]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 text-left">
                  <p className="text-xs font-medium text-text-secondary">{card.label}</p>
                  <p className="mt-2 break-words text-xl font-semibold tracking-tight text-text-primary">
                    {card.value}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-text-muted">{card.detail}</p>
                </div>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${card.accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </Card>
          )
        })}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <SectionTitle
            title="Account Security"
            description="Change your password with frontend validation. No authentication update is sent yet."
          />

          <form onSubmit={handlePasswordSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Current password">
              <input
                type="password"
                className={inputClass}
                value={passwordValues.currentPassword}
                onChange={(event) => updatePasswordField('currentPassword', event.target.value)}
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                className={inputClass}
                value={passwordValues.newPassword}
                onChange={(event) => updatePasswordField('newPassword', event.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                className={inputClass}
                value={passwordValues.confirmPassword}
                onChange={(event) => updatePasswordField('confirmPassword', event.target.value)}
              />
            </Field>

            <div className="md:col-span-3">
              <button
                type="submit"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700 sm:w-auto"
              >
                <Lock className="h-4 w-4" />
                Save password
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <SectionTitle
            title="Two-Factor Authentication"
            description="Require a second verification step when signing in to this workspace."
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              Disabled
            </span>
            <button
              type="button"
              onClick={() => showPlaceholder('Two-factor authentication setup will be connected later.')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface-subtle px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface"
            >
              <Smartphone className="h-4 w-4" />
              Enable 2FA
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.95fr]">
        <Card>
          <SectionTitle
            title="Active Sessions"
            description="Devices currently signed in to this DJ CRM workspace."
          />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-text-muted">
                <tr className="border-b border-border-soft">
                  <th className="pb-3 font-semibold">Device</th>
                  <th className="pb-3 font-semibold">Browser</th>
                  <th className="pb-3 font-semibold">Location</th>
                  <th className="pb-3 font-semibold">Last active</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-soft/70">
                  <td className="py-4 font-medium text-text-primary">Windows Desktop</td>
                  <td className="py-4 text-text-secondary">Chrome</td>
                  <td className="py-4 text-text-secondary">United Kingdom</td>
                  <td className="py-4 text-text-secondary">Just now</td>
                  <td className="py-4">
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Current session
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Team Permissions"
            description="Role planning for future workspace collaboration."
          />

          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role.title} className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
                    <UserCog className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 text-left">
                    <h3 className="text-sm font-semibold text-text-primary">{role.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">{role.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.95fr]">
        <Card>
          <SectionTitle
            title="Activity Log"
            description="Recent security and data events. Sample data is shown until audit logs are connected."
          />

          <div className="space-y-3">
            {activityItems.map((item) => (
              <div key={`${item.title}-${item.time}`} className="flex items-start gap-3 rounded-2xl border border-border-soft bg-surface-subtle p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-text-secondary">{item.detail}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-text-muted">{item.time}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-rose-200 bg-rose-50/40">
          <SectionTitle
            title="Danger Zone"
            description="Sensitive account actions. These controls are placeholders and will not delete data."
          />

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => showPlaceholder('Account data export will be connected later.')}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
            >
              <Download className="h-4 w-4" />
              Export account data
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
            >
              <Trash2 className="h-4 w-4" />
              Delete account
            </button>
            <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-white p-3 text-sm leading-6 text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No backend destructive action is attached to these controls yet.
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Security
