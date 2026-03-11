type UserLike = {
  app_metadata?: {
    role?: unknown
    roles?: unknown
  }
  user_metadata?: {
    role?: unknown
    roles?: unknown
  }
}

function normalizeRoles(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }

  return []
}

export function isAdminUser(user: UserLike | null | undefined): boolean {
  if (!user) return false

  const candidateRoles = [
    ...normalizeRoles(user.app_metadata?.role),
    ...normalizeRoles(user.app_metadata?.roles),
    ...normalizeRoles(user.user_metadata?.role),
    ...normalizeRoles(user.user_metadata?.roles),
  ]

  return candidateRoles.some((role) => role.toLowerCase() === 'admin')
}
