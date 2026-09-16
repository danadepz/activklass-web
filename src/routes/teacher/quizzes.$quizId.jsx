import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { fetchUsersByIds } from '@/lib/roster'
import { ArrowRight, Sparkles } from '@/components/icons'
import { navy, navyDeep, ink, gold, goldDeep, muted, faint, green, blueText, red, line, serif, mono, sansFamily as sans } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'
import { useSyllabi } from '@/hooks/useSyllabi'
import { bankQuestions, filterBankedQuestions, useBankedQuestions } from '@/hooks/useBankedQuestions'
import { describeBankResult } from '@/lib/questionBank'
import { SCORING_POLICIES, describeSyncResult, quizzesToAutoPost } from '@/lib/quizToRecord'
import { describeWindow, fromQuiz } from '@/lib/deliverables'
import { topicOptions, topicPatch } from '@/lib/quizTopics'
import { suggestMapping } from '@/lib/recordMapping'
import {
  DETAIL_OPTIONS,
  DETAIL_RATIONALE,
  RELEASE_AFTER_ATTEMPTS,
  RELEASE_IMMEDIATE,
  RELEASE_OPTIONS,
  describeFeedback,
  feedbackProblem,
} from '@/lib/quizFeedback'
import { drawTotalPoints, poolProblem } from '@/lib/quizPool'
import {
  attemptsAllowedFor,
  attemptsLabel,
  unlimitedAttempts,
  describeAttemptActivity,
  describeFocus,
  finishedAttempts,
  formatAway,
  hasExpired,
  openAttempt,
  openForMs,
} from '@/lib/quizAttempts'
import { discardAttempt, grantExtraAttempt } from '@/hooks/useAttemptSession'
import { removeQuizFromAllRecords, syncQuizToAllRecords, syncQuizToClassRecord, useAutoPostScores } from '@/hooks/useQuizRecordSync'
import { backToDraftRefusal, wordingEditError } from './quizWording'
import { confirmDialog } from '@/components/ui/dialogs'
import { toast } from '@/components/ui/toast'
import { useAsyncAction } from '@/components/ui/useAsyncAction'
import { useDialogBehavior } from '@/components/ui/useDialogBehavior'

const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: ink, marginBottom: 6 }
const fieldStyle = {
  width: '100%', padding: '9px 12px', fontSize: 13, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', fontSize: 13,
  fontWeight: 700, fontFamily: sans, color: navy, background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const btnDanger = {
  padding: '10px 16px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: red,
  background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.3)', borderRadius: 10, cursor: 'pointer',
}
const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}
const btnGold = {
  padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: sans, color: goldDeep,
  background: 'rgba(245,197,24,0.18)', border: '1.5px solid rgba(245,197,24,0.55)', borderRadius: 10, cursor: 'pointer',
}
const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, fontFamily: sans, color: navy, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }
const iconBtn = { color: faint, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', fontSize: 14, lineHeight: 1 }

const btnModalGhost = {
  padding: '12px 20px', fontSize: 14, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer',
}
const btnModalPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 9, padding: '12px 20px', fontSize: 14,
  fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none',
  borderRadius: 10, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}`,
}

function GoldArrow() {
  return (
    <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy }}>
      <ArrowRight className="h-3 w-3" />
    </span>
  )
}

function AlertBox({ tone = 'error', children }) {
  const t =
    tone === 'warn'
      ? { color: goldDeep, bg: 'rgba(245,197,24,0.12)', border: 'rgba(245,197,24,0.45)' }
      : { color: red, bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.3)' }
  return (
    <div role="alert" style={{ fontSize: 13, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px' }}>
      {children}
    </div>
  )
}

let keyCounter = 0
const newKey = () => `qk${++keyCounter}`
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`

const TYPE_LABELS = {
  mcq: 'Multiple choice',
  true_false: 'True / False',
  matching: 'Matching',
  short_answer: 'Short answer',
  essay: 'Essay',
}

/**
 * The durations a quiz may be given, in minutes.
 *
 * A free-text number box was wrong here in a way that reached students. It was
 * `min="1"`, but `min` on a bare input is only checked by form validation and
 * this field is not in a validated form -- so `0` and `-30` were accepted and
 * `0` is the dangerous one: `persist()` reads the raw string, and the string
 * `'0'` is truthy, so it stored `time_limit_minutes: 0`. The mobile player
 * coalesces with `??`, which passes 0 straight through to a 0-second
 * countdown -- a quiz that auto-submits the instant a student opens it.
 *
 * The range is bounded by the sitting a quiz has to fit inside. Below 5
 * minutes a student cannot read and answer even one question, and 180 minutes
 * is the longest block any of these schools timetable -- Philippine K-12
 * periods run 40-60 minutes, college lectures 60-90, a final exam block 3
 * hours. A "limit" outside those is not limiting anything.
 */
const TIME_LIMIT_CHOICES = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180]

/**
 * The options to offer for a quiz whose stored limit may predate this list.
 *
 * An existing value that is not a choice is kept and shown rather than snapped
 * to the nearest one: opening an old quiz and saving it must not quietly
 * change how long students get. A teacher who set 37 minutes meant 37.
 *
 * Zero and negatives are the exception and are deliberately not offered back.
 * They are the free-text bug above rather than a decision anyone made, so they
 * fall through to "No time limit" -- which is what an unsittable 0-minute quiz
 * should have been all along. It is the only stored value this can change, and
 * only on a save the teacher chooses to make.
 */
function timeLimitOptions(current) {
  const value = Number(current)
  if (!Number.isFinite(value) || value <= 0 || TIME_LIMIT_CHOICES.includes(value)) {
    return TIME_LIMIT_CHOICES
  }
  return [...TIME_LIMIT_CHOICES, value].sort((a, b) => a - b)
}

/**
 * A comparable image of everything the builder would write.
 *
 * Used to answer one question: would leaving this page cost the teacher work?
 * A boolean flipped by every onChange cannot answer it -- typing a character
 * and deleting it would leave the page "dirty" forever, and teachers would
 * learn to click through the warning, which is the same as not having one.
 *
 * Question `id` and `_key` are excluded deliberately. `toPayload` mints an id
 * for any question that lacks one, so a payload-shaped snapshot would differ
 * from itself on every call and report a brand-new draft as unsaved.
 */
function builderSnapshot(settings, classIds, questions) {
  return JSON.stringify({
    settings,
    classIds: [...classIds].sort(),
    questions: questions.map((q) => ({
      qtype: q.qtype,
      text: q.text,
      points: q.points,
      ai_generated: q.ai_generated,
      // Clearing the objective flag is a decision worth saving on its own.
      off_objective: q.off_objective,
      options: (q.options ?? []).map((o) => ({ text: o.text, is_correct: o.is_correct })),
      tfValue: q.tfValue,
      answersText: q.answersText,
      pairs: (q.pairs ?? []).map((p) => ({ left: p.left, right: p.right })),
      rubric: q.rubric,
    })),
  })
}

function sumPoints(questions) {
  return (questions ?? []).reduce((sum, q) => sum + (Number(q.points) || 0), 0)
}

function toEditable(question) {
  return {
    _key: newKey(),
    id: question.id ?? null,
    qtype: question.qtype,
    text: question.text ?? '',
    points: String(question.points ?? 1),
    ai_generated: question.ai_generated ?? false,
    objective: question.objective ?? '',
    off_objective: question.off_objective === true,
    options: (question.options ?? []).map((o) => ({
      _key: newKey(), id: o.id ?? null, text: o.text ?? '', is_correct: !!o.is_correct,
    })),
    tfValue: question.answer_key?.value ?? true,
    answersText: (question.answer_key?.answers ?? []).join('\n'),
    pairs: (question.answer_key?.pairs ?? []).map((p) => ({
      _key: newKey(), left: p.left ?? '', right: p.right ?? '',
    })),
    rubric: question.rubric ?? '',
  }
}

