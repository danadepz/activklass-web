/**
 * "Your school" on the teacher's Account page: the colleagues who teach at
 * the same school, grouped by that fact alone.
 *
 * Replaced the code-based teacher group on 2026-08-30 (owner's decision:
 * same school = same group, with nothing to ask, request, share or approve).
 * The list is hooks/useSchoolColleagues; this file only shows it, and lets a
 * teacher whose account predates the school picker choose their school from
 * the directory, since without one there is nothing to be grouped by.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { useMySubscription } from '@/hooks/useMySubscription'
import { useSchoolColleagues } from '@/hooks/useSchoolColleagues'
import { fetchSchoolDirectory } from '@/lib/schoolDirectory'
import Button from '@/components/ui/Button'
import { PaidPlanHint } from '@/components/SubscriptionBadge'
import { ink, muted, faint, line, red, serif, sansFamily as sans } from '@/theme'

const card = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }
const field = {
  width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
}

function Heading({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <div>
        <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 2px' }}>{title}</h2>
        {sub && <p style={{ fontSize: 13, color: muted, margin: 0 }}>{sub}</p>}
      </div>
      {right}
    </div>
  )
}

/** The account has no school on it yet: pick one from the public directory. */
function ChooseSchool() {
  const { profile, refreshProfile } = useAuth()
  const qc = useQueryClient()
  const [schoolId, setSchoolId] = useState('')
  const { data: directory = [], isLoading } = useQuery({ queryKey: ['school-directory'], queryFn: fetchSchoolDirectory, staleTime: 5 * 60 * 1000 })
  const save = useMutation({
    mutationFn: async () => {
      const school = directory.find((s) => s.id === schoolId)
      if (!school) throw new Error('Choose a school')
      await updateDoc(doc(db, 'users', profile.id), { teaching_school_id: school.id, teaching_school_name: school.name })
    },
    onSuccess: async () => {
      await refreshProfile?.()
      qc.invalidateQueries({ queryKey: ['school-colleagues'] })
    },
  })
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
      <Heading title="Your school" sub="Tell us where you teach. Colleagues who sign up with the same school are grouped with you automatically." />
      <label htmlFor="school-pick" style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: ink, marginBottom: 6 }}>School</label>
      <select id="school-pick" className="ak-input" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} style={{ ...field, cursor: 'pointer' }} disabled={isLoading}>
        <option value="">{isLoading ? 'Loading schools…' : 'Select your school'}</option>
        {directory.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.abbreviation})</option>)}
      </select>
      <p style={{ fontSize: 12.5, color: faint, margin: '8px 0 12px' }}>
        Not listed? A school is added to this list the moment a teacher registers with it.
      </p>
      {save.isError && <p role="alert" style={{ fontSize: 13, color: red, margin: '0 0 10px' }}>Could not save your school. Check your connection and try again.</p>}
      <Button type="submit" disabled={!schoolId || save.isPending}>{save.isPending ? 'Saving…' : 'Save school'}</Button>
    </form>
  )
}

function Colleagues() {
  const { schoolName, colleagues, isLoading, isError } = useSchoolColleagues()
  const n = colleagues.length
  return (
    <>
      <Heading
        title="Your school"
        sub={schoolName}
        right={<span style={{ fontSize: 12.5, color: muted, whiteSpace: 'nowrap' }}>{isLoading ? '' : `${n} ${n === 1 ? 'colleague' : 'colleagues'}`}</span>}
      />
      {isLoading && <p style={{ color: faint, margin: 0 }}>Loading colleagues…</p>}
      {isError && <p role="alert" style={{ color: red, fontSize: 13, margin: 0 }}>Could not load your colleagues right now. Try again in a moment.</p>}
      {!isLoading && !isError && n === 0 && (
        <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
          No other teachers from {schoolName || 'your school'} yet. Anyone who registers with your school
          appears here on their own — nothing to share, request or approve.
        </p>
      )}
      {n > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {colleagues.map((c) => (
            <li key={c.id} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(14,42,92,0.035)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: ink }}>{c.last_name}, {c.first_name}</span>
              <span style={{ fontSize: 12.5, color: muted }}>{c.email}</span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: 12.5, color: faint, margin: '12px 0 0' }}>
        Everyone here is grouped by school only. Each keeps their own classes and their own plan.
      </p>
    </>
  )
}

export default function SchoolColleaguesCard() {
  const { profile } = useAuth()
  const { locks } = useMySubscription()
  if (!profile?.teaching_school_id) return <div style={card}><ChooseSchool /></div>
  // A trial may see what the school list is, not use it -- the same lock the
  // teacher group carried, kept so the paid plan still reads as adding it.
  if (locks.teacherGroups) {
    return (
      <div style={{ ...card, position: 'relative' }} aria-disabled="true">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>Your school</h2>
          <PaidPlanHint />
        </div>
        <p style={{ fontSize: 13.5, color: muted, margin: 0 }}>
          On a paid plan, the other teachers at {profile.teaching_school_name || 'your school'} are listed here automatically.
        </p>
      </div>
    )
  }
  return <div style={card}><Colleagues /></div>
}
