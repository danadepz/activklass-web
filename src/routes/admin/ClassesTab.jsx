import { Fragment, useMemo, useState } from 'react'
import { useAdminOverview } from '@/hooks/useAdminOverview'
import { downloadCsv, stampedName } from '@/lib/csv'
import { ink, muted, faint, green, red, gold, line, serif, mono } from '@/theme'
import { card, field, btnGhost, th } from './ui'
import Notice from './Notice'

function pct(value) {
  return value == null ? '—' : `${value}%`
}

/** Class Oversight: View All Classes, View Class Records, School-Wide Statistics. */
export default function ClassesTab() {
  const { data, isLoading, isError, error } = useAdminOverview()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [openId, setOpenId] = useState(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((r) => {
      if (!showArchived && r.archived) return false
      if (!q) return true
      return `${r.section} ${r.subject} ${r.teacherName}`.toLowerCase().includes(q)
    })
  }, [data, search, showArchived])

  function exportCsv() {
    downloadCsv(stampedName('class-oversight'), [
      ['Class', 'Subject', 'Teacher', 'Students', 'Quizzes', 'Attempts', 'Graded', 'Average %', 'Archived'],
      ...rows.map((r) => [
        r.section, r.subject, r.teacherName, r.studentCount, r.quizCount,
        r.attemptCount, r.gradedCount, r.averagePct ?? '', r.archived ? 'yes' : 'no',
      ]),
    ])
  }

  if (isLoading) return <p style={{ color: faint }}>Loading school data…</p>
  if (isError) return <Notice>{error?.message ?? 'Could not load school data.'}</Notice>

  const s = data.stats

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* School-wide statistics */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
        {[
          { label: 'Classes', value: s.activeClasses, sub: s.classes !== s.activeClasses ? `${s.classes} incl. archived` : null },
          { label: 'Teachers', value: s.teachers },
          { label: 'Students', value: s.students },
          { label: 'Quizzes', value: s.quizzes },
          { label: 'Attempts', value: s.attempts },
          { label: 'School average', value: pct(s.schoolAverage), color: gold },
        ].map((k) => (
          <div key={k.label} style={{ ...card, padding: '14px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase', color: muted }}>
              {k.label}
            </div>
            <div style={{ ...serif, fontSize: 26, lineHeight: 1, color: k.color ?? ink, marginTop: 5 }}>
              {k.value}
            </div>
            {k.sub && <div style={{ fontSize: 11.5, color: faint, marginTop: 4 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {s.attempts === 0 && (
        <Notice tone="ok">
          No quiz attempts recorded yet, so the school average has nothing to compute from. It fills
          in once students start submitting.
        </Notice>
      )}

      <section style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}`,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: 0, flex: 1 }}>
            All classes <span style={{ ...mono, fontSize: 13, color: faint }}>{rows.length}</span>
          </h2>
          <input placeholder="Search class, subject or teacher" value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 style={{ ...field, width: 250, padding: '8px 12px', fontSize: 13 }} />
          <label style={{ fontSize: 13, color: muted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          <button style={btnGhost} onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        </div>

        {rows.length === 0 ? (
          <p style={{ padding: 28, textAlign: 'center', color: faint }}>No classes match that filter.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                  {['Class', 'Teacher', 'Students', 'Quizzes', 'Attempts', 'Average', ''].map((h, i) => (
                    <th key={h || i} style={{ ...th, color: muted, textAlign: i >= 2 && i <= 5 ? 'right' : 'left' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr style={{ borderTop: `1px solid ${line}` }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
                          {r.section}
                          {r.archived && (
                            <span style={{ ...mono, fontSize: 11, color: faint, marginLeft: 8 }}>archived</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12.5, color: muted }}>{r.subject}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13.5, color: ink }}>{r.teacherName}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13.5 }}>{r.studentCount}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13.5 }}>{r.quizCount}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13.5 }}>{r.attemptCount}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13.5,
                                   color: r.averagePct == null ? faint : r.averagePct < 75 ? red : green,
                                   fontWeight: 700 }}>
                        {pct(r.averagePct)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button style={btnGhost} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                          {openId === r.id ? 'Hide' : 'Record'}
                        </button>
                      </td>
                    </tr>
                    {openId === r.id && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0 14px 16px', background: 'rgba(14,42,92,0.02)' }}>
                          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', paddingTop: 14, fontSize: 13 }}>
                            {[
                              ['Enrolled', r.studentCount],
                              ['Quizzes assigned', r.quizCount],
                              ['Attempts submitted', r.attemptCount],
                              ['Attempts graded', r.gradedCount],
                              ['Class average', pct(r.averagePct)],
                            ].map(([label, value]) => (
                              <div key={label}>
                                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                                              textTransform: 'uppercase', color: muted }}>
                                  {label}
                                </div>
                                <div style={{ ...serif, fontSize: 20, color: ink, marginTop: 3 }}>{value}</div>
                              </div>
                            ))}
                          </div>
                          {r.attemptCount > r.gradedCount && (
                            <p style={{ fontSize: 12.5, color: muted, marginTop: 12 }}>
                              {r.attemptCount - r.gradedCount} attempt(s) are awaiting manual grading, so the
                              average covers only the {r.gradedCount} already scored.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
