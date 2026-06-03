export const isValidEmail = (value = '') => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue)
}

export const isValidDateInput = (value = '') => {
  if (!value) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const parsedDate = new Date(year, month - 1, day)

  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  )
}

export const isValidDateTimeInput = (value = '') => {
  if (!value) return true

  const parsedDate = new Date(value)
  return !Number.isNaN(parsedDate.getTime())
}

export const isValidHttpUrl = (value = '') => {
  const trimmedValue = value.trim()
  if (!trimmedValue) return true

  try {
    const parsedUrl = new URL(trimmedValue)
    return ['http:', 'https:'].includes(parsedUrl.protocol)
  } catch {
    return false
  }
}
