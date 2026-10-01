import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Check } from '@/components/icons'
import CopyButton from '@/components/CopyButton'
import Toggle from '@/components/Toggle'
import { PERMISSIONS } from '@/components/parentalAccess'
import { ink, muted, faint, green, red, line, serif, mono, navy } from '@/theme'

/**
 * Parental Access panel — the student's control over who sees their records.
 *
 * Presentational only: it takes the code, permissions and guardian list as
 * props and reports intent back through callbacks. No Firestore, no queries.
 * The Student lane owns fetching and mutating; this owns how it looks, so the
 * two can be worked on in different panes without touching the same file.
 *
 * The order is deliberate — what access means, then the code, then the
 * guardians it let in. The code still stays behind a button so a student reads
 * what they are granting before they can hand it out. What changed is where
 * the toggles live: scopes belong to each guardian LINK, so they sit on the
 * guardian's own row rather than once at the top, and they appear only after
 * that link is approved.
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
        color: armed ? '#FAFAF6' : red,
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

function GuardianRow({ guardian, onApprove, onRevoke, onPermissionChange, canManage, busy }) {
  /* Which buttons are present already says where a link stands — Approve is
     only offered on one that has not been granted — so the status pill was
     repeating it and eating a column. A screen reader still gets it spelled
     out beside the name, since button presence is not something it announces. */
  const grantable = guardian.status !== 'approved'
  const permissions = guardian.permissions ?? {}
  /* Scopes live on the LINK, so the toggles belong to this guardian and not to
     the panel: one guardian may see grades while another sees only attendance.
     They appear once the link is approved — before that its scopes are written
     all-false and a pending guardian reads nothing, so a toggle would be a
     control over nothing. */
  const showPermissions = canManage && guardian.permissionsEditable

  return (
    <div
      style={{ padding: '13px 15px', border: `1px solid ${line}`, borderRadius: 12, background: '#FFFFFF' }}
    >
    <div className="flex flex-wrap items-center gap-3">
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
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#FAFAF6', background: green, border: 'none', borderRadius: 10, cursor: 'pointer' }}
            >
              <Check className="h-3.5 w-3.5" /> Approve
            </button>
          )}
          <RevokeButton guardian={guardian} onRevoke={onRevoke} disabled={busy} />
        </div>
      )}
    </div>

      {showPermissions && (
        <div className="flex flex-col gap-2" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${line}` }}>
          <p style={{ fontSize: 12, color: faint, margin: '0 0 2px' }}>
            What {guardian.name} can see
          </p>
          {PERMISSIONS.map((perm) => (
            <Toggle
              key={perm.key}
              id={`perm-${guardian.id}-${perm.key}`}
              label={perm.label}
              hint={perm.hint}
              checked={Boolean(permissions[perm.key])}
              disabled={busy}
              onChange={(next) => onPermissionChange?.(guardian, perm.key, next)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ParentalAccessPanel({
  code,
  defaultPermissions = {},
  onDefaultPermissionChange,
  onPermissionChange,
  guardians = [],
  onApprove,
  onRevoke,
  onGenerateCode,
  canManage = true,
  isMinor = false,
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

            {/* --- 1. The code first ----------------------------------------
                Sharing it is not what grants access: a redeemed code creates a
                PENDING link with every scope false, and the student's approval
                is the gate. So the code leads, and the settings that approval
                will apply follow it rather than blocking it.

                T-105 (andecobs-137): this used to read `!canManage ? "you
                don't need a link code" : ...`, hiding the code from every
                minor outright. But guardian_codes' own create rule auto-
                approves a minor's guardian on redeem (RA 10173) rather than
                skipping the code -- a minor uses the SAME code, just without
                the approval step. Hiding it left a minor with no way to ever
                hand their code to a guardian (confirmed against a real
                account: the code existed in Firestore the whole time, minted
                on first view same as an adult's, just never shown). `canManage`
                still gates approving/revoking/toggling scopes below -- a minor
                still cannot do those -- it just no longer gates seeing the
                code itself. */}
            <h3 style={heading}>Guardian link code</h3>

            {!showCode ? (
              <div style={{ ...box, padding: '20px 18px' }}>
                {/* The button stays, but not as a configuration gate — it is
                    there so a live credential is not sitting on screen for a
                    shoulder or a screenshot to pick up. */}
                <p style={{ fontSize: 13, color: muted, margin: '0 auto 14px', lineHeight: 1.5, maxWidth: 400 }}>
                  Your code is hidden until you ask for it. Show it to give to your parent
                  or guardian — they enter it to request access, and you approve every one.
                </p>
                <button
                  type="button"
                  onClick={() => { setRevealed(true); onGenerateCode?.() }}
                  disabled={busy}
                  className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ padding: '11px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 11, cursor: 'pointer' }}
                >
                  Show my code
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
                  {isMinor
                    ? "Give this to your parent or guardian — they enter it in the ActivKlass mobile app to create their account. Because you're a minor, their request connects right away under RA 10173 — you don't need to approve it separately."
                    : 'Give this to your parent or guardian — they enter it in the ActivKlass mobile app to create their account. You still approve or decline every request it produces.'}
                </p>
              </div>
            )}

            {/* --- 2. Then what approving will grant -----------------------
                These are a convenience, not the safety mechanism. A redeemed
                code creates a PENDING link with every scope false, so a
                guardian sees nothing until the student approves them — the
                approval is the gate, and these are simply what that approval
                grants so it can stay one click. Each guardian keeps its own
                four afterwards, on its own row, because scopes live on the
                link and one guardian may see less than another. */}
            {/* Only while nobody is connected. Once a guardian exists they
                carry their own four on their row, and showing a second
                identical set here is the same question asked twice with
                different answers -- the student cannot tell which one is
                real. The stored defaults still apply when a later guardian
                is approved; they just stop being on screen. */}
            {guardians.length === 0 && (
              <>
                <h3 style={heading}>What guardians can see</h3>
                <p style={note}>
                  {canManage
                    ? 'These apply when you approve your first guardian. Nobody sees anything until you approve them, and each guardian can be changed individually afterwards.'
                    : 'These are managed for you and cannot be changed here.'}
                </p>

                <div className="flex flex-col gap-2">
                  {PERMISSIONS.map((perm) => (
                    <Toggle
                      key={perm.key}
                      id={`default-${perm.key}`}
                      label={perm.label}
                      hint={perm.hint}
                      checked={Boolean(defaultPermissions[perm.key])}
                      disabled={!canManage || busy}
                      onChange={(next) => onDefaultPermissionChange?.(perm.key, next)}
                    />
                  ))}
                </div>
              </>
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
                    onPermissionChange={onPermissionChange}
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
