import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pisqlbfncljluxglnqro.supabase.co'
const supabaseKey = 'sb_publishable_RTcXqx6LknbehQDntKrcGg_0lFyhMjt'

export const supabase = createClient(supabaseUrl, supabaseKey)