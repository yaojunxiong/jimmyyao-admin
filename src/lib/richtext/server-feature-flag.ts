import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FEATURE_FLAG_KEY,
  LOCAL_VIDEO_FEATURE_FLAG_KEY,
  isLocalVideoUploadEnabledFor,
  isRichTextEnabledFor,
  parseFeatureFlag,
} from './feature-flag'

async function readFeatureFlag(
  supabase: SupabaseClient,
  key: string,
): Promise<ReturnType<typeof parseFeatureFlag>> {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error || !data) return parseFeatureFlag(null)
  return parseFeatureFlag(data.value)
}

export async function isRichTextFeatureEnabled(
  supabase: SupabaseClient,
  role: string,
): Promise<boolean> {
  if (role !== 'admin') return false

  return isRichTextEnabledFor(
    await readFeatureFlag(supabase, FEATURE_FLAG_KEY),
    role,
  )
}

export async function isLocalVideoUploadFeatureEnabled(
  supabase: SupabaseClient,
  role: string,
): Promise<boolean> {
  if (role !== 'admin') return false

  return isLocalVideoUploadEnabledFor(
    await readFeatureFlag(supabase, LOCAL_VIDEO_FEATURE_FLAG_KEY),
    role,
  )
}
