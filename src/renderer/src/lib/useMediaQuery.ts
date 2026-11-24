import { useEffect, useState } from 'react'

/** Re-renders when a CSS media query starts or stops matching (used for window-size layouts). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const q = window.matchMedia(query)
    const h = () => setMatches(q.matches)
    h()
    q.addEventListener('change', h)
    return () => q.removeEventListener('change', h)
  }, [query])
  return matches
}
