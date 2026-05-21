import { supabase } from '../supabase'

export const DEMO_USER_EMAIL = 'demo@djrm.co'
export const DEMO_PROTECTED_MESSAGE =
  'Demo data is protected. Create your own account to manage real records.'

export const isDemoUser = (user) => (
  user?.email?.trim().toLowerCase() === DEMO_USER_EMAIL
)

export const assertNotDemoUser = (user) => {
  if (isDemoUser(user)) {
    throw new Error(DEMO_PROTECTED_MESSAGE)
  }
}

export const assertCurrentUserCanDelete = async () => {
  const { data, error } = await supabase.auth.getUser()

  if (error) throw error

  assertNotDemoUser(data.user)
}
