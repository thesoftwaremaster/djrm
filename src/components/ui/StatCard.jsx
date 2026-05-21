const StatCard = ({
  label,
  value,
  icon: Icon,
  variant = 'default',
  className = '',
}) => {
  const variants = {
    default: {
      container: 'bg-[var(--surface-subtle)]',
      label: 'text-[var(--text-secondary)]',
      value: 'text-[var(--text-primary)]',
      icon: 'text-[#9ca3af]',
    },
    warning: {
      container: 'bg-amber-50',
      label: 'text-amber-800',
      value: 'text-amber-800',
      icon: 'text-amber-800',
    },
  }

  const styles = variants[variant]

  return (
    <div className={`flex min-w-0 flex-col gap-3 rounded-2xl px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${styles.container} ${className}`}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <Icon className={`w-4 h-4 ${styles.icon}`} />}
        <p className={`min-w-0 break-words text-left text-sm ${styles.label}`}>{label}</p>
      </div>

      <p className={`break-words text-left text-xl font-semibold sm:text-right sm:text-2xl ${styles.value}`}>
        {value}
      </p>
    </div>
  )
}

export default StatCard
