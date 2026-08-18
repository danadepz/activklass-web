import { lazy, Suspense } from 'react'
import RouteFallback from './RouteFallback'

/**
 * Builds a route `element` whose page is fetched on first visit.
 *
 * Returns the element rather than a component, and must be called at module
 * scope. `lazy()` memoises per call, so calling it during render would mint a
 * fresh component every time and remount the page on each parent re-render.
 *
 *   const ReportsPage = lazyRoute(() => import('@/routes/teacher/reports'))
 *   <Route path="reports" element={ReportsPage} />
 *
 * The Suspense boundary is per route, not one around <Routes>. A single
 * top-level boundary is the nearest ancestor of every lazy page, so React
 * would swap out the teacher nav shell along with the page body on every
 * navigation — the layout would blink even though it is already loaded.
 *
 * Pass `full` for routes that render without a layout around them.
 */
export function lazyRoute(loader, { full = false } = {}) {
  const Page = lazy(loader)
  return (
    <Suspense fallback={<RouteFallback full={full} />}>
      <Page />
    </Suspense>
  )
}
