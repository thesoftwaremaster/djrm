import { useMemo, useState } from 'react'
import {
  BookOpen,
  Bug,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LifeBuoy,
  Lightbulb,
  Mail,
  MessageSquare,
  Search,
  Send,
} from 'lucide-react'
import { useAuth } from '../auth/useAuth'

const quickStartItems = [
  'Add your first client',
  'Create an enquiry',
  'Convert enquiry to booking',
  'Create and send an invoice',
  'Upload a contract',
  'Build an event timeline',
]

const faqs = [
  {
    question: 'How do I create a new booking?',
    answer: 'Open Bookings, choose the add booking action, complete the client and event details, then save the booking to your workspace.',
  },
  {
    question: 'How do I convert an enquiry into a booking?',
    answer: 'Open an enquiry and use the conversion action. The CRM preserves the enquiry record and creates the linked booking workflow.',
  },
  {
    question: 'How are deposits and balances tracked?',
    answer: 'Invoices and tracked payments show what has been paid against the total. Once payments meet the invoice total, status automation can mark the invoice paid.',
  },
  {
    question: 'Can I delete invoices?',
    answer: 'Invoice deletion can be restricted depending on status, linked payments, and workspace safeguards. This protects financial history from accidental removal.',
  },
  {
    question: 'How do I upload contracts?',
    answer: 'Use the contract area on a booking record to attach the relevant file. Storage and permissions remain tied to the authenticated workspace.',
  },
  {
    question: "Why can't I delete some records?",
    answer: 'Some records are protected when they have linked bookings, invoices, payments, or audit-sensitive activity. Remove dependent records only when the workflow allows it.',
  },
  {
    question: 'How do music requests work?',
    answer: 'Music requests are managed from event planning areas so client preferences can stay connected to the booking timeline.',
  },
  {
    question: 'Can I export my data?',
    answer: 'Export controls are planned for account and record data. The current help page shows the support path until the export workflow is connected.',
  },
]

const resources = [
  { title: 'Getting Started Guide', description: 'Set up clients, enquiries, and workspace defaults.', icon: BookOpen },
  { title: 'Invoicing Guide', description: 'Create invoices, record payments, and track balances.', icon: FileText },
  { title: 'Contracts Guide', description: 'Keep booking paperwork organised and easy to find.', icon: ClipboardCheck },
  { title: 'Event Planning Guide', description: 'Prepare timings, notes, and delivery details.', icon: MessageSquare },
  { title: 'Music Requests Guide', description: 'Capture client preferences for each event.', icon: LifeBuoy },
  { title: 'Troubleshooting', description: 'Fix common workflow, account, and data questions.', icon: Bug },
]

const inputClass =
  'h-11 w-full rounded-2xl border border-border-soft bg-surface px-4 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100'

const textareaClass =
  'min-h-[132px] w-full rounded-2xl border border-border-soft bg-surface px-4 py-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100'

const Card = ({ children, className = '' }) => (
  <section className={`rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5 ${className}`}>
    {children}
  </section>
)

const Field = ({ label, children }) => (
  <label className="block min-w-0 text-left">
    <span className="text-xs font-medium text-text-secondary">{label}</span>
    <div className="mt-1.5">{children}</div>
  </label>
)

const SectionTitle = ({ title, description }) => (
  <div className="mb-5 text-left">
    <h2 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h2>
    {description && (
      <p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p>
    )}
  </div>
)

