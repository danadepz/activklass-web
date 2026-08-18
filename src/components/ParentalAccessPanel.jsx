import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Check } from '@/components/icons'
import CopyButton from '@/components/CopyButton'
import Toggle from '@/components/Toggle'
import { PERMISSIONS } from '@/components/parentalAccess'
import { navy, ink, muted, faint, green, red, line, serif, mono } from '@/theme'

/**
 * Parental Access panel — the student's control over who sees their records.
 *
 * Presentational only: it takes the code, permissions and guardian list as
 * props and reports intent back through callbacks. No Firestore, no queries.
 * The Student lane owns fetching and mutating; this owns how it looks, so the
 * two can be worked on in different panes without touching the same file.
 *
 * The order is deliberate — permissions, then the code, then the guardians it
 * let in. A student should settle what a guardian may see *before* handing out
 * anything that grants access, so the code stays behind a button until they
 * have been past the toggles.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md).
 */

/** For screen readers only — the buttons carry the state visually. */
const STATUS_LABEL = { approved: 'Approved', pending: 'Pending', declined: 'Declined' }

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?'
}

/**
 * Revoking cuts a guardian off and forces the whole code exchange again, so it
 * asks once rather than firing on a stray click. The confirm lapses on its own
 * so a half-pressed button never sits there armed.
 */
