const SectionHeader = ({ title, subtitle, right }) => {
  return (
    <div className="mb-5 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {subtitle && (
          <p className="text-sm font-medium text-text-muted">{subtitle}</p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">
          {title}
        </h2>
      </div>

      {right && <div>{right}</div>}
    </div>
  )
}

export default SectionHeader