function blankQuestion() {
  return toEditable({
    qtype: 'mcq', text: '', points: 1,
    options: [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  })
}

function toPayload(q) {
  const base = { id: q.id || newId(), qtype: q.qtype, text: q.text, points: Number(q.points), ai_generated: q.ai_generated }
  // Kept on the saved question so the flag survives a reload and a re-open;
  // only AI drafts ever carry them.
  if (q.objective) base.objective = q.objective
  if (q.off_objective) base.off_objective = true
  if (q.qtype === 'mcq') {
    base.options = q.options.map((o) => ({ id: o.id || newId(), text: o.text, is_correct: o.is_correct }))
  } else if (q.qtype === 'true_false') {
    base.answer_key = { value: q.tfValue }
  } else if (q.qtype === 'short_answer') {
    base.answer_key = { answers: q.answersText.split('\n').map((s) => s.trim()).filter(Boolean) }
  } else if (q.qtype === 'matching') {
    base.answer_key = { pairs: q.pairs.map((p) => ({ left: p.left, right: p.right })) }
  } else if (q.qtype === 'essay') {
    base.rubric = q.rubric
  }
  return base
}

function QuestionCard({ q, index, update, remove, moveUp, moveDown, saveToBank }) {
  const [bankIt, banking] = useAsyncAction(saveToBank)
  const setOptions = (options) => update({ options })
  return (
    <div className="mt-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 14, padding: 18 }}>
      <div className="flex items-center gap-2">
        <span style={{ ...mono, background: navy, color: gold, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 7 }}>Q{index + 1}</span>
        <select value={q.qtype} onChange={(e) => update({ qtype: e.target.value })} className="ak-input" style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}>
          {Object.entries(TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
        <div className="relative ml-auto">
          <input type="number" min="0.5" step="0.5" value={q.points} onChange={(e) => update({ points: e.target.value })} className="ak-input" style={{ ...fieldStyle, width: 80, paddingRight: 30, textAlign: 'right' }} />
          <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: faint }}>pts</span>
        </div>
        <button type="button" onClick={bankIt} disabled={banking} title="Save to Quiz Bank" style={{ ...iconBtn, fontSize: 14 }} className="transition hover:text-indigo-600 flex items-center gap-0.5 disabled:opacity-40">
          💾 <span className="text-[10px] font-bold">{banking ? 'Saving…' : 'Save'}</span>
        </button>
        <button onClick={moveUp} title="Move up" style={iconBtn} className="transition hover:text-[#0A1733]">↑</button>
        <button onClick={moveDown} title="Move down" style={iconBtn} className="transition hover:text-[#0A1733]">↓</button>
        <button onClick={remove} title="Remove question" style={{ ...iconBtn, fontSize: 18 }} className="transition hover:text-[#C0392B]">×</button>
      </div>

      {/* Which objective an AI draft says this assesses. A question that names
          none of the topic's objectives is the one most likely to test what
          was never taught, so it is flagged for a look -- not removed. The
          teacher clears it by deciding: keep, edit, or delete. */}
      {q.ai_generated && q.off_objective && (
        <div role="status" className="flex items-start gap-2" style={{ marginTop: 10, padding: '8px 11px', fontSize: 12, lineHeight: 1.5, color: goldDeep, background: 'rgba(245,197,24,0.12)', border: '1px solid rgba(245,197,24,0.45)', borderRadius: 9 }}>
          <span aria-hidden="true">⚠</span>
          <span>
            <strong>Not tied to a listed objective</strong> — check this was taught before keeping it.
            {q.objective ? <> The AI says it assesses: <em>{q.objective}</em></> : null}
          </span>
          <button type="button" onClick={() => update({ off_objective: false })} title="I checked — this was taught" className="ml-auto transition hover:opacity-70" style={{ ...linkBtn, fontSize: 12, whiteSpace: 'nowrap' }}>
            It was taught
          </button>
        </div>
      )}
      {q.ai_generated && !q.off_objective && q.objective && (
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: faint, lineHeight: 1.5 }}>
          Assesses: {q.objective}
        </p>
      )}

      <textarea rows={2} placeholder="Question text" value={q.text} onChange={(e) => update({ text: e.target.value })} className="ak-input" style={{ ...fieldStyle, marginTop: 10, resize: 'vertical' }} />

      {q.qtype === 'mcq' && (
        <div className="mt-2 flex flex-col gap-1.5">
          {q.options.map((o, i) => (
            <div key={o._key} className="flex items-center gap-2">
              <input type="radio" name={`correct-${q._key}`} checked={o.is_correct} onChange={() => setOptions(q.options.map((x, j) => ({ ...x, is_correct: j === i })))} title="Correct answer" style={{ accentColor: navy, width: 16, height: 16 }} />
              <input placeholder={`Option ${i + 1}`} value={o.text} onChange={(e) => setOptions(q.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
              <button onClick={() => setOptions(q.options.filter((_, j) => j !== i))} disabled={q.options.length <= 2} title={`Remove option ${i + 1}`} aria-label={`Remove option ${i + 1}`} style={{ ...iconBtn, opacity: q.options.length <= 2 ? 0.3 : 1 }} className="transition hover:text-[#C0392B] disabled:cursor-not-allowed">×</button>
            </div>
          ))}
          <button onClick={() => setOptions([...q.options, { _key: newKey(), id: null, text: '', is_correct: false }])} className="transition hover:opacity-70" style={{ ...linkBtn, fontSize: 12.5, alignSelf: 'flex-start', marginTop: 2 }}>
            <span style={{ color: gold }}>+</span> Add option
          </button>
        </div>
      )}

      {/* Reads as the two choices the student is shown, with the radio marking
          the key -- the same shape as the MCQ editor above. Labelling them
          "True is correct" / "False is correct" made the answer key look like
          the question's choices, so an AI-drafted item appeared to be asking
          the student to pick between two statements about correctness. */}
      {q.qtype === 'true_false' && (
        <div className="mt-2 flex flex-col gap-1.5">
          <span style={{ fontSize: 11, color: faint }}>Select the correct answer</span>
          <div className="flex gap-4" style={{ fontSize: 13, color: '#3A4A6B' }}>
            {[true, false].map((v) => (
              <label key={String(v)} className="flex items-center gap-1.5" style={{ cursor: 'pointer' }}>
                <input type="radio" name={`tf-${q._key}`} checked={q.tfValue === v} onChange={() => update({ tfValue: v })} title="Correct answer" style={{ accentColor: navy, width: 16, height: 16 }} />
                {v ? 'True' : 'False'}
              </label>
            ))}
          </div>
        </div>
      )}

      {q.qtype === 'short_answer' && (
        <textarea rows={2} placeholder={'Accepted answers — one per line (case-insensitive)'} value={q.answersText} onChange={(e) => update({ answersText: e.target.value })} className="ak-input" style={{ ...fieldStyle, marginTop: 8, resize: 'vertical' }} />
      )}

      {q.qtype === 'matching' && (
        <div className="mt-2 flex flex-col gap-1.5">
          {q.pairs.map((p, i) => (
            <div key={p._key} className="flex items-center gap-2">
              <input placeholder="Left item" value={p.left} onChange={(e) => update({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
              <span style={{ color: faint }}>→</span>
              <input placeholder="Matches with" value={p.right} onChange={(e) => update({ pairs: q.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} className="ak-input" style={{ ...fieldStyle, flex: 1 }} />
              <button onClick={() => update({ pairs: q.pairs.filter((_, j) => j !== i) })} title={`Remove pair ${i + 1}`} aria-label={`Remove pair ${i + 1}`} style={iconBtn} className="transition hover:text-[#C0392B]">×</button>
            </div>
          ))}
          <button onClick={() => update({ pairs: [...q.pairs, { _key: newKey(), left: '', right: '' }] })} className="transition hover:opacity-70" style={{ ...linkBtn, fontSize: 12.5, alignSelf: 'flex-start', marginTop: 2 }}>
            <span style={{ color: gold }}>+</span> Add pair
          </button>
        </div>
      )}

      {q.qtype === 'essay' && (
        <textarea rows={2} placeholder="Grading rubric (what a full-credit answer includes)" value={q.rubric} onChange={(e) => update({ rubric: e.target.value })} className="ak-input" style={{ ...fieldStyle, marginTop: 8, resize: 'vertical' }} />
      )}
    </div>
  )
}

/**
 * The settings a teacher can still change once students are sitting the quiz.
 *
 * The whole builder is hidden after publishing, which is right for questions
 * and answer keys — editing those under someone mid-attempt would change the
 * paper they are being marked on. It is wrong for these two. Extending a
 * deadline and granting another attempt are exactly the things a teacher needs
 * during an exam, and unpublishing the quiz to reach them would throw every
 * student out of it.
 */
function LiveSettings({ quiz, refetch }) {
  const wasUnlimited = unlimitedAttempts(quiz)
  const [unlimited, setUnlimited] = useState(wasUnlimited)
  const [attemptsAllowed, setAttemptsAllowed] = useState(
    String(wasUnlimited ? 1 : quiz.attempts_allowed ?? 1),
  )
  const [closesAt, setClosesAt] = useState(quiz.closes_at?.slice(0, 16) ?? '')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const dirty =
    wasUnlimited !== unlimited ||
    (!unlimited && String(quiz.attempts_allowed ?? 1) !== attemptsAllowed) ||
    (quiz.closes_at?.slice(0, 16) ?? '') !== closesAt

  const [save, saving] = useAsyncAction(async () => {
    const parsed = Number(attemptsAllowed)
    if (!unlimited && (!Number.isFinite(parsed) || parsed < 1)) {
      setError('Attempts must be at least 1.')
      return
    }
    // Unlimited is bounded by the closing date and nothing else, so without
    // one the quiz never stops -- which is not what unlimited was asked for.
    if (unlimited && !closesAt) {
      setError('Unlimited attempts needs a closing date — that date is the only thing that ends the quiz.')
      return
    }
    setError(null)
    try {
      await updateDoc(doc(db, 'quizzes', quiz.id), {
        attempts_allowed: unlimited ? null : parsed,
        closes_at: closesAt || null,
        updated_at: serverTimestamp(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      refetch()
    } catch (err) {
      setError(err.message)
    }
  })

  return (
    <div className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 20 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Change while it is live</h3>
        <span style={{ fontSize: 12, color: faint }}>
          Questions and answer keys stay locked — students are sitting them.
        </span>
      </div>

      {error && <div className="mt-3"><AlertBox>{error}</AlertBox></div>}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div style={{ width: 130 }}>
          <label style={labelStyle}>Attempts</label>
          <input
            className="ak-input"
            type="number"
            min="1"
            max="10"
            value={unlimited ? '' : attemptsAllowed}
            placeholder={unlimited ? '∞' : undefined}
            disabled={unlimited}
            onChange={(e) => setAttemptsAllowed(e.target.value)}
            style={{ ...fieldStyle, ...mono, ...(unlimited ? { opacity: 0.45 } : null) }}
          />
        </div>
        <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#3A4A6B', cursor: 'pointer', marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
            style={{ accentColor: navy, width: 16, height: 16 }}
          />
          Unlimited attempts until it closes
        </label>
        <div style={{ minWidth: 230, flex: '0 1 260px' }}>
          <label style={labelStyle}>Closes</label>
          <input
            className="ak-input"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            style={fieldStyle}
          />
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ ...btnPrimary, padding: '12px 20px', marginBottom: 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span style={{ fontSize: 13, fontWeight: 700, color: green, marginBottom: 12 }}>Saved.</span>}
      </div>

      <p style={{ fontSize: 12.5, color: muted, margin: '12px 0 0', lineHeight: 1.5 }}>
        Raising the class-wide allowance never removes an individual grant — the two add up. To give
        one student another try, use <strong>+1 attempt</strong> on their row below.
      </p>
    </div>
  )
}

const thHead = { padding: '13px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: muted, letterSpacing: '0.06em', textTransform: 'uppercase' }

/**
 * Posts the class on screen into its gradebook column.
 *
 * Since 2026-09-13 the same sync also runs on its own when this view or the
 * class record opens (useAutoPostScores) -- the owner wanted quiz marks in
 * the record without a button. The button stays for the case in between:
 * a teacher who has just marked an essay and wants the record updated now,
 * without leaving. Pressing it twice is harmless -- the assessment row has
 * a derived id and merges. `auto` is the last automatic run, for the line
 * under the button.
 */
function PostScoresButton({ quiz, classId, auto }) {
  const mapping = quiz.class_mappings?.[classId]
  const [post, posting] = useAsyncAction(async () => {
    if (!mapping) {
      toast.error('This quiz has no grading component mapped for this class. Add the scores on the class record, or republish to map it.')
      return
    }
    try {
      const result = await syncQuizToClassRecord({ quiz, classId, mapping })
      if (result.skipped) toast.info(result.skipped)
      else toast.success(describeSyncResult(result))
    } catch (err) {
      toast.error(`Could not post to the class record: ${err.message}`)
    }
  })
  const autoLine =
    auto?.status === 'posting' ? 'Posting scores to the class record…'
    : auto?.skipped?.length ? auto.skipped.join(' ')
    : auto?.status === 'done' ? `Scores post to the class record on their own when this page or the record opens${auto.written ? ` — ${auto.written} posted just now` : ''}${auto.kept ? ` — ${auto.kept} kept as typed` : ''}.`
    : mapping ? null
    : 'Not mapped to a grading component for this class, so nothing posts on its own — republish to map it.'
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        onClick={post}
        disabled={posting}
        title="Write each student's best graded attempt into the class record now"
        className="transition hover:brightness-105 disabled:opacity-50"
        style={{ ...btnGhost, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: navy }}
      >
        {posting ? 'Posting…' : 'Post scores now'}
      </button>
      {autoLine && (
        <p role="status" style={{ fontSize: 11.5, color: auto?.skipped?.length ? goldDeep : faint, margin: 0, textAlign: 'right', maxWidth: 420, lineHeight: 1.45 }}>
          {autoLine}
        </p>
      )}
    </div>
  )
}

/**
 * End a sitting the student walked away from.
 *
 * The case this exists for: a student presses Start on an *untimed* quiz and
 * never submits. That attempt stays open forever, and because Start resumes an
 * open attempt rather than beginning a new one, it blocks them permanently. A
 * timed quiz recovers by itself -- reopening it past its deadline submits it --
 * so this is the manual equivalent for the case that cannot.
 *
 * The confirmation states how long it has been open and whether the clock has
 * run out, because that is the whole judgement: four minutes is someone still
 * working, yesterday is not. Discarding someone mid-sitting is the mistake this
 * dialog exists to prevent.
 */
function DiscardAttemptButton({ attempt, studentName, refetch }) {
  const { profile } = useAuth()
  const [discard, discarding] = useAsyncAction(async () => {
    const openFor = openForMs(attempt)
    const age = openFor == null ? 'an unknown length of time' : formatAway(openFor)
    const expired = hasExpired(attempt)
    if (!(await confirmDialog({
      title: `Discard ${studentName}'s attempt?`,
      message:
        `It has been open for ${age}${expired ? ', and its time has already run out' : ''}. ` +
        'Nothing they typed was ever saved to the server, so there is no work to lose — but if they ' +
        'are sitting it right now, they will lose the sitting. ' +
        'The attempt is kept on record as discarded, and their attempt is given back.',
      confirmLabel: 'Discard attempt',
      tone: 'danger',
    }))) return
    try {
      await discardAttempt(attempt.id, { teacherId: profile.id })
      toast.success(`${studentName}'s attempt was discarded. They can start again.`)
      refetch?.()
    } catch (err) {
      toast.error(`Could not discard the attempt: ${err.message}`)
    }
  })
  return (
    <button
      type="button"
      onClick={discard}
      disabled={discarding}
      title="End this open attempt and give the student their attempt back"
      className="transition hover:brightness-105 disabled:opacity-40"
      style={{ ...mono, fontSize: 11, fontWeight: 700, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.3)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {discarding ? '…' : 'Discard'}
    </button>
  )
}

/**
 * Give one student one more try.
 *
 * The answer to "they lost connection halfway through" and to a student asking
 * to retake. Additive and per-student, so it neither disturbs the rest of the
 * class nor gets wiped by a later change to the class-wide allowance.
 */
function GrantAttemptButton({ quizId, studentId, refetch }) {
  const [grant, granting] = useAsyncAction(async () => {
    try {
      await grantExtraAttempt(quizId, studentId)
      toast.success('One more attempt granted.')
      refetch?.()
    } catch (err) {
      toast.error(`Could not grant the attempt: ${err.message}`)
    }
  })
  return (
    <button
      type="button"
      onClick={grant}
      disabled={granting}
      title="Give this student one more attempt at this quiz"
      className="transition hover:brightness-105 disabled:opacity-40"
      style={{ ...mono, fontSize: 11, fontWeight: 700, color: navy, background: '#FFFFFF', border: `1.5px solid rgba(14,42,92,0.2)`, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}
    >
      {granting ? '…' : '+1 attempt'}
    </button>
  )
}

function ResultsView({ classId, quizId, quiz, totalPoints, assignedTo, refetch }) {
  const { data, isLoading } = useQuery({
    queryKey: ['fs-quiz-results', classId, quizId, Array.isArray(assignedTo) ? assignedTo.join(',') : 'all'],
    queryFn: async () => {
      const classSnap = await getDoc(doc(db, 'classes', classId))
      const ids = classSnap.data()?.student_ids ?? []
      const users = ids.length ? await fetchUsersByIds(ids) : []
      const students = users
        .filter((u) => !Array.isArray(assignedTo) || assignedTo.includes(u.id))
        .map((u) => ({ student_id: u.id, first_name: u.first_name, last_name: u.last_name }))
        .sort((a, b) =>
          `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`),
        )
      const attemptsSnap = await getDocs(
        query(collection(db, 'quiz_attempts'), where('quiz_id', '==', quizId), where('class_id', '==', classId)),
      )
      const attempts = {}
      attemptsSnap.forEach((d) => {
        const a = d.data()
        // filter attempts for this specific class
        if (a.class_id === classId) {
          ;(attempts[a.student_id] ??= []).push(a)
        }
      })
      return { students, attempts }
    },
    enabled: !!classId,
  })
  if (isLoading) return <p className="mt-4" style={{ color: faint }}>Loading results…</p>

  return (
    <div className="mt-4 overflow-x-auto" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }}>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'rgba(14,42,92,0.03)', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
            <th style={thHead}>Student</th>
            <th style={{ ...thHead, textAlign: 'center' }}>Attempts</th>
            <th style={{ ...thHead, textAlign: 'center' }}>Best Score</th>
            <th style={thHead}>Status</th>
            <th style={thHead}>Activity</th>
            <th style={thHead}></th>
          </tr>
        </thead>
        <tbody>
          {data.students.map((s) => {
            const studentAttempts = data.attempts[s.student_id] ?? []
            const finished = finishedAttempts(studentAttempts)
            const scores = finished.filter((a) => a.total_score != null).map((a) => a.total_score)
            const best = scores.length ? Math.max(...scores) : null
            const pendingEssay = finished.some((a) => a.status === 'submitted')
            const live = openAttempt(studentAttempts)
            /* The attempt worth reporting on: the one still open if there is
               one, otherwise the most recent finished one. */
            const notable = live ?? finished[finished.length - 1] ?? null
            const activity = [describeAttemptActivity(notable), describeFocus(notable)]
              .filter(Boolean)
              .join(' · ')
            const allowed = attemptsAllowedFor(quiz, s.student_id)
            const granted = Number(quiz?.extra_attempts?.[s.student_id]) || 0
            return (
              <tr key={s.student_id} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)' }}>
                <td style={{ padding: '12px 18px', fontWeight: 700, color: ink }}>{s.last_name}, {s.first_name}</td>
                <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', color: '#3A4A6B' }}>
                  {finished.length || '—'}
                  <span
                    style={{ color: faint }}
                    title={Number.isFinite(allowed) ? undefined : 'Unlimited attempts until the quiz closes'}
                  >
                    {' '}/ {attemptsLabel(allowed)}
                  </span>
                  {granted > 0 && (
                    <span title={`You granted ${granted} extra attempt(s)`} style={{ color: green, fontSize: 11 }}> +{granted}</span>
                  )}
                </td>
                <td style={{ ...mono, padding: '12px 18px', textAlign: 'center', fontWeight: 700, color: best !== null ? ink : faint }}>
                  {best !== null ? `${best} / ${totalPoints}` : '—'}
                </td>
                <td style={{ padding: '12px 18px', color: muted }}>
                  {live ? (
                    <>
                      Taking it now
                      {/* The number the discard decision turns on. */}
                      {openForMs(live) != null && (
                        <span style={{ ...mono, fontSize: 11, color: faint, display: 'block' }}>
                          open {formatAway(openForMs(live))}
                        </span>
                      )}
                    </>
                  ) : finished.length === 0 ? 'Not taken' : pendingEssay ? 'Essay pending review' : 'Graded'}
                </td>
                {/* Reopens and away-events, stated as observations. A dropped
                    connection and a deliberate walk-away look identical from
                    here, so the wording describes rather than accuses. */}
                <td style={{ padding: '12px 18px', fontSize: 12, color: activity ? goldDeep : faint }}>
                  {activity || '—'}
                </td>
                <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Only for an attempt that is actually open — there is
                        nothing to discard otherwise, and the button would read
                        as "delete this result". */}
                    {live && (
                      <DiscardAttemptButton
                        attempt={live}
                        studentName={`${s.first_name} ${s.last_name}`}
                        refetch={refetch}
                      />
                    )}
                    <GrantAttemptButton quizId={quizId} studentId={s.student_id} refetch={refetch} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* One class's gradebook is ready to take scores. The publish notice and the hint
   beside the class checkbox have to agree about that, so they read it here
   instead of each spelling the condition out. */
function hasGradeConfig(gb) {
  return Boolean(gb?.configured && gb.components?.length && gb.periods?.length)
}

function PublishModal({ isOpen, onClose, assignedClasses, gradebooksMap, onConfirm, isPublishing }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { open: isOpen, label: 'Publish quiz', closeOnBackdrop: false })
  const [mappings, setMappings] = useState({})
  const [error, setError] = useState(null)
  /* The class whose Grade Config is missing, not just its name in a sentence.
     "Please go to Grade Config" was the whole instruction, and the teacher had
     to find the page, then find this class inside it, then come back -- which
     is how a publish that refuses for a real reason still reads as "I press
     Publish and nothing happens". Holding the id lets the notice carry a link
     to the one page that fixes it. */
  const [unconfigured, setUnconfigured] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const initial = {}
    let err = null
    let blocked = null
    for (const c of assignedClasses) {
      const gb = gradebooksMap?.[c.id]
      if (!hasGradeConfig(gb)) {
        err = `Class "${c.section} · ${c.subject}" has no Grade Config yet, so there is nowhere to record the scores. Set its components and grading periods, then publish.`
        blocked = blocked ?? c
        continue
      }
      // Pre-filled from the component's name -- Quizzes or Written Works
      // when one is called that, the first unlocked period -- rather than
      // whatever component happens to be listed first (lib/recordMapping.js,
      // owner decision 2026-09-13). Still a select the teacher can change.
      initial[c.id] = suggestMapping(gb, 'quiz')
    }
    setMappings(initial)
    setError(err)
    setUnconfigured(blocked)
  }, [isOpen, assignedClasses, gradebooksMap])

  if (!isOpen) return null

  const handleConfirm = () => {
    for (const c of assignedClasses) {
      if (!mappings[c.id]?.component_id || !mappings[c.id]?.grading_period_id) {
        setError(`Please map the grading component and period for "${c.section}".`)
        return
      }
    }
    onConfirm(mappings)
  }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div {...panelProps} style={{ width: '100%', maxWidth: 500, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Publish Quiz</h2>
        </div>
        <div style={{ padding: '24px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: 0 }}>
            Map this quiz to a grading component and grading period for each assigned class to create score records in their gradebooks.
          </p>
          {error && (
            <AlertBox>
              {error}
              {unconfigured && (
                <div style={{ marginTop: 8 }}>
                  <Link
                    to={`/teacher/classes/${unconfigured.id}/grading`}
                    style={{ color: blueText, fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Open Grade Config for {unconfigured.section} →
                  </Link>
                </div>
              )}
            </AlertBox>
          )}

          {!error && assignedClasses.map((c) => {
            const gb = gradebooksMap?.[c.id]
            const current = mappings[c.id] || {}
            return (
              <div key={c.id} style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 14 }} className="space-y-3">
                <div style={{ fontWeight: 700, color: ink, fontSize: 14 }}>{c.section} · {c.subject}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Grading Component</label>
                    <select
                      className="ak-input w-full"
                      value={current.component_id || ''}
                      onChange={(e) => setMappings({ ...mappings, [c.id]: { ...current, component_id: e.target.value } })}
                      style={{ ...fieldStyle, fontSize: 13, padding: '8px 10px' }}
                    >
                      {gb?.components?.map((comp) => (
                        <option key={comp.id} value={comp.id}>{comp.name} ({comp.weight_percent}%)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>Grading Period</label>
                    <select
                      className="ak-input w-full"
                      value={current.grading_period_id || ''}
                      onChange={(e) => setMappings({ ...mappings, [c.id]: { ...current, grading_period_id: e.target.value } })}
                      style={{ ...fieldStyle, fontSize: 13, padding: '8px 10px' }}
                    >
                      {gb?.periods?.map((per) => (
                        <option key={per.id} value={per.id}>{per.name} ({per.weight_percent}%)</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={isPublishing} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} disabled={isPublishing || !!error || assignedClasses.length === 0} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnModalPrimary}>
            {isPublishing ? 'Publishing…' : 'Publish Quiz'}
            <GoldArrow />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Why an unlimited quiz cannot be published as configured, or null.
 *
 * Unlimited attempts is bounded by the closing date and nothing else, so
 * without one the quiz never stops -- which is not what unlimited was asked
 * for. And an unlimited quiz has no last attempt, so results set to open
 * "after all attempts" would never open; `renderFeedback` would release them
 * after the first sitting instead, silently. Both block publishing rather
 * than saving, like the pool and feedback checks: a draft may be
 * half-configured, a quiz students can sit may not.
 */
function attemptsProblem(settings) {
  if (!settings?.attempts_unlimited) return null
  if (!settings.closes_at) {
    return 'Unlimited attempts needs a closing date — that date is the only thing that ends this quiz.'
  }
  if (settings.feedback_release === RELEASE_AFTER_ATTEMPTS) {
    return 'Unlimited attempts has no last attempt, so results set to open after all attempts would never open. Release them as soon as they submit, or when the quiz closes.'
  }
  return null
}

/**
 * Who a quiz is assigned to, named rather than counted.
 *
 * The header used to read "assigned to 1 class" while holding the class
 * objects it was counting -- the tester asked for the name and the subject
 * instead, the way the LMS his school uses says it. One class gets both, in
 * the ` · ` form this file already uses for a class. Several get the count
 * first, so it is never lost, then as many sections as read cleanly: subjects
 * differ across classes and repeating them turns the line into a paragraph.
 */
function describeAssignment(assignedClasses) {
  const names = assignedClasses.map((c) => c.section).filter(Boolean)
  if (names.length === 0) return { lead: 'not assigned', names: null }
  if (names.length === 1) {
    const one = assignedClasses[0]
    return { lead: 'assigned to', names: one.subject ? `${one.section} · ${one.subject}` : one.section }
  }
  const lead = `assigned to ${names.length} classes:`
  if (names.length <= 3) {
    return { lead, names: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` }
  }
  return { lead, names: `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` }
}

function BuilderForm({ quiz, classes, gradebooksMap, refetch, syllabi }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const initialSettings = {
    title: quiz.title,
    // The sub-module the quiz is filed under. Kept in settings so a change
    // counts as unsaved like any other; module_id and syllabus_id are derived
    // from it at save time (lib/quizTopics.js), never edited on their own.
    topic_id: quiz.topic_id ?? '',
    instructions: quiz.instructions ?? '',
    time_limit_minutes: quiz.time_limit_minutes ?? '',
    attempts_allowed: unlimitedAttempts(quiz) ? 1 : quiz.attempts_allowed ?? 1,
    // Derived from attempts_allowed on load and folded back into it on save;
    // never stored as a field of its own.
    attempts_unlimited: unlimitedAttempts(quiz),
    shuffle_questions: quiz.shuffle_questions ?? false,
    shuffle_options: quiz.shuffle_options ?? false,
    prevent_backtracking: quiz.prevent_backtracking ?? false,
    opens_at: quiz.opens_at?.slice(0, 16) ?? '',
    closes_at: quiz.closes_at?.slice(0, 16) ?? '',
    // Defaults match what the product did before these settings existed, so
    // opening and re-saving an old quiz cannot change what it reveals or how
    // it is marked.
    feedback_release: quiz.feedback_release ?? RELEASE_IMMEDIATE,
    feedback_detail: quiz.feedback_detail ?? DETAIL_RATIONALE,
    scoring_attempt: quiz.scoring_attempt ?? 'best',
    pool_enabled: quiz.pool_enabled ?? false,
    pool_draw_count: quiz.pool_draw_count ?? '',
  }
  const initialClassIds = quiz.class_ids ?? []
  const initialQuestions = (quiz.questions ?? []).map(toEditable)

  const [settings, setSettings] = useState(initialSettings)
  const [assignedClassIds, setAssignedClassIds] = useState(initialClassIds)
  const [questions, setQuestions] = useState(initialQuestions)
  /* What was last written to Firestore. Compared against the live form to
     decide whether leaving costs the teacher anything -- see builderSnapshot
     for why this is a snapshot rather than a flag flipped by every onChange.
     State rather than a ref because `dirty` is read during render, and it has
     to re-render the Save row the moment a save lands. BuilderForm is keyed on
     quiz.id, so this resets per quiz. */
  const [savedSnapshot, setSavedSnapshot] = useState(
    () => builderSnapshot(initialSettings, initialClassIds, initialQuestions),
  )
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)

  const dirty = builderSnapshot(settings, assignedClassIds, questions) !== savedSnapshot

  /* The Syllabus topic options come from the assigned classes' syllabi, read
     the same way every other teacher-side screen reads them (DATA-MODEL.md
     rule 3): `syllabi/{class.syllabus_id}` when the class has one -- already
     in the `syllabi` list, so resolved synchronously here, no read -- else
     the seed's `classes/{id}/syllabus/current`, one read per such class
     through a query keyed on exactly those ids. The split matters: a query
     that closed over `syllabi` cached its first, empty run and BSIT-C's
     topics never appeared. */
  const sortedClassIds = [...assignedClassIds].sort()
  const ownSyllabusByClass = {}
  const fallbackIds = []
  for (const cid of sortedClassIds) {
    const clazz = classes.find((c) => c.id === cid)
    const own = clazz?.syllabus_id ? syllabi.find((sy) => sy.id === clazz.syllabus_id) : null
    if (own) ownSyllabusByClass[cid] = { id: own.id, data: own }
    else fallbackIds.push(cid)
  }
  const { data: fallbackByClass = {} } = useQuery({
    queryKey: ['fs-quiz-editor-class-syllabus', fallbackIds],
    queryFn: async () => {
      const out = {}
      await Promise.all(fallbackIds.map(async (cid) => {
        try {
          const cur = await getDoc(doc(db, 'classes', cid, 'syllabus', 'current'))
          out[cid] = { id: null, data: cur.exists() ? cur.data() : null }
        } catch {
          out[cid] = { id: null, data: null }
        }
      }))
      return out
    },
    enabled: fallbackIds.length > 0,
  })
  const syllabusByClass = { ...fallbackByClass, ...ownSyllabusByClass }
  const topicChoices = topicOptions(assignedClassIds, classes, syllabusByClass)
  // A topic the quiz carries that is not among the options: the class it came
  // from is not ticked. Shown as its own row, kept on save, so unticking a
  // class does not silently unfile the quiz.
  const topicOrphaned = !!settings.topic_id && !topicChoices.some((t) => t.id === settings.topic_id)

  /* Everything below exists because the most expensive thing this screen can
     do is lose questions a teacher typed by hand. Authoring a quiz is twenty
     minutes of work that lives only in React state until Save draft is
     pressed, and there was nothing between that state and a stray click. */

  // Reload, tab close, and navigation out of the SPA. The browser shows its
  // own wording; assigning returnValue is what still arms it in Chrome.
  useEffect(() => {
    if (!dirty) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  /* In-app navigation -- the sidebar, the breadcrumb, any <Link> on the page.
     React Router's own useBlocker needs a data router and main.jsx mounts
     <BrowserRouter>, so this intercepts the click instead: capture phase, so
     it runs before Link's handler and can stop the navigation rather than
     undo it. Only armed while there is something to lose. */
  useEffect(() => {
    if (!dirty) return
    const intercept = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = e.target.closest?.('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href')
      // In-app routes only: '//host' is another origin, and a link back to
      // this same quiz is not leaving.
      if (!href?.startsWith('/') || href.startsWith('//') || href === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      confirmDialog({
        title: 'Leave without saving?',
        message: 'This quiz has changes that have not been saved. Leaving now discards them.',
        confirmLabel: 'Discard changes',
        tone: 'danger',
      }).then((leave) => {
        if (leave) navigate(href)
      })
    }
    document.addEventListener('click', intercept, true)
    return () => document.removeEventListener('click', intercept, true)
  }, [dirty, navigate])

  // Goes through the same path as auto-banking, so one 💾 click and a whole
  // generated quiz obey the same duplicate rule. It used to file the question
  // under topic_id alone, which left it in the bank browser's Uncategorized
  // folder even when the quiz belonged to a syllabus.
  const handleSaveToBank = async (q) => {
    try {
      const result = await bankQuestions({
        teacherId: profile.id,
        questions: [toPayload(q)],
        topicId: quiz.topic_id || null,
        syllabusId: quiz.syllabus_id || null,
        origin: q.ai_generated ? 'ai_generated' : 'manual',
        sourceQuizId: quiz.id ?? null,
      })
      const message = describeBankResult(result)
      if (result.saved) toast.success(message)
      else toast.info(message)
    } catch (err) {
      toast.error(`Could not save to the bank: ${err.message}`)
    }
  }

  const set = (key) => (e) =>
    setSettings((s) => ({ ...s, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0)

  /* Shown while editing rather than only on publish: a pool whose points do
     not match is fixed by editing the questions right below this panel, and
     finding that out only when the Publish button refuses is a worse loop. */
  const poolWarning = poolProblem({ ...settings, questions: questions.map(toPayload) })
  const feedbackWarning = feedbackProblem(settings)
  const attemptsWarning = attemptsProblem(settings)

  const toggleClass = (id) => {
    setAssignedClassIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function persist(extra = {}) {
    const payload = {
      title: settings.title,
      instructions: settings.instructions,
      time_limit_minutes: settings.time_limit_minutes ? Number(settings.time_limit_minutes) : null,
      attempts_allowed: settings.attempts_unlimited ? null : Number(settings.attempts_allowed) || 1,
      shuffle_questions: !!settings.shuffle_questions,
      shuffle_options: !!settings.shuffle_options,
      prevent_backtracking: !!settings.prevent_backtracking,
      opens_at: settings.opens_at || null,
      closes_at: settings.closes_at || null,
      feedback_release: settings.feedback_release,
      feedback_detail: settings.feedback_detail,
      scoring_attempt: settings.scoring_attempt,
      pool_enabled: !!settings.pool_enabled,
      pool_draw_count: settings.pool_enabled ? Number(settings.pool_draw_count) || null : null,
      class_ids: assignedClassIds,
      questions: questions.map(toPayload),
      ...topicPatch(settings.topic_id, topicChoices, quiz),
      ...extra,
    }

    await updateDoc(doc(db, 'quizzes', quiz.id), {
      ...payload,
      updated_at: serverTimestamp(),
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await persist()
      setSavedSnapshot(builderSnapshot(settings, assignedClassIds, questions))
      refetch()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Refuse to publish, where the teacher is looking.
   *
   * The inline banner renders at the top of the form and Publish sits below
   * the last question, so on any quiz worth publishing the two are a screenful
   * or more apart. Setting only the banner is why "I press Publish and nothing
   * happens" was reported as a manually-created quiz being unpublishable: the
   * refusal was real, correct, and off-screen. The toast is the part the
   * teacher actually sees; the banner stays for the detail.
   */
  function refusePublish(message) {
    setError(message)
    toast.error(message)
  }

  async function publish() {
    // Reachable by keyboard even though the button is disabled, and silence
    // here reads exactly like the bug above.
    if (questions.length === 0) {
      refusePublish('Add at least one question before publishing.')
      return
    }
    if (assignedClassIds.length === 0) {
      refusePublish('Assign this quiz to at least one class before publishing — use "Assign to Classes" above.')
      return
    }
    /* Both are recoverable-by-editing problems, so they block publishing
       rather than saving: a draft is allowed to be half-configured, a quiz
       students can sit is not. */
    if (poolWarning) {
      refusePublish(poolWarning)
      return
    }
    if (feedbackWarning) {
      refusePublish(feedbackWarning)
      return
    }
    if (attemptsWarning) {
      refusePublish(attemptsWarning)
      return
    }
    // Open publish mapping modal
    setIsPublishModalOpen(true)
  }

  async function handleConfirmPublish(classMappings) {
    setIsPublishModalOpen(false)
    setPublishing(true)
    setError(null)
    try {
      // First save draft state changes to both db
      await persist()

      await updateDoc(doc(db, 'quizzes', quiz.id), {
        status: 'published',
        published_at: serverTimestamp(),
        class_mappings: classMappings,
      })
      // Everything on screen is now in Firestore, so leaving costs nothing and
      // the unsaved-changes guard must stand down before the view swaps to the
      // published one.
      setSavedSnapshot(builderSnapshot(settings, assignedClassIds, questions))

      // What the mapping was always collected for. The row is created now,
      // empty, so the quiz appears in the record the moment it is published
      // rather than only once someone has taken it -- and the teacher can see
      // the column their scores are going to land in.
      const synced = await syncQuizToAllRecords({
        quiz: { id: quiz.id, title: settings.title, questions: questions.map(toPayload) },
        classMappings,
      })
      if (synced.skipped.length) toast.info(`Published. ${synced.skipped.join(' ')}`)
      else toast.success('Published and added to the class record.')

      refetch()
    } catch (err) {
      // The mapping modal has closed by now, so the banner alone would be the
      // same invisible refusal the validation above had.
      refusePublish(err.message)
    } finally {
      setPublishing(false)
    }
  }

  const [removeDraft, removingDraft] = useAsyncAction(deleteQuiz)

  async function deleteQuiz() {
    if (!(await confirmDialog({
      title: 'Delete this draft quiz?',
      message: 'It has never been published, so no student has seen it. This cannot be undone.',
      confirmLabel: 'Delete draft',
      tone: 'danger',
    }))) return
    try {
      await deleteDoc(doc(db, 'quizzes', quiz.id))
      navigate(`/teacher/quizzes`)
    } catch (err) {
      setError(err.message)
    }
  }

  const assignedClassesList = classes.filter(c => assignedClassIds.includes(c.id))

  return (
    <div>
      {error && (
        <p className="mt-4" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{error}</p>
      )}
      {saved && (
        <p className="mt-4" style={{ fontSize: 13, color: green, background: 'rgba(31,138,91,0.08)', border: '1px solid rgba(31,138,91,0.35)', borderRadius: 10, padding: '10px 12px' }}>Quiz saved.</p>
      )}

      <div className="mt-4 flex flex-col gap-3" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label style={labelStyle}>Title</label>
            <input className="ak-input" value={settings.title} onChange={set('title')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Time limit</label>
            <select className="ak-input" value={settings.time_limit_minutes} onChange={set('time_limit_minutes')} style={{ ...fieldStyle, cursor: 'pointer' }}>
              <option value="">No time limit</option>
              {timeLimitOptions(settings.time_limit_minutes).map((minutes) => (
                <option key={minutes} value={minutes}>{minutes} minutes</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Syllabus topic</label>
          <select
            className="ak-input"
            value={settings.topic_id}
            onChange={set('topic_id')}
            disabled={assignedClassIds.length === 0}
            style={{ ...fieldStyle, cursor: assignedClassIds.length ? 'pointer' : 'not-allowed', opacity: assignedClassIds.length ? 1 : 0.55 }}
          >
            <option value="">— Not filed under a sub-module —</option>
            {topicOrphaned && (
              <option value={settings.topic_id}>Current topic (its class is not assigned below)</option>
            )}
            {topicChoices.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: muted, margin: '6px 0 0', lineHeight: 1.5 }}>
            {assignedClassIds.length === 0
              ? 'Assign a class below first — the sub-modules come from its syllabus.'
              : topicChoices.length === 0
                ? 'The assigned class has no syllabus yet, so there is nothing to file this under.'
                : 'Files the quiz under this sub-module on the Modules tab and Scaffold Topics, and in the student’s review guide. Any quiz — generated or written by hand — can be moved here.'}
          </p>
        </div>
        <div>
          <label style={labelStyle}>Instructions (optional)</label>
          <input className="ak-input" value={settings.instructions} onChange={set('instructions')} style={fieldStyle} />
        </div>
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
          <div>
            <label style={labelStyle}>Attempts</label>
            <input
              className="ak-input"
              type="number"
              min="1"
              max="10"
              value={settings.attempts_unlimited ? '' : settings.attempts_allowed}
              placeholder={settings.attempts_unlimited ? '∞' : undefined}
              disabled={settings.attempts_unlimited}
              onChange={set('attempts_allowed')}
              style={{ ...fieldStyle, ...(settings.attempts_unlimited ? { opacity: 0.45 } : null) }}
            />
            <label className="flex items-center gap-2" style={{ fontSize: 12, color: '#3A4A6B', cursor: 'pointer', marginTop: 6 }}>
              <input type="checkbox" checked={settings.attempts_unlimited} onChange={set('attempts_unlimited')} style={{ accentColor: navy, width: 15, height: 15 }} />
              Unlimited until it closes
            </label>
          </div>
          <div>
            <label style={labelStyle}>Opens</label>
            <input className="ak-input" type="datetime-local" value={settings.opens_at} onChange={set('opens_at')} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Closes</label>
            <input className="ak-input" type="datetime-local" value={settings.closes_at} onChange={set('closes_at')} style={fieldStyle} />
          </div>
          {/* The sentence the Quizzes page's cards and the student's screens
              print for this window (lib/deliverables.js), read off the
              unsaved fields so the teacher sees what a date will say before
              saving it. The quiz's status still counts: one closed by hand
              reads Closed whatever the dates are. */}
          <p className="col-span-2 sm:col-span-4" style={{ fontSize: 12, color: muted, margin: '-4px 0 0', lineHeight: 1.5 }}>
            Students will read this as{' '}
            <strong style={{ color: ink }}>
              {describeWindow(fromQuiz({ ...quiz, opens_at: settings.opens_at || null, closes_at: settings.closes_at || null }, { classId: assignedClassIds[0] ?? '' }))}
            </strong>
            {' '}— the same line the Quizzes page shows.
          </p>
          <div className="flex flex-col gap-2 pb-2">
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#3A4A6B', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.shuffle_questions} onChange={set('shuffle_questions')} style={{ accentColor: navy, width: 16, height: 16 }} />
              Shuffle questions
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#3A4A6B', cursor: 'pointer' }} title="Reorders the choices within each multiple-choice question">
              <input type="checkbox" checked={settings.shuffle_options} onChange={set('shuffle_options')} style={{ accentColor: navy, width: 16, height: 16 }} />
              Shuffle options
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#3A4A6B', cursor: 'pointer' }}>
              <input type="checkbox" checked={settings.prevent_backtracking} onChange={set('prevent_backtracking')} style={{ accentColor: navy, width: 16, height: 16 }} />
              Prevent backtracking
            </label>
          </div>
        </div>

        {/* Delivery, marking and feedback.
            Kept as one block rather than folded into the grid above because
            these four decide what the quiz *is* — how it is drawn, how it is
            marked, and what comes back — while the fields above are only when
            and how long. */}
        <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }} className="flex flex-col gap-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label style={labelStyle}>Marks count from</label>
              <select className="ak-input" value={settings.scoring_attempt} onChange={set('scoring_attempt')} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {SCORING_POLICIES.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
                {SCORING_POLICIES.find((sp) => sp.id === settings.scoring_attempt)?.hint}
              </p>
            </div>
            <div>
              <label style={labelStyle}>Release results</label>
              <select className="ak-input" value={settings.feedback_release} onChange={set('feedback_release')} style={{ ...fieldStyle, cursor: 'pointer' }}>
                {RELEASE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11.5, color: faint, margin: '6px 0 0' }}>
                {RELEASE_OPTIONS.find((r) => r.id === settings.feedback_release)?.hint}
              </p>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Students see</label>
            <select className="ak-input" value={settings.feedback_detail} onChange={set('feedback_detail')} disabled={settings.feedback_release === 'never'} style={{ ...fieldStyle, cursor: 'pointer', opacity: settings.feedback_release === 'never' ? 0.5 : 1 }}>
              {DETAIL_OPTIONS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* The two dropdowns combine into something neither of them says on
              its own, so state the result rather than leave it to be inferred. */}
          <p style={{ fontSize: 12.5, color: ink, background: 'rgba(63,169,245,0.06)', border: '1px solid rgba(63,169,245,0.25)', borderRadius: 10, padding: '9px 12px', margin: 0 }}>
            {describeFeedback(settings)}
          </p>
          {feedbackWarning && <AlertBox tone="warn">{feedbackWarning}</AlertBox>}
          {attemptsWarning && <AlertBox tone="warn">{attemptsWarning}</AlertBox>}

          <label className="flex items-start gap-2.5" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.pool_enabled} onChange={set('pool_enabled')} style={{ accentColor: navy, width: 16, height: 16, marginTop: 2 }} />
            <span>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: ink }}>Draw a random subset for each student</span>
              <span style={{ display: 'block', fontSize: 11.5, color: faint, marginTop: 2 }}>
                The questions below become a pool. Every student gets a different paper from it, stable if they refresh.
              </span>
            </span>
          </label>

          {settings.pool_enabled && (
            <div className="flex flex-wrap items-end gap-3" style={{ paddingLeft: 26 }}>
              <div style={{ width: 150 }}>
                <label style={labelStyle}>Questions to draw</label>
                <input
                  className="ak-input"
                  type="number"
                  min="1"
                  max={questions.length || 1}
                  value={settings.pool_draw_count}
                  onChange={set('pool_draw_count')}
                  style={{ ...fieldStyle, ...mono }}
                />
              </div>
              <p style={{ fontSize: 12.5, color: muted, margin: '0 0 10px', flex: 1, minWidth: 200 }}>
                Pool of {questions.length}. Each paper is marked out of{' '}
                <strong style={{ ...mono, color: ink }}>{drawTotalPoints({ ...settings, questions: questions.map(toPayload) })}</strong>.
              </p>
            </div>
          )}
          {poolWarning && <AlertBox tone="warn">{poolWarning}</AlertBox>}
        </div>

        {/* Class assignments checklist */}
        <div style={{ borderTop: `1px solid ${line}`, paddingTop: 14 }}>
          <label style={labelStyle}>Assign to Classes</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto border border-slate-100 p-2 rounded-lg">
            {classes.map((clazz) => {
              const checked = assignedClassIds.includes(clazz.id)
              /* Said here rather than only at Publish. Ticking a class with no
                 Grade Config refuses the quiz at the very last step, which reads
                 as "I press Publish and nothing happens" -- this is that same
                 refusal, one screen earlier and next to the thing causing it.
                 `gradebooksMap` is undefined until the gradebooks arrive: no tag
                 while it is, or every class is accused as the page settles. */
              const needsConfig = gradebooksMap && !hasGradeConfig(gradebooksMap[clazz.id])
              return (
                <div key={clazz.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggleClass(clazz.id)} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
                    <span className="truncate">{clazz.section} · {clazz.subject}</span>
                  </label>
                  {needsConfig && (
                    <Link
                      to={`/teacher/classes/${clazz.id}/grading`}
                      className="shrink-0 underline"
                      style={{ color: goldDeep, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      no Grade Config yet →
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>
          Questions <span style={{ ...mono, fontSize: 13, color: faint, fontWeight: 400 }}>({questions.length} · {totalPoints} pts)</span>
        </h3>
      </div>

      {questions.map((q, i) => (
        <QuestionCard
          key={q._key}
          q={q}
          index={i}
          update={(patch) => setQuestions(questions.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
          remove={() => setQuestions(questions.filter((_, j) => j !== i))}
          moveUp={() => i > 0 && setQuestions(questions.map((x, j) => (j === i - 1 ? questions[i] : j === i ? questions[i - 1] : x)))}
          moveDown={() => i < questions.length - 1 && setQuestions(questions.map((x, j) => (j === i ? questions[i + 1] : j === i + 1 ? questions[i] : x)))}
          saveToBank={() => handleSaveToBank(q)}
        />
      ))}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pb-8">
        <div className="flex gap-2.5">
          <button onClick={() => setQuestions([...questions, blankQuestion()])} className="transition hover:brightness-105" style={btnGhost}>
            <span style={{ color: gold }}>+</span> Add question
          </button>
          <button onClick={() => setIsImportModalOpen(true)} className="transition hover:brightness-105" style={btnGhost}>
            📚 Import from Bank
          </button>
          <button onClick={removeDraft} disabled={removingDraft} className="transition hover:brightness-105 disabled:opacity-50" style={btnDanger}>
            {removingDraft ? 'Deleting…' : 'Delete draft'}
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Next to Save draft rather than at the top of the form: this is
              where a teacher looks when they are deciding whether they are
              finished, and it is the one place the answer is actionable. */}
          {dirty && !saving && (
            <span style={{ ...mono, fontSize: 11.5, color: goldDeep }}>Unsaved changes</span>
          )}
          {/* Says why Publish will refuse before it is pressed. The refusal
              itself now toasts, but a reason shown up front is a better loop
              than a reason shown after a click. */}
          {!dirty && assignedClassIds.length === 0 && questions.length > 0 && (
            <span style={{ ...mono, fontSize: 11.5, color: faint }}>Assign a class to publish</span>
          )}
          <button onClick={save} disabled={saving} className="transition hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed" style={btnGhost}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={publish} disabled={saving || publishing || questions.length === 0} className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed" style={btnPrimary}>
            {publishing ? 'Publishing…' : 'Publish'}
            <GoldArrow />
          </button>
        </div>
      </div>

      <PublishModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        assignedClasses={assignedClassesList}
        gradebooksMap={gradebooksMap}
        onConfirm={handleConfirmPublish}
        isPublishing={publishing}
      />

      <ImportFromBankModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        syllabi={syllabi}
        onImport={(importedQuestions) => {
          const formatted = importedQuestions.map(q => ({
            ...toEditable(q),
            id: null
          }))
          setQuestions(prev => [...prev, ...formatted])
        }}
      />
    </div>
  )
}

function ImportFromBankModal({ isOpen, onClose, syllabi, onImport }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { open: isOpen, label: 'Import questions from the quiz bank', closeOnBackdrop: false })
  const [selectedNode, setSelectedNode] = useState({ type: 'uncategorized' })
  const [expandedSyllabi, setExpandedSyllabi] = useState({})
  const [expandedModules, setExpandedModules] = useState({})
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  const toggleSyllabus = (id) => {
    setExpandedSyllabi(prev => ({ ...prev, [id]: !prev[id] }))
  }
  const toggleModule = (id) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const { data: allBankedQuestions = [], isLoading } = useBankedQuestions({ enabled: isOpen })
  const bankedQuestions = filterBankedQuestions(allBankedQuestions, selectedNode)

  if (!isOpen) return null

  const filteredQuestions = bankedQuestions.filter(q => {
    const term = search.toLowerCase().trim()
    if (!term) return true
    const textMatch = q.text.toLowerCase().includes(term)
    const tagMatch = q.tags?.toLowerCase().includes(term)
    return textMatch || tagMatch
  })

  const toggleSelect = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleImport = () => {
    const selected = bankedQuestions.filter(q => selectedIds.includes(q.id))
    onImport(selected)
    setSelectedIds([])
    onClose()
  }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div {...panelProps} style={{ width: '100%', maxWidth: 760, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Import Questions from Quiz Bank</h2>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Sidebar */}
          <div className="w-56 border-r border-slate-100 p-4 overflow-y-auto">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Folders</h4>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedNode({ type: 'uncategorized' })}
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-xs font-semibold transition ${
                  selectedNode.type === 'uncategorized'
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>📦</span>
                <span>Uncategorized</span>
              </button>

              {syllabi.map(s => {
                const isExpanded = !!expandedSyllabi[s.id]
                const isSelected = selectedNode.type === 'syllabus' && selectedNode.syllabusId === s.id
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedNode({ type: 'syllabus', syllabusId: s.id })}
                        className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-xs font-semibold transition min-w-0 ${
                          isSelected
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span>📚</span>
                        <span className="truncate text-xs">{s.title}</span>
                      </button>
                      {s.modules?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleSyllabus(s.id)}
                          aria-expanded={!!expandedSyllabi[s.id]}
                          title={expandedSyllabi[s.id] ? `Collapse ${s.title}` : `Expand ${s.title}`}
                          aria-label={expandedSyllabi[s.id] ? `Collapse ${s.title}` : `Expand ${s.title}`}
                          className="p-0.5 hover:bg-slate-100 rounded text-slate-400 flex-shrink-0"
                        >
                          <span className={`block text-[8px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                        </button>
                      )}
                    </div>

                    {isExpanded && s.modules?.map(m => {
                      const isModExpanded = !!expandedModules[m.id]
                      return (
                        <div key={m.id} className="pl-3 space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 min-w-0">
                            <span className="text-[10px] font-bold text-slate-400 truncate py-1 flex-1 min-w-0">
                              📂 {m.title}
                            </span>
                            {m.topics?.length > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleModule(m.id)}
                                aria-expanded={!!expandedModules[m.id]}
                                title={expandedModules[m.id] ? `Collapse ${m.title}` : `Expand ${m.title}`}
                                aria-label={expandedModules[m.id] ? `Collapse ${m.title}` : `Expand ${m.title}`}
                                className="p-0.5 hover:bg-slate-100 rounded text-slate-400 flex-shrink-0"
                              >
                                <span className={`block text-[6px] transition-transform duration-200 ${isModExpanded ? 'rotate-90' : ''}`}>
                                  ▶
                                </span>
                              </button>
                            )}
                          </div>

                          {isModExpanded && m.topics?.map(t => {
                            const isTopicSelected = selectedNode.type === 'topic' && selectedNode.topicId === t.id
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedNode({ type: 'topic', topicId: t.id, syllabusId: s.id })}
                                className={`w-full pl-4 pr-1 py-1 rounded text-left text-[11px] font-medium transition truncate block min-w-0 ${
                                  isTopicSelected
                                    ? 'text-indigo-600 bg-indigo-50/50 font-semibold'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                              >
                                📄 {t.title}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Main Area */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
            <input
              placeholder="Search questions by text or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ak-input w-full flex-shrink-0"
              style={{ ...fieldStyle, padding: '7px 10px', fontSize: 12.5 }}
            />

            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading questions...</div>
            ) : filteredQuestions.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                No questions found in this folder.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQuestions.map(q => {
                  const checked = selectedIds.includes(q.id)
                  return (
                    <label
                      key={q.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer text-xs ${
                        checked
                          ? 'border-indigo-300 bg-indigo-50/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(q.id)}
                        className="rounded text-indigo-600 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            {TYPE_LABELS[q.qtype] || q.qtype}
                          </span>
                          <span className="text-slate-400 text-[10px]">{q.points} pts</span>
                          {q.tags && q.tags.split(',').map((t, idx) => (
                            <span key={idx} className="text-[9px] text-indigo-600">
                              #{t.trim()}
                            </span>
                          ))}
                        </div>
                        <p className="font-semibold text-slate-800 leading-normal">{q.text}</p>
                        
                        {q.qtype === 'mcq' && q.options && (
                          <div className="mt-1 space-y-0.5 text-[11px] text-slate-500">
                            {q.options.map((o, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <span className={`h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0 ${o.is_correct ? 'bg-green-500' : 'bg-slate-300'}`} />
                                <span className={`break-words flex-1 ${o.is_correct ? 'font-semibold text-slate-700' : ''}`}>{o.text}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={handleImport}
            className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            style={btnModalPrimary}
          >
            Import Selected ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Correcting a typo on a live quiz (T-74) -- a question's prompt and, for
 * multiple choice, its options' text. Nothing else here is editable: no id,
 * type, points, or correctness field has an input in this dialog, so the
 * only way `wordingEditError` ever fires is a bug, not a teacher's typing --
 * it stands as the check that would catch one.
 */
function EditWordingModal({ isOpen, onClose, quiz, refetch }) {
  const { overlayProps, panelProps } = useDialogBehavior(onClose, { open: isOpen, label: 'Edit wording', closeOnBackdrop: false })
  const [edits, setEdits] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setEdits(
      (quiz.questions ?? []).map((q) => ({
        id: q.id,
        text: q.text ?? '',
        options: (q.options ?? []).map((o) => ({ id: o.id, text: o.text ?? '' })),
      })),
    )
  }, [isOpen, quiz.questions])

  if (!isOpen) return null

  const setQuestionText = (i, text) => setEdits((rows) => rows.map((r, j) => (j === i ? { ...r, text } : r)))
  const setOptionText = (i, k, text) =>
    setEdits((rows) =>
      rows.map((r, j) => (j === i ? { ...r, options: r.options.map((o, l) => (l === k ? { ...o, text } : o)) } : r)),
    )

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const original = quiz.questions ?? []
      const next = original.map((q, i) => ({
        ...q,
        text: edits[i]?.text ?? q.text,
        options: q.options ? q.options.map((o, k) => ({ ...o, text: edits[i]?.options?.[k]?.text ?? o.text })) : q.options,
      }))
      const problem = wordingEditError(original, next)
      if (problem) {
        setError(problem)
        return
      }
      await updateDoc(doc(db, 'quizzes', quiz.id), { questions: next, updated_at: serverTimestamp() })
      refetch()
      toast.success('Wording updated.')
      onClose()
    } catch {
      setError('Could not save the wording. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div {...overlayProps} style={{ position: 'fixed', inset: 0, background: 'rgba(14,23,51,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div {...panelProps} style={{ width: '100%', maxWidth: 560, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 40px 80px -20px rgba(14,42,92,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid rgba(14,42,92,0.07)', flexShrink: 0 }}>
          <h2 style={{ ...serif, fontSize: 22, margin: 0, color: ink }}>Edit wording</h2>
          <p style={{ fontSize: 12.5, color: muted, margin: '6px 0 0' }}>
            Fix a typo in a question or an option. The question type, its points, and which
            option is correct stay exactly as published — changing those needs a regrade,
            which this does not do.
          </p>
        </div>
        <div style={{ padding: '20px 28px', overflowY: 'auto' }} className="flex flex-col gap-4">
          {error && <AlertBox>{error}</AlertBox>}
          {edits.map((row, i) => {
            const q = quiz.questions?.[i]
            return (
              <div key={row.id ?? i} style={{ border: `1px solid ${line}`, borderRadius: 12, padding: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: muted, marginBottom: 4 }}>
                  Q{i + 1} · {TYPE_LABELS[q?.qtype]} · {q?.points} pts
                </label>
                <textarea
                  rows={2}
                  value={row.text}
                  onChange={(e) => setQuestionText(i, e.target.value)}
                  className="ak-input"
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
                {row.options.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {row.options.map((o, k) => (
                      <input
                        key={o.id ?? k}
                        value={o.text}
                        onChange={(e) => setOptionText(i, k, e.target.value)}
                        className="ak-input"
                        style={{ ...fieldStyle, fontSize: 13, padding: '7px 10px' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 28px', borderTop: '1px solid rgba(14,42,92,0.07)', background: 'rgba(14,42,92,0.02)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={saving} className="transition hover:brightness-105" style={btnModalGhost}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={btnModalPrimary}>
            {saving ? 'Saving…' : 'Save wording'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QuizBuilderPage() {
  const { quizId } = useParams()
  const queryClient = useQueryClient()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const { data: quiz, isLoading, isError } = useQuery({
    queryKey: ['fs-quiz', quizId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'quizzes', quizId))
      if (!snap.exists()) throw new Error('Quiz not found')
      return { id: snap.id, ...snap.data() }
    },
  })

  // Load all syllabi
  const { data: syllabi } = useSyllabi()

  // Load all teacher classes
  const { data: classes } = useTeacherClasses()

  /* One read per class, keyed by the class id -- deliberately NOT a query over
     the `gradebooks` collection. The rules guard `gradebooks/{classId}` through
     a get() on the parent class, and on a list there is no classId to bind, so
     the get() resolves to null and the whole query is refused (proven against
     the real rules engine: "Null value error" at the gradebooks read rule).
     That refusal is silent here -- `data` just stays undefined -- and the
     publish check then reads it as "this class has no Grade Config", for every
     teacher and every quiz, however well configured the class really was. A
     read by document id is what the rules can prove, and is the shape
     `hooks/useTeacherStudents.js` already uses for the same documents. */
  const classIds = (classes ?? []).map((c) => c.id)
  const { data: gradebooks } = useQuery({
    queryKey: ['fs-gradebooks', profile?.id, classIds],
    queryFn: async () => {
      const snaps = await Promise.all(
        classIds.map((id) => getDoc(doc(db, 'gradebooks', id))),
      )
      return Object.fromEntries(snaps.filter((s) => s.exists()).map((s) => [s.id, s.data()]))
    },
    enabled: !!profile?.id && classIds.length > 0,
  })

  const assignedClasses = (classes ?? []).filter((c) => (quiz?.class_ids ?? []).includes(c.id))
  const [selectedResultsClassId, setSelectedResultsClassId] = useState('')

  useEffect(() => {
    if (assignedClasses.length > 0 && !selectedResultsClassId) {
      setSelectedResultsClassId(assignedClasses[0].id)
    }
  }, [assignedClasses, selectedResultsClassId])

  // The class on screen gets its scores posted the moment it is looked at
  // (owner decision 2026-09-13). A closed quiz is not re-posted: its marks
  // were posted while it was live and the record may have been corrected
  // by hand since. `quiz` may be undefined until the load lands.
  const autoPost = useAutoPostScores({
    classId: selectedResultsClassId,
    quizzes: quizzesToAutoPost(quiz ? [quiz] : [], selectedResultsClassId),
  })

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['fs-quiz', quizId] })
    queryClient.invalidateQueries({ queryKey: ['fs-quizzes'] })
    if (selectedResultsClassId) {
      queryClient.invalidateQueries({ queryKey: ['fs-quiz-results', selectedResultsClassId, quizId] })
    }
  }

  const [isEditWordingOpen, setIsEditWordingOpen] = useState(false)

  /**
   * Take a published quiz back to draft -- maykel's ask: Publish was a
   * misclick and nobody has touched the quiz yet.
   *
   * Checked against every class the quiz is *assigned* to (`class_ids`),
   * not just the mapped ones -- a student can sit an unmapped quiz too,
   * it just never posted a score, and unpublishing under them would still
   * throw them out mid-attempt. Only once nobody has started anywhere does
   * this remove the record column in the classes that were mapped
   * (`removeQuizFromAllRecords`, T-73's helper) and flip the status back.
   */
  async function backToDraft() {
    try {
      const classIds = quiz.class_ids ?? []
      const counts = await Promise.all(
        classIds.map((cid) =>
          getDocs(query(collection(db, 'quiz_attempts'), where('quiz_id', '==', quiz.id), where('class_id', '==', cid))),
        ),
      )
      const started = counts.reduce((n, snap) => n + snap.size, 0)
      const refusal = backToDraftRefusal(started)
      if (refusal) {
        toast.error(refusal)
        return
      }
      if (!(await confirmDialog({
        title: 'Take this quiz back to draft?',
        message: "Students haven't started it yet. It goes back to a draft you can edit, and comes off the class record until you publish again.",
        confirmLabel: 'Back to draft',
        tone: 'danger',
      }))) return

      const { locked } = await removeQuizFromAllRecords({ quiz, classMappings: quiz.class_mappings ?? {} })
      if (locked.length) {
        const names = locked
          .map(({ classId, periodName }) => `${periodName} is locked on ${classes?.find((c) => c.id === classId)?.section ?? 'a class'}`)
          .join('; ')
        toast.error(`Could not take the quiz back to draft — ${names}. Unlock it on the class record first.`)
        return
      }

      await updateDoc(doc(db, 'quizzes', quiz.id), { status: 'draft', published_at: null, updated_at: serverTimestamp() })
      refetch()
      toast.success('Back to draft. It comes off the class record until you publish again.')
    } catch {
      toast.error('Could not take the quiz back to draft. Check your connection and try again.')
    }
  }

  async function closeQuiz() {
    if (!(await confirmDialog({
      title: 'Close this quiz?',
      message: 'Students can no longer take it. Attempts already submitted are kept and stay in the gradebook.',
      confirmLabel: 'Close quiz',
      tone: 'danger',
    }))) return
    try {
      const previous = quiz.status
      await updateDoc(doc(db, 'quizzes', quizId), { status: 'closed', updated_at: serverTimestamp() })
      refetch()
      // Closing flips one field, so reopening restores exactly what was there.
      toast.success('Quiz closed. Students can no longer take it.', {
        action: {
          label: 'Reopen',
          onClick: async () => {
            try {
              await updateDoc(doc(db, 'quizzes', quizId), { status: previous, updated_at: serverTimestamp() })
              refetch()
              toast.success('Quiz reopened.')
            } catch (err) {
              toast.error(`Could not reopen the quiz: ${err.message}`)
            }
          },
        },
      })
    } catch (err) {
      toast.error(`Could not close the quiz: ${err.message}`)
    }
  }

  if (isLoading) return <p style={{ color: faint }}>Loading quiz…</p>
  if (isError || !quiz) return <p style={{ color: red }}>Quiz not found.</p>

  const editable = quiz.status === 'draft'
  const questionCount = quiz.questions?.length ?? 0
  const totalPoints = sumPoints(quiz.questions)
  const assignment = describeAssignment(assignedClasses)

  return (
    // One centred column for the whole editor -- header, notice and body. There
    // is no right-hand element on this route, so the page balances instead of
    // leaving half of a wide screen empty. Undoing it is this one wrapper.
    <div className="mx-auto max-w-3xl">
      <Link to="/teacher/quizzes" className="inline-flex items-center gap-1.5 transition hover:opacity-70" style={{ fontSize: 13, fontWeight: 600, color: navy, textDecoration: 'none' }}>
        ← Back to quizzes
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-[clamp(24px,3.2vw,30px)]" style={{ ...serif, lineHeight: 1.1, letterSpacing: '-0.01em', margin: '0 0 4px', color: ink }}>
            {quiz.title}
            {quiz.generated_by === 'ai_generated' && (
              <span title="AI-generated" style={{ color: blueText, display: 'inline-flex' }}>
                <Sparkles className="h-5 w-5" />
              </span>
            )}
          </h1>
          {/* `capitalize` title-cases every word, which is right for the
              status and the counts and wrong for a class or subject name a
              teacher typed -- "bsit-c" is not "Bsit-C". The names opt out. */}
          <p className="capitalize" style={{ ...mono, fontSize: 13, color: muted, margin: 0 }}>
            {quiz.status} · {questionCount} questions · {totalPoints} pts ·{' '}
            {assignment.lead}
            {assignment.names && <span className="normal-case"> {assignment.names}</span>}
          </p>
        </div>
        {quiz.status === 'published' && (
          <div className="flex items-center gap-2">
            <button onClick={backToDraft} className="transition hover:brightness-105" style={btnGhost} title="Only while nobody has started it">
              Back to draft
            </button>
            <button onClick={closeQuiz} className="transition hover:brightness-105" style={btnGold}>
              Close quiz
            </button>
          </div>
        )}
      </div>

      {editable ? (
        <>
          {quiz.generated_by === 'ai_generated' && (
            <div className="mt-4 flex items-center gap-2.5" style={{ background: 'rgba(63,169,245,0.06)', border: '1px solid rgba(63,169,245,0.3)', borderRadius: 11, padding: '12px 14px', fontSize: 13, color: ink }}>
              <span style={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 7, background: 'rgba(63,169,245,0.2)', color: blueText, flexShrink: 0 }}>
                <Sparkles className="h-3 w-3" />
              </span>
              AI-generated draft — review every question and answer key before publishing.
            </div>
          )}
          <BuilderForm key={quiz.id} quiz={quiz} classes={classes ?? []} gradebooksMap={gradebooks} refetch={refetch} syllabi={syllabi ?? []} />
        </>
      ) : (
        <div className="mt-6">
          {quiz.status === 'published' && <LiveSettings quiz={quiz} refetch={refetch} />}
          {assignedClasses.length > 0 ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <label style={{ ...labelStyle, marginBottom: 0 }}>View Results For Class:</label>
                <select
                  className="ak-input"
                  value={selectedResultsClassId}
                  onChange={(e) => setSelectedResultsClassId(e.target.value)}
                  style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}
                >
                  {assignedClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.section} ({c.subject})</option>
                  ))}
                </select>
                {selectedResultsClassId && (
                  <PostScoresButton quiz={quiz} classId={selectedResultsClassId} auto={autoPost} />
                )}
              </div>
              {selectedResultsClassId && (
                <ResultsView classId={selectedResultsClassId} quizId={quizId} quiz={quiz} totalPoints={totalPoints} assignedTo={quiz.assigned_to} refetch={refetch} />
              )}
            </div>
          ) : (
            <p style={{ color: faint }}>This quiz is not assigned to any classes yet.</p>
          )}

          <div className="mt-4" style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16, padding: 22 }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2" style={{ marginBottom: 12 }}>
              <h3 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Questions and answer key (read-only)</h3>
              {quiz.status === 'published' && (
                <button onClick={() => setIsEditWordingOpen(true)} className="transition hover:opacity-70" style={linkBtn}>
                  Edit wording
                </button>
              )}
            </div>
            {(quiz.questions ?? []).map((q, i) => (
              <div key={q.id || i} style={{ borderBottom: '1px solid rgba(14,42,92,0.05)', padding: '8px 0' }}>
                <p style={{ fontSize: 13, color: '#3A4A6B', margin: 0 }}>
                  <span style={{ fontWeight: 700, color: ink }}>Q{i + 1}.</span> {q.text}
                  <span style={{ color: faint }}> · {TYPE_LABELS[q.qtype]} · {q.points} pts</span>
                </p>
                {/* The key, read off the saved question (T-60). Once a quiz is
                    published the editor is gone, and this list was the only
                    place a teacher could look before a student sits it or
                    disputes an item -- and it showed no answers. What a
                    student sees after submitting is the quiz's feedback
                    setting's job (lib/quizFeedback.js), not this card's. */}
                {q.qtype === 'mcq' && (
                  <div className="mt-1 space-y-0.5 text-[12px] text-slate-500" style={{ paddingLeft: 22 }}>
                    {(q.options ?? []).map((o, idx) => (
                      <div key={o.id || idx} className="flex items-start gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0 ${o.is_correct ? 'bg-green-500' : 'bg-slate-300'}`} />
                        <span className={`break-words flex-1 ${o.is_correct ? 'font-semibold text-slate-700' : ''}`}>{o.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                {q.qtype === 'true_false' && (
                  <p className="mt-1 text-[12px] text-slate-500" style={{ margin: '4px 0 0', paddingLeft: 22 }}>
                    Answer: <span className="font-semibold text-slate-700">{q.answer_key?.value ? 'True' : 'False'}</span>
                  </p>
                )}
                {q.qtype === 'short_answer' && (
                  <p className="mt-1 text-[12px] text-slate-500" style={{ margin: '4px 0 0', paddingLeft: 22 }}>
                    Accepted answers: <span className="font-semibold text-slate-700">{(q.answer_key?.answers ?? []).join(', ') || '—'}</span>
                  </p>
                )}
                {q.qtype === 'matching' && (
                  <div className="mt-1 space-y-0.5 text-[12px] text-slate-500" style={{ paddingLeft: 22 }}>
                    {(q.answer_key?.pairs ?? []).map((pair, idx) => (
                      <div key={idx} className="break-words">{pair.left} → <span className="font-semibold text-slate-700">{pair.right}</span></div>
                    ))}
                  </div>
                )}
                {q.qtype === 'essay' && (
                  <p style={{ fontSize: 12, color: faint, margin: '4px 0 0', paddingLeft: 22 }}>Marked by hand</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {quiz.status === 'published' && (
        <EditWordingModal
          isOpen={isEditWordingOpen}
          onClose={() => setIsEditWordingOpen(false)}
          quiz={quiz}
          refetch={refetch}
        />
      )}
    </div>
  )
}
