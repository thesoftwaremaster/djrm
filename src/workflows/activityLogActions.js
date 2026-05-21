import { supabase } from '../supabase'

export const logActivity = async ({
  entityType,
  entityId,
  bookingId = null,
  clientId = null,
  action,
  title,
  description = null,
  metadata = {},
}) => {
  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .insert([
        {
          entity_type: entityType,
          entity_id: entityId,
          booking_id: bookingId,
          client_id: clientId,
          action,
          title,
          description,
          metadata,
        },
      ])
      .select()
      .single()

    if (error) throw error

    return data
  } catch (error) {
    console.warn('Activity log failed:', error)
    return null
  }
}
