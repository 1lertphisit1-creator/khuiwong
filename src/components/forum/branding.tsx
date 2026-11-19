import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { DEFAULT_BRANDING, type ForumBranding } from '@/lib/forum.ts'

const BrandingContext = createContext<ForumBranding>(DEFAULT_BRANDING)

export function BrandingProvider({ value, children }: { value: ForumBranding; children: ReactNode }) {
  useEffect(() => {
    applyDocumentBranding(value.siteName)
  }, [value.siteName])
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  return useContext(BrandingContext)
}

function applyDocumentBranding(siteName: string) {
  document.title = siteName
  const description = `${siteName} กระดานถาม-ตอบ และห้องคุยสด คุยวง by FIBO99`
  setMeta('description', description)
  setMeta('og:title', siteName, true)
  setMeta('og:description', description, true)
  setMeta('og:site_name', siteName, true)
  setMeta('twitter:title', siteName)
  setMeta('twitter:description', description)
}

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name'
  let element = document.head.querySelector(`meta[${attr}="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, name)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}
