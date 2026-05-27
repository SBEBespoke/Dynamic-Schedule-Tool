/**
 * ViewContext — propagates the effective role used for UI rendering.
 *
 * When an Administrator uses "View as", this context carries the preview role
 * into all child views so permission checks reflect what that role actually sees.
 * Actual Supabase operations always use the real auth role (AuthContext).
 */
import { createContext, useContext } from 'react'

const ViewContext = createContext({
  effectiveRole:        null,
  effectiveIsSuperAdmin: false,
  effectiveIsOpsOrAbove: false,
})

export const ViewProvider = ViewContext.Provider

export function useViewAuth() {
  return useContext(ViewContext)
}
