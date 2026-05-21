import { supabase } from '../supabase'

export const getCurrentUserId = async () => {
  const { data, error } = await supabase.auth.getUser()

  if (error) throw error
  if (!data.user?.id) throw new Error('You must be signed in to access CRM records.')

  return data.user.id
}

export const withCurrentUserId = async (payload) => ({
  ...payload,
  user_id: await getCurrentUserId(),
})

export const withCurrentUserIdList = async (payloads) => {
  const userId = await getCurrentUserId()

  return payloads.map((payload) => ({
    ...payload,
    user_id: userId,
  }))
}
