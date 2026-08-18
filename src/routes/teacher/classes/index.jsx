// FILE: web/src/pages/teacher/ClassesPage.jsx
// 2026-06-20 — Added per-class kebab menu (⋮) to both list and card views with:
//   • Badge colour picker (8 preset colours, stored as badge_color in Firestore)
//   • Archive class (sets archived_at via Firestore updateDoc; hides from list)
//   • Delete class (DeleteConfirmModal: teacher must type subject code to confirm)
// List and card items restructured from <Link> wrapper → <div> + inner <Link>
// so the menu sits outside the anchor with no stopPropagation hacks needed.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { emptyClassForm } from '@/lib/classForm'
import ClassFormModal from '@/features/classes/ClassFormModal'
import { navy, navyDeep, gold, goldDeep, ink, muted, faint, line, sansFamily as sans, serif, mono } from '@/theme'
import { useTeacherClasses } from '@/hooks/useTeacherClasses'

// ─── Design tokens ────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'default', label: 'Last accessed' },
  { value: 'subject', label: 'Subject name' },
]

// 2026-06-20: Preset palette for the class badge background colour
const BADGE_COLORS = [
  { color: '#0E2A5C', label: 'Navy (default)' },
  { color: '#0D7A6A', label: 'Teal' },
  { color: '#5B21B6', label: 'Purple' },
  { color: '#9A3412', label: 'Rust' },
  { color: '#991B1B', label: 'Crimson' },
  { color: '#166534', label: 'Forest' },
  { color: '#1E40AF', label: 'Royal Blue' },
  { color: '#334155', label: 'Slate' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function classBadge(c) {
  const base = (c.subject_code || c.subject || c.section || '').toUpperCase()
  const letters = base.match(/[A-Z]+/)?.[0] ?? ''
  const digits = base.match(/\d+/)?.[0] ?? ''
  if (letters && digits) return (letters[0] + digits).slice(0, 4)
  return base.replace(/[^A-Z0-9]/g, '').slice(0, 3) || '—'
}

function badgeColor(c) {
  return c.badge_color || navy
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function ListIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="3" cy="5" r="1.5" fill={active ? navy : faint} />
      <line x1="7" y1="5" x2="16" y2="5" stroke={active ? navy : faint} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="3" cy="9" r="1.5" fill={active ? navy : faint} />
      <line x1="7" y1="9" x2="16" y2="9" stroke={active ? navy : faint} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="3" cy="13" r="1.5" fill={active ? navy : faint} />
      <line x1="7" y1="13" x2="16" y2="13" stroke={active ? navy : faint} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function GridIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="6" height="6" rx="1.5" fill={active ? navy : faint} />
      <rect x="10" y="2" width="6" height="6" rx="1.5" fill={active ? navy : faint} />
      <rect x="2" y="10" width="6" height="6" rx="1.5" fill={active ? navy : faint} />
      <rect x="10" y="10" width="6" height="6" rx="1.5" fill={active ? navy : faint} />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Sort dropdown ────────────────────────────────────────────────────────────
function SortDropdown({ sort, setSort }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  const current = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 13px',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: sans,
          color: ink,
          background: '#fff',
          border: `1px solid rgba(14,42,92,0.18)`,
          borderRadius: 9,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {current.label}
        <ChevronDown />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 20,
            background: '#fff',
            border: `1px solid rgba(14,42,92,0.14)`,
            borderRadius: 10,
            boxShadow: '0 8px 24px -6px rgba(14,42,92,0.16)',
            minWidth: 180,
            overflow: 'hidden',
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => { setSort(o.value); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: sort === o.value ? 700 : 500,
                fontFamily: sans,
                color: sort === o.value ? navy : ink,
                background: sort === o.value ? 'rgba(14,42,92,0.06)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { if (sort !== o.value) e.target.style.background = 'rgba(14,42,92,0.04)' }}
              onMouseLeave={(e) => { if (sort !== o.value) e.target.style.background = 'transparent' }}
            >
              {sort === o.value && <span style={{ marginRight: 8, color: gold }}>✓</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Kebab menu ───────────────────────────────────────────────────────────────
// 2026-06-20: Per-class ⋮ menu — badge colour picker, archive, delete
const menuItemBase = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: sans,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
}

function ClassMenu({ cls, onColorChange, onArchive, onDelete }) {
  const [open, setOpen] = useState(false)
  const [showColors, setShowColors] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setShowColors(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* ⋮ trigger */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); setShowColors(false) }}
        title="Class options"
        style={{
          width: 30,
          height: 30,
          borderRadius: 7,
          border: open ? '1px solid rgba(14,42,92,0.25)' : '1px solid transparent',
          background: open ? 'rgba(14,42,92,0.08)' : 'transparent',
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
          color: muted,
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        ⋮
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 30,
            background: '#fff',
            border: '1px solid rgba(14,42,92,0.14)',
            borderRadius: 10,
            boxShadow: '0 8px 24px -6px rgba(14,42,92,0.18)',
            minWidth: 210,
            overflow: 'hidden',
          }}
        >
          {/* Badge colour */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowColors((s) => !s) }}
            style={{ ...menuItemBase, color: ink }}
          >
            <span style={{ flex: 1 }}>Change badge color</span>
            <span style={{ color: faint, fontSize: 11 }}>{showColors ? '▲' : '▼'}</span>
          </button>

          {showColors && (
            <div style={{ padding: '4px 14px 12px', borderBottom: '1px solid rgba(14,42,92,0.07)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {BADGE_COLORS.map(({ color, label }) => {
                  const active = badgeColor(cls) === color
                  return (
                    <button
                      key={color}
                      title={label}
                      onClick={(e) => { e.stopPropagation(); onColorChange(color); setOpen(false) }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        background: color,
                        border: active ? `2.5px solid ${gold}` : '2.5px solid rgba(255,255,255,0.3)',
                        outline: active ? '1.5px solid rgba(0,0,0,0.2)' : 'none',
                        cursor: 'pointer',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ height: 1, background: 'rgba(14,42,92,0.07)' }} />

          <button
            onClick={(e) => { e.stopPropagation(); onArchive(); setOpen(false) }}
            style={{ ...menuItemBase, color: ink }}
          >
            Archive class
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setOpen(false) }}
            style={{ ...menuItemBase, color: '#dc2626' }}
          >
            Delete class
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────
// 2026-06-20: Teacher must type the subject code exactly before deletion proceeds
function DeleteConfirmModal({ cls, onClose, onDeleted }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const code = (cls.subject_code || cls.section || '').trim()
  const match = typed.trim().toLowerCase() === code.toLowerCase()

  async function confirm() {
    if (!match) return
    setBusy(true)
    setError(null)
    try {
      await deleteDoc(doc(db, 'classes', cls.id))
      onDeleted()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-200 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 py-8">
        <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
          <h3 style={{ fontSize: 18, fontWeight: 700, color: ink, margin: 0 }}>
            Delete Class
          </h3>
          <p style={{ fontSize: 14, color: muted, lineHeight: 1.6, margin: 0 }}>
            This will permanently delete{' '}
            <strong style={{ color: ink }}>{cls.section}</strong> and all its data.
            This action cannot be undone.
          </p>
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 9,
              padding: '10px 14px',
              fontSize: 13,
              color: '#991b1b',
            }}
          >
            Type <strong>{code}</strong> to confirm deletion.
          </div>
          <input
            autoFocus
            placeholder={code}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && match && confirm()}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/50"
          />
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-3 justify-end pt-1">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={!match || busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              style={{ background: '#dc2626', border: 'none', cursor: match ? 'pointer' : 'not-allowed' }}
            >
              {busy ? 'Deleting…' : 'Delete class'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ClassesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [warning, setWarning] = useState(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('default')
  const [view, setView] = useState('list')
  // 2026-06-20: Tracks which class the delete confirmation modal targets
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: classes, isLoading } = useTeacherClasses()

  // 2026-06-20: Persist chosen badge colour to Firestore
  async function handleColorChange(cls, color) {
    try {
      await updateDoc(doc(db, 'classes', cls.id), { badge_color: color })
      queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
    } catch (err) {
      setWarning(`Could not update badge colour: ${err.message}`)
    }
  }

  // 2026-06-20: Archive — sets archived_at timestamp; class disappears from list
  async function handleArchive(cls) {
    if (!window.confirm(`Archive "${cls.section}"? It will be hidden from your class list.`)) return
    try {
      await updateDoc(doc(db, 'classes', cls.id), { archived_at: serverTimestamp() })
      queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
    } catch (err) {
      setWarning(`Could not archive class: ${err.message}`)
    }
  }

  // 2026-06-20: Filter out archived classes from the displayed list
  const filtered = (classes ?? [])
    .filter((c) => !c.archived_at)
    .filter((c) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        (c.section || '').toLowerCase().includes(q) ||
        (c.subject_code || '').toLowerCase().includes(q) ||
        (c.subject || '').toLowerCase().includes(q) ||
        (c.academic_year || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'subject') {
        const aName = (a.subject || a.subject_code || a.section || '').toLowerCase()
        const bName = (b.subject || b.subject_code || b.section || '').toLowerCase()
        return aName.localeCompare(bName)
      }
      return 0
    })

  const viewBtnStyle = (active) => ({
    width: 36,
    height: 36,
    borderRadius: 8,
    border: `1px solid ${active ? navy : 'rgba(14,42,92,0.18)'}`,
    background: active ? 'rgba(14,42,92,0.08)' : '#fff',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
  })

  const isEmpty = !isLoading && filtered.length === 0

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[clamp(30px,4vw,40px)]" style={{ ...serif, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 8px', color: ink }}>
            My Classes
          </h1>
          <p style={{ fontSize: 15, color: muted, margin: 0 }}>Create class sections and manage student rosters.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3FA9F5] focus-visible:ring-offset-2"
          style={{ padding: '13px 20px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer', boxShadow: `0 3px 0 ${navyDeep}, 0 10px 24px -12px rgba(14,42,92,0.5)` }}
        >
          <span style={{ display: 'inline-grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: gold, color: navy, fontSize: 14, lineHeight: 1 }}>+</span>
          New Class
        </button>
      </div>

      {warning && (
        <div
          className="mt-4 flex items-start justify-between gap-3"
          style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 11, padding: '12px 16px', fontSize: 13.5, color: goldDeep }}
        >
          <span>{warning}</span>
          <button onClick={() => setWarning(null)} style={{ color: goldDeep, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mt-5">
        <input
          placeholder="Search by section, subject, or year…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1 1 200px',
            maxWidth: 340,
            padding: '8px 14px',
            fontSize: 14,
            fontFamily: sans,
            borderRadius: 9,
            border: '1px solid rgba(14,42,92,0.18)',
            outline: 'none',
            color: ink,
            background: '#fff',
          }}
          onFocus={(e) => (e.target.style.borderColor = navy)}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(14,42,92,0.18)')}
        />
        <SortDropdown sort={sort} setSort={setSort} />
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setView('list')} title="List view" style={viewBtnStyle(view === 'list')}>
            <ListIcon active={view === 'list'} />
          </button>
          <button onClick={() => setView('card')} title="Card view" style={viewBtnStyle(view === 'card')}>
            <GridIcon active={view === 'card'} />
          </button>
        </div>
      </div>

      {/* Classes */}
      {isLoading ? (
        <div style={{ color: faint, marginTop: 40, textAlign: 'center', fontSize: 14 }}>
          Loading classes…
        </div>
      ) : isEmpty && !search ? (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${line}`, padding: '48px 24px', marginTop: 20, textAlign: 'center', color: muted, fontSize: 14 }}>
          No classes yet. Create your first class section to start building its roster.
        </div>
      ) : isEmpty ? (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${line}`, padding: '48px 24px', marginTop: 20, textAlign: 'center', color: muted, fontSize: 14 }}>
          No classes match "{search}".
        </div>
      ) : view === 'list' ? (

        /* ── LIST VIEW ── */
        // overflow: visible (no hidden) so the ⋮ dropdown is not clipped; border-radius applied per-row instead
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${line}`, marginTop: 16 }}>
          {filtered.map((c, i) => {
            const count = c.student_ids?.length ?? 0
            const isFirst = i === 0
            const isLast = i === filtered.length - 1
            const rowRadius = isFirst && isLast ? 14 : isFirst ? '14px 14px 0 0' : isLast ? '0 0 14px 14px' : 0
            return (
              // 2026-06-20: Outer div so ClassMenu sits beside the Link without being inside it
              <div
                key={c.id}
                className="flex items-center transition hover:bg-slate-50"
                style={{ borderBottom: !isLast ? `1px solid ${line}` : 'none', borderRadius: rowRadius }}
              >
                <Link
                  to={`/teacher/classes/${c.id}`}
                  className="flex items-center"
                  style={{ flex: 1, padding: '15px 0 15px 22px', textDecoration: 'none', gap: 16, minWidth: 0 }}
                >
                  <div
                    style={{
                      ...mono,
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      background: badgeColor(c),
                      color: gold,
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {classBadge(c)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.subject_code ? `${c.subject_code} · ` : ''}{c.section}
                    </div>
                    {c.subject && (
                      <div style={{ fontSize: 13, color: muted, marginTop: 2 }}>{c.subject}</div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {c.academic_year && <div style={{ fontSize: 13, color: muted }}>{c.academic_year}</div>}
                    {c.schedule && <div style={{ fontSize: 12, color: faint, marginTop: 2 }}>{c.schedule}</div>}
                  </div>

                  <div style={{ borderRadius: 999, background: 'rgba(14,42,92,0.07)', color: navy, padding: '4px 13px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {count}{c.max_students ? ` / ${c.max_students}` : ''} student{count === 1 && !c.max_students ? '' : 's'}
                  </div>
                </Link>

                {/* ⋮ menu — outside the Link */}
                <div style={{ padding: '0 14px 0 8px', flexShrink: 0 }}>
                  <ClassMenu
                    cls={c}
                    onColorChange={(color) => handleColorChange(c, color)}
                    onArchive={() => handleArchive(c)}
                    onDelete={() => setDeleteTarget(c)}
                  />
                </div>
              </div>
            )
          })}
        </div>

      ) : (

        /* ── CARD VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {filtered.map((c) => {
            const count = c.student_ids?.length ?? 0
            return (
              // 2026-06-20: position: relative so ClassMenu can be absolutely placed top-right
              <div
                key={c.id}
                className="transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ background: '#fff', border: `1px solid ${line}`, borderRadius: 16, position: 'relative' }}
              >
                {/* ⋮ menu — absolute top-right, outside the card Link */}
                <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
                  <ClassMenu
                    cls={c}
                    onColorChange={(color) => handleColorChange(c, color)}
                    onArchive={() => handleArchive(c)}
                    onDelete={() => setDeleteTarget(c)}
                  />
                </div>

                <Link
                  to={`/teacher/classes/${c.id}`}
                  className="flex flex-col"
                  style={{ padding: 22, textDecoration: 'none' }}
                >
                  {/* Card header — badge + name (right padding avoids ⋮ overlap) */}
                  <div className="flex items-start gap-3" style={{ paddingRight: 32 }}>
                    <div
                      style={{
                        ...mono,
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        background: badgeColor(c),
                        color: gold,
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {classBadge(c)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: ink, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.subject_code ? `${c.subject_code} · ` : ''}{c.section}
                      </div>
                      {c.subject && (
                        <div style={{ fontSize: 13, color: muted, marginTop: 3 }}>{c.subject}</div>
                      )}
                    </div>
                  </div>

                  {c.schedule && (
                    <div style={{ fontSize: 12, color: faint, marginTop: 14, ...mono }}>
                      {c.schedule}
                    </div>
                  )}

                  <div
                    className="flex items-center justify-between mt-auto pt-4"
                    style={{ borderTop: `1px solid ${line}`, marginTop: 16 }}
                  >
                    <span style={{ fontSize: 13, color: muted }}>{c.academic_year || '—'}</span>
                    <span style={{ borderRadius: 999, background: 'rgba(14,42,92,0.07)', color: navy, padding: '4px 11px', fontSize: 12, fontWeight: 700 }}>
                      {count}{c.max_students ? ` / ${c.max_students}` : ''} student{count === 1 && !c.max_students ? '' : 's'}
                    </span>
                  </div>
                </Link>
              </div>
            )
          })}
        </div>
      )}

      {/* New Class modal */}
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

      {/* 2026-06-20: Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          cls={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ['fs-classes'] })
            setDeleteTarget(null)
          }}
        />
      )}
    </div>
  )
}