const Help = () => {
  const { user } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [openQuestion, setOpenQuestion] = useState(faqs[0].question)
  const [supportValues, setSupportValues] = useState({
    name: '',
    email: user?.email || '',
    subject: '',
    category: 'Bug',
    message: '',
  })
  const [supportError, setSupportError] = useState('')
  const [supportSuccess, setSupportSuccess] = useState('')
  const [featureMessage, setFeatureMessage] = useState('')

  const filteredFaqs = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return faqs

    return faqs.filter((faq) =>
      `${faq.question} ${faq.answer}`.toLowerCase().includes(normalizedSearch)
    )
  }, [searchTerm])

  const updateSupportField = (field, value) => {
    setSupportValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }))
    setSupportError('')
    setSupportSuccess('')
  }

  const handleSupportSubmit = (event) => {
    event.preventDefault()

    if (
      !supportValues.name.trim() ||
      !supportValues.email.trim() ||
      !supportValues.subject.trim() ||
      !supportValues.message.trim()
    ) {
      setSupportError('Complete all required support fields before submitting.')
      setSupportSuccess('')
      return
    }

    setSupportSuccess('Support request saved locally. Email delivery will be connected later.')
    setSupportError('')
    setSupportValues((currentValues) => ({
      ...currentValues,
      subject: '',
      message: '',
    }))
  }

  const handleFeatureRequest = () => {
    setFeatureMessage('Feature request capture will be connected later.')
    window.alert('Feature request capture will be connected later.')
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-border-soft bg-surface p-5 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Support
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Help & Support
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Find answers, learn the CRM, or contact support.
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
          <LifeBuoy className="h-5 w-5" />
        </span>
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search help articles and FAQs..."
          className="h-12 w-full rounded-2xl border border-border-soft bg-surface pl-11 pr-4 text-sm text-text-primary shadow-[0_6px_20px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:ring-4 focus:ring-indigo-100"
        />
      </div>

      <Card>
        <SectionTitle
          title="Quick Start Guide"
          description="The core workflow for getting your first event from enquiry to delivery."
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickStartItems.map((item, index) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface text-sm font-semibold text-accent-primary">
                {index + 1}
              </span>
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold text-text-primary">{item}</p>
                <p className="mt-1 text-sm leading-5 text-text-secondary">Mark this step complete as your setup grows.</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionTitle
            title="FAQ"
            description="Answers filter locally from the search box above."
          />

          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isOpen = openQuestion === faq.question

              return (
                <div key={faq.question} className="rounded-2xl border border-border-soft bg-surface-subtle">
                  <button
                    type="button"
                    onClick={() => setOpenQuestion(isOpen ? '' : faq.question)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  >
                    <span className="text-sm font-semibold text-text-primary">{faq.question}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <p className="border-t border-border-soft px-4 py-4 text-sm leading-6 text-text-secondary">
                      {faq.answer}
                    </p>
                  )}
                </div>
              )
            })}

            {filteredFaqs.length === 0 && (
              <div className="rounded-2xl border border-border-soft bg-surface-subtle p-4 text-sm text-text-secondary">
                No FAQ results match your search.
              </div>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Contact Support"
            description="Send the app owner enough detail to understand the issue. This form is local for now."
          />

          {(supportError || supportSuccess) && (
            <div
              className={`mb-4 rounded-2xl border p-3 text-sm ${
                supportError
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              {supportError || supportSuccess}
            </div>
          )}

          <form onSubmit={handleSupportSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputClass}
                  value={supportValues.name}
                  onChange={(event) => updateSupportField('name', event.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={supportValues.email}
                  onChange={(event) => updateSupportField('email', event.target.value)}
                />
              </Field>
            </div>

            <Field label="Subject">
              <input
                className={inputClass}
                value={supportValues.subject}
                onChange={(event) => updateSupportField('subject', event.target.value)}
              />
            </Field>

            <Field label="Category">
              <select
                className={inputClass}
                value={supportValues.category}
                onChange={(event) => updateSupportField('category', event.target.value)}
              >
                <option>Bug</option>
                <option>Billing</option>
                <option>Feature Request</option>
                <option>Account</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Message">
              <textarea
                className={textareaClass}
                value={supportValues.message}
                onChange={(event) => updateSupportField('message', event.target.value)}
              />
            </Field>

            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] transition hover:bg-indigo-700"
            >
              <Send className="h-4 w-4" />
              Submit request
            </button>
          </form>
        </Card>
      </div>

      <Card>
        <SectionTitle
          title="Product Resources"
          description="Reference guides planned for common DJ CRM workflows."
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {resources.map((resource) => {
            const Icon = resource.icon

            return (
              <div key={resource.title} className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 text-left">
                    <h3 className="text-sm font-semibold text-text-primary">{resource.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-text-secondary">{resource.description}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.85fr]">
        <Card>
          <SectionTitle title="System Info" />

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <dt className="text-xs font-medium text-text-secondary">App version</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">v1.0.0</dd>
            </div>
            <div className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <dt className="text-xs font-medium text-text-secondary">Environment</dt>
              <dd className="mt-1 text-sm font-semibold text-text-primary">Development</dd>
            </div>
            <div className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <dt className="text-xs font-medium text-text-secondary">Support email</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-text-primary">support@djcrm.app</dd>
            </div>
            <div className="rounded-2xl border border-border-soft bg-surface-subtle p-4">
              <dt className="text-xs font-medium text-text-secondary">Current user</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-text-primary">
                {user?.email || 'Not signed in'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <SectionTitle
            title="Feedback"
            description="Help shape the CRM around the way your events actually run."
          />

          {featureMessage && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {featureMessage}
            </div>
          )}

          <button
            type="button"
            onClick={handleFeatureRequest}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface-subtle px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface"
          >
            <Lightbulb className="h-4 w-4" />
            Suggest a Feature
          </button>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border-soft bg-surface-subtle p-4 text-sm leading-6 text-text-secondary">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" />
            Share workflow gaps, repetitive admin, or client-facing moments that could feel smoother.
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Help
