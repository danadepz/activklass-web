import { useState } from 'react'
import { generateModule } from '@/lib/ai'
import { Sparkles } from '@/components/icons'
import { navy, navyDeep, ink, gold, muted, faint, red, serif, sansFamily as sans } from '@/theme'

/**
 * Generate Module (AI) — drafts one unit and appends it to the syllabus being
 * edited, leaving every existing module and topic id untouched.
 *
 * The draft is added to the working tree, not saved. A teacher reviews and
 * edits it like any other module and then saves the syllabus, which is the same
 * path a manually written module takes — no second, AI-only save route to keep
 * in step.
 */
export default function GenerateModuleModal({ tree, subject, onAppend, onClose }) {
  const [brief, setBrief] = useState('')
  const [topicCount, setTopicCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const existingTitles = (tree.modules ?? []).map((m) => m.title).filter(Boolean)

  const field = {
    width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink,
    background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
    marginTop: 6,
  }

  async function submit(e) {
    e.preventDefault()
    if (!brief.trim()) { setError('Say what the module should cover.'); return }
    setBusy(true)
    setError(null)
    try {
      const draft = await generateModule({
        brief: brief.trim(),
        subjectCode: subject?.code ?? '',
        subjectDescription: subject?.description ?? tree.title ?? '',
        gradeLevel: subject?.gradeLevel,
        existingTitles,
        topicCount,
      })
      onAppend(draft)
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: 24,
      overflowY: 'auto',
    }}>
      <form onSubmit={submit} style={{
        margin: 'auto', width: '100%', maxWidth: 480, background: '#FFFFFF', borderRadius: 20,
        boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden',
      }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid rgba(14,42,92,0.07)',
                      display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: navy, color: gold,
                         display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h3 style={{ ...serif, fontSize: 20, color: ink, margin: 0 }}>Generate a module</h3>
            <p style={{ fontSize: 12.5, color: muted, margin: '2px 0 0' }}>
              Added to the end of this syllabus. Nothing existing is changed.
            </p>
          </div>
        </div>

        <div style={{ padding: '20px 26px', display: 'grid', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
            What should it cover?
            <input style={field} value={brief} onChange={(e) => setBrief(e.target.value)}
                   placeholder="e.g. Quadratic functions and their graphs" autoFocus />
          </label>

          <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
            Roughly how many topics?
            <select style={{ ...field, cursor: 'pointer' }} value={topicCount}
                    onChange={(e) => setTopicCount(Number(e.target.value))}>
              {[3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} topics</option>)}
            </select>
          </label>

          {existingTitles.length > 0 && (
            <p style={{ fontSize: 12.5, color: faint, margin: 0, lineHeight: 1.5 }}>
              The {existingTitles.length} module{existingTitles.length === 1 ? '' : 's'} already in
              this syllabus are sent along, so the draft builds on them instead of repeating them.
            </p>
          )}

          {error && (
            <div role="alert" style={{
              fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)',
              border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px',
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '0 26px 22px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{
            padding: '11px 18px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
            background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
            cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button type="submit" disabled={busy} style={{
            padding: '11px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6',
            background: navy, border: 'none', borderRadius: 10, cursor: 'pointer',
            boxShadow: `0 3px 0 ${navyDeep}`, opacity: busy ? 0.6 : 1,
          }}>
            {busy ? 'Drafting…' : 'Generate'}
          </button>
        </div>
      </form>
    </div>
  )
}
