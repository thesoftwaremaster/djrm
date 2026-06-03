export const TESTER_USER_EMAIL = 'tester@djrm.co'

export const isTesterUser = (user) => (
  user?.email?.trim().toLowerCase() === TESTER_USER_EMAIL
)
