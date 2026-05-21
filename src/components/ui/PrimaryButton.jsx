const PrimaryButton = ({
  children,
  type = 'button',
  disabled = false,
  className = '',
}) => {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`flex h-12 w-full items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-5 text-sm font-medium text-white shadow-[0_10px_25px_rgba(79,70,229,0.16)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

export default PrimaryButton
