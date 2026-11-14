import { useSyncExternalStore } from 'react'

const WIDE = '(min-width: 1280px)'
const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/**
 * True at Tailwind's `xl` breakpoint (1280px) and up, where the scenario panel docks beside
 * the page. Below it the panel is an overlay drawer. Outside a browser (tests) counts as wide.
 */
export function isWideScreen(): boolean {
  return !hasMatchMedia() || window.matchMedia(WIDE).matches
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {}
  const mql = window.matchMedia(WIDE)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/** `isWideScreen()` that re-renders when the window crosses the breakpoint. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, isWideScreen, () => true)
}
