import { useRef, useState } from 'react'

const copyToClipboard = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'absolute'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

const CommunicationTemplates = ({ title = 'Message templates', subtitle = '', templates = [] }) => {
  const [copiedTemplateId, setCopiedTemplateId] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  const [copyError, setCopyError] = useState('')
  const clearCopyStateTimeoutRef = useRef(null)

  const handleCopy = async (template) => {
    if (clearCopyStateTimeoutRef.current) {
      window.clearTimeout(clearCopyStateTimeoutRef.current)
    }

    setCopyMessage('')
    setCopyError('')

    try {
      await copyToClipboard(template.body)
      setCopiedTemplateId(template.id)
      setCopyMessage('Message copied successfully.')
      clearCopyStateTimeoutRef.current = window.setTimeout(() => {
        setCopiedTemplateId('')
        setCopyMessage('')
        clearCopyStateTimeoutRef.current = null
      }, 2500)
    } catch (error) {
      console.error(error)
      setCopyError('Could not copy message.')
    }
  }

  if (!templates.length) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        No templates available.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-4 text-left">
        <p className="text-sm font-medium text-text-muted">Communication</p>
        <h2 className="mt-1 text-xl font-semibold text-text-primary">{title}</h2>
        {subtitle && (
          <p className="mt-2 text-sm leading-6 text-text-secondary">{subtitle}</p>
        )}
      </div>

      <div className="space-y-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className="rounded-2xl border border-border-soft bg-surface px-4 py-3.5 text-left"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-text-primary">{template.title}</p>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 text-text-secondary">
                  {template.body}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleCopy(template)}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
              >
                {copiedTemplateId === template.id ? 'Copied' : 'Copy message'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {copyMessage && !copyError && (
        <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {copyMessage}
        </p>
      )}

      {copyError && (
        <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {copyError}
        </p>
      )}
    </div>
  )
}

export default CommunicationTemplates

