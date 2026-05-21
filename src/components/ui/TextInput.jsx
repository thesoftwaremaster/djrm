const TextInput = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  required = false,
  min,
  max,
  step,
  helperText = '',
}) => {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-text-primary">
        {label}
      </label>

      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        max={max}
        step={step}
        className="h-12 w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-4 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
      />

      {helperText && (
        <p className="mt-2 text-sm text-text-secondary">{helperText}</p>
      )}
    </div>
  )
}

export default TextInput
