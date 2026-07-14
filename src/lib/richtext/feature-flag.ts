export type RichTextTarget = 'admin' | 'member'

const FEATURE_FLAG_KEY = 'forum_rich_text'

type FeatureFlagValue = {
  enabled_for: RichTextTarget[]
}

const DEFAULT_FLAG: FeatureFlagValue = {
  enabled_for: [],
}

export function parseFeatureFlag(json: unknown): FeatureFlagValue {
  try {
    const raw = json as Record<string, unknown>
    const enabledFor = raw.enabled_for as string[] | undefined
    if (Array.isArray(enabledFor)) {
      const valid = enabledFor.filter((v): v is RichTextTarget =>
        v === 'admin' || v === 'member'
      )
      return { enabled_for: valid }
    }
  } catch {
    // fall through
  }
  return DEFAULT_FLAG
}

export function isRichTextEnabledFor(
  flag: FeatureFlagValue,
  role: string,
): boolean {
  if (role === 'admin' && flag.enabled_for.includes('admin')) return true
  if (role === 'member' && flag.enabled_for.includes('member')) return true
  return false
}

// Member authoring deliberately remains plain text. Adding "member" to a flag
// does not bypass the admin page/API authorization checks or alter the public
// forum's existing member composer; that would require a separate feature.

export { FEATURE_FLAG_KEY, DEFAULT_FLAG }
export type { FeatureFlagValue }
