const Card = ({ children, className = '' }) => {
  return (
    <div
      className={`min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5 ${className}`}
    >
      {children}
    </div>
  )
}

export default Card