function RevokeButton({ guardian, onRevoke, disabled }) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  function click() {
    if (!armed) {
      setArmed(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setArmed(false), 4000)
      return
    }
    clearTimeout(timer.current)
    setArmed(false)
    onRevoke?.(guardian)
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled}
      aria-label={armed ? `Confirm revoking access for ${guardian.name}` : `Revoke access for ${guardian.name}`}
      className="flex flex-shrink-0 items-center gap-1.5 transition hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 700,
        color: armed ? '#FFFFFF' : red,
        background: armed ? red : '#FFFFFF',
        border: `1.5px solid ${armed ? red : 'rgba(192,57,43,0.35)'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'color 0.15s ease, background 0.15s ease',
      }}
    >
      {armed ? 'Confirm' : 'Revoke'}
    </button>
  )
}

function GuardianRow({ guardian, onApprove, onRevoke, canManage, busy }) {
  /* Which buttons are present already says where a link stands — Approve is
     only offered on one that has not been granted — so the status pill was
     repeating it and eating a column. A screen reader still gets it spelled
     out beside the name, since button presence is not something it announces. */
  const grantable = guardian.status !== 'approved'

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      style={{ padding: '13px 15px', border: `1px solid ${line}`, borderRadius: 12, background: '#FFFFFF' }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(14,42,92,0.07)', color: ink,
          display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700,
        }}
      >
        {initials(guardian.name)}
      </span>

      <div style={{ minWidth: 0, flex: '1 1 140px' }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: ink }}>
          {guardian.name}
          <span className="sr-only">{` — ${STATUS_LABEL[guardian.status] ?? 'status unknown'}`}</span>
        </div>
        <div
          style={{ fontSize: 12.5, color: faint, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {[guardian.relation, guardian.email].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {canManage && (
        <div className="flex flex-shrink-0 items-center gap-2">
          {grantable && (
            <button
              type="button"
              onClick={() => onApprove?.(guardian)}
              disabled={busy}
              aria-label={`Approve access for ${guardian.name}`}
              className="flex items-center gap-1.5 transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: green, border: 'none', borderRadius: 10, cursor: 'pointer' }}
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          <RevokeButton guardian={guardian} onRevoke={onRevoke} disabled={busy} />
        </div>
      )}
    </div>
  )
}

export default function ParentalAccessPanel({
  code,
  permissions = {},
  onPermissionChange,
  guardians = [],
  onApprove,
  onRevoke,
  onGenerateCode,
  canManage = true,
  lockedReason = null,
  loading = false,
  busy = false,
  error = null,
}) {
  const [revealed, setRevealed] = useState(false)
  const showCode = revealed && Boolean(code)

  const heading = { ...serif, fontSize: 17, color: ink, margin: '26px 0 4px' }
  const note = { fontSize: 13, color: muted, margin: '0 0 12px', lineHeight: 1.5 }
  const box = { background: 'rgba(14,42,92,0.025)', border: `1px solid ${line}`, borderRadius: 14, textAlign: 'center' }

  return (
    <section style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 24, marginTop: 20 }}>
      {/* The page runs to 1040px but this panel is a column of short rows, so at
          full width it reads as mostly empty. Capped and centred instead. */}
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(14,42,92,0.07)', color: ink, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, margin: 0 }}>Parental Access</h2>
            <p style={{ fontSize: 12.5, color: faint, margin: '2px 0 0' }}>RA 10173 — Data Privacy Act of 2012</p>
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse" style={{ height: 90, borderRadius: 12, background: 'rgba(14,42,92,0.05)', marginTop: 16 }} />
        ) : (
          <>
            {/* Sits above the controls it explains. At the foot of the panel a
                student met four dead toggles and a dead button with no reason
                given until they had scrolled past everything. */}
            {!canManage && lockedReason && (
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, background: 'rgba(14,42,92,0.03)', border: `1px solid ${line}`, borderRadius: 11, padding: '12px 14px', marginTop: 16 }}>
                {lockedReason}
              </p>
            )}

            {error && (
              <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 14 }}>
                {error}
              </p>
            )}

            {/* --- 1. Permissions, settled first -------------------------- */}
            <h3 style={heading}>What guardians can see</h3>
            <p style={note}>
              {canManage
                ? 'Set these before you share a code. They apply to every connected guardian, and turning one off hides it immediately.'
                : 'These are managed for you and cannot be changed here.'}
            </p>

            <div className="flex flex-col gap-2">
              {PERMISSIONS.map((p) => (
                <Toggle
                  key={p.key}
                  id={`perm-${p.key}`}
                  label={p.label}
                  hint={p.hint}
                  checked={Boolean(permissions[p.key])}
                  disabled={!canManage || busy}
                  onChange={(next) => onPermissionChange?.(p.key, next)}
                />
              ))}
            </div>

            {/* --- 2. Then, and only then, the code ----------------------- */}
            <h3 style={heading}>Guardian link code</h3>

            {!canManage ? (
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, border: `1px dashed ${line}`, borderRadius: 12, padding: '16px', textAlign: 'center', margin: 0 }}>
                You don&apos;t need a link code. Guardian access on your account is
                arranged for you rather than by sharing a code.
              </p>
            ) : !showCode ? (
              <div style={{ ...box, padding: '20px 18px' }}>
                <p style={{ fontSize: 13, color: muted, margin: '0 auto 14px', lineHeight: 1.5, maxWidth: 400 }}>
                  Happy with the settings above? Generate a code to give your parent or
                  guardian. They enter it to request access — you still approve every one.
                </p>
                <button
                  type="button"
                  onClick={() => { setRevealed(true); onGenerateCode?.() }}
                  disabled={!canManage || busy}
                  className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ padding: '11px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer' }}
                >
                  Generate link code
                </button>
              </div>
            ) : (
              <div style={{ ...box, padding: 18 }}>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <div
                    style={{
                      ...mono,
                      fontSize: 26,
                      fontWeight: 600,
                      letterSpacing: '0.34em',
                      // Tracking is added to the right of each glyph, which shunts
                      // the block left; the indent puts it back on centre.
                      textIndent: '0.34em',
                      color: ink,
                      background: '#FFFFFF',
                      border: `1.5px solid ${line}`,
                      borderRadius: 11,
                      padding: '11px 16px',
                    }}
                  >
                    {code}
                  </div>
                  <CopyButton value={code} label="Copy code" copiedLabel="Copied" />
                </div>
                <p style={{ fontSize: 12.5, color: muted, margin: '12px auto 0', lineHeight: 1.5, maxWidth: 400 }}>
                  Give this to your parent or guardian. You still approve or decline
                  every request it produces.
                </p>
              </div>
            )}

            {/* --- 3. Who it let in --------------------------------------- */}
            <h3 style={{ ...heading, margin: '26px 0 12px' }}>
              Connected guardians{guardians.length > 0 && ` (${guardians.length})`}
            </h3>

            {guardians.length === 0 ? (
              <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, border: `1px dashed ${line}`, borderRadius: 12, padding: '18px 16px', textAlign: 'center', margin: 0 }}>
                No parent or guardian is linked yet. Share your code above to get started.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {guardians.map((g) => (
                  <GuardianRow
                    key={g.id ?? g.email ?? g.name}
                    guardian={g}
                    onApprove={onApprove}
                    onRevoke={onRevoke}
                    canManage={canManage}
                    busy={busy}
                  />
                ))}
              </div>
            )}

          </>
        )}
      </div>
    </section>
  )
}
