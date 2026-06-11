import { useLocation } from 'react-router-dom'

export default function ComingSoon() {
  const { pathname } = useLocation()
  const name = pathname.split('/').pop().replace(/-/g, ' ')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
      <h2 className="text-xl font-semibold text-slate-700 capitalize">{name}</h2>
      <p className="text-slate-400 mt-2">This module is on the roadmap and not built yet.</p>
    </div>
  )
}
