/**
 * Shown while a route's lazy() chunk is in flight.
 *
 * Two shapes, because the boundary sits in two different places:
 *   `full`   — public routes and layouts, which own the whole viewport
 *   default  — pages nested inside a _layout, which render into an Outlet
 *              with the nav shell already painted around them
 *
 * The .ak-fallback class delays the fade-in by 200ms (see index.css), so a
 * cached chunk resolves before anything is drawn and navigation stays silent.
 */
export default function RouteFallback({ full = false }) {
  return (
    <div
      className={`ak-fallback flex items-center justify-center ${
        full ? 'min-h-screen bg-slate-100' : 'min-h-[60vh]'
      }`}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-3 text-slate-500">
        <span
          className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin"
          aria-hidden="true"
        />
        Loading…
      </span>
    </div>
  )
}
