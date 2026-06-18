import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../context/useAuth'
import { emptyClassForm } from '../../lib/classForm'
import ClassFormModal from './ClassFormModal'

export default function ClassesPage() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [warning, setWarning] = useState(null)

  const { data: classes, isLoading } = useQuery({
    queryKey: ['fs-classes', profile.id],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'classes'), where('teacher_id', '==', profile.id)),
      )
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">My Classes</h2>
          <p className="text-slate-500 mt-1">Create class sections and manage student rosters.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 text-white px-4 py-2 font-medium hover:bg-indigo-700"
        >
          + New Class
        </button>
      </div>

      {warning && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4 flex items-start justify-between gap-3">
          <span>{warning}</span>
          <button onClick={() => setWarning(null)} className="text-amber-600 hover:text-amber-800 shrink-0">
            ✕
          </button>
        </p>
      )}

      {isLoading ? (
        <p className="text-slate-400 mt-8">Loading classes…</p>
      ) : classes?.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 mt-6 text-center text-slate-400">
          No classes yet. Create your first class section to start building its roster.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {classes?.map((c) => (
            <Link
              key={c.id}
              to={`/teacher/classes/${c.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-indigo-400 hover:shadow-sm transition"
            >
              <h3 className="font-semibold text-slate-800">
                {c.subject_code ? `${c.subject_code} · ` : ''}{c.section}
              </h3>
              <p className="text-sm text-slate-500">{c.subject}</p>
              {c.schedule && <p className="text-xs text-slate-400 mt-1">{c.schedule}</p>}
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-slate-500">{c.academic_year}</span>
                <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-0.5 font-medium">
                  {c.student_ids?.length ?? 0}
                  {c.max_students ? ` / ${c.max_students}` : ''} student
                  {(c.student_ids?.length ?? 0) === 1 && !c.max_students ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <ClassFormModal
          mode="create"
          initial={emptyClassForm()}
          onClose={() => setShowCreate(false)}
          onSaved={({ warning: w }) => {
            queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
            setShowCreate(false)
            setWarning(w ?? null)
          }}
        />
      )}
    </div>
  )
}
