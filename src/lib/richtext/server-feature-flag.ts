import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FEATURE_FLAG_KEY,
  isRichTextEnabledFor,
  parseFeatureFlag,
} from './feature-flag'

export async function isRichTextFeatureEnabled(
  supabase: SupabaseClient,
  role: string,
): Promise<boolean> {
  if (role !== 'admin') return false

  const { data, error } = await supabase
    .from('feature_flags')
    .select('value')
    .eq('key', FEATURE_FLAG_KEY)
    .maybeSingle()

  if (error || !data) return false
  return isRichTextEnabledFor(parseFeatureFlag(data.value), role)
}
