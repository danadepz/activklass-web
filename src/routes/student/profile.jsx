import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { ageFromBirthdate } from '@/lib/roster'
import ParentalAccessPanel from '@/components/ParentalAccessPanel'
import { useGuardianAccess } from '@/hooks/useGuardianAccess'
import { navy, ink, muted, faint, red, line, serif, sansFamily as sans } from '@/theme'
import ChangePassword from '@/components/ChangePassword'
import SignOutButton from '@/components/SignOutButton'
import { ACCEPT, fileToAvatarDataUrl } from '@/lib/avatar'

function InfoCell({ label, value }) {
  return (
    <div style={{ padding: '13px 16px', border: `1px solid ${line}`, borderRadius: 12, background: 'rgba(14,42,92,0.015)' }}>
      <div style={{ fontSize: 12, color: muted, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 600, color: ink }}>{value ?? '—'}</div>
    </div>
  )
}

function Avatar({ profile, busy, open, onToggle }) {
  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase()
  return (
    <div style={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
      {profile.photo_url ? (
        <img src={profile.photo_url} alt="Your profile" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(14,42,92,0.1)' }} />
      ) : (
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #F5C518, #3FA9F5)', display: 'grid', placeItems: 'center', color: navy, fontWeight: 800, fontSize: 22 }}>
          {initials}
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        title="Change photo"
        aria-label="Change photo"
        aria-expanded={open}
        style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: navy, color: '#FAFAF6', display: 'grid', placeItems: 'center', cursor: busy ? 'wait' : 'pointer', border: '2px solid #FFFFFF', fontSize: 12, padding: 0 }}
      >
        {busy ? '…' : '📷'}
      </button>
    </div>
  )
}

/** Sign out, moved here from the portal header (T-95, andecobs-121) to match
 *  the teacher's account page: one place to end the session, at the bottom of
 *  the profile screen, not sitting in the chrome at every width. */
function SignOutCard() {
  return (
    <div
      style={{
        background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: '18px 24px',
        marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
      }}
    >
      <div>
        <h2 style={{ ...serif, fontSize: 18, color: ink, margin: 0 }}>Sign out</h2>
        <p style={{ fontSize: 13, color: muted, margin: '2px 0 0' }}>
          End your session on this device. You will be asked to confirm first.
        </p>
      </div>
      <SignOutButton
        style={{
          padding: '9px 18px', fontSize: 13.5, fontWeight: 700, fontFamily: sans,
          color: '#FAFAF6', background: red, border: 'none', borderRadius: 10, cursor: 'pointer',
          flexShrink: 0,
        }}
      />
    </div>
  )
}

export default function StudentProfile() {
  const { profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const age = ageFromBirthdate(profile.birthdate) ?? profile.age ?? null
  const isAdult = age != null ? age >= 18 : null

  // --- Profile photo ---
  /* The camera badge opens the device file picker. It used to open a
     paste-a-link field, because Cloud Storage was not provisioned on this
     project until 2026-09-12 (Spark plan, no bucket) — so a student was asked
     for a Google Drive or Photos share link rather than their own photo.
     The photo is cropped and resized to ~256px in the browser and stored
     inline on the profile; see lib/avatar.js for why that is safe here and
     not for the other attachment features. */
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState(null)

  async function onPhotoPicked(event) {
    const file = event.target.files?.[0]
    // Let the same file be chosen again after an error, which the input
    // otherwise ignores because its value has not changed.
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setPhotoError(null)
    try {
      const dataUrl = await fileToAvatarDataUrl(file)
      await updateDoc(doc(db, 'users', profile.id), { photo_url: dataUrl })
      await refreshProfile()
    } catch (err) {
      setPhotoError(err.message || 'Could not save the photo.')
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto() {
    setUploading(true)
    setPhotoError(null)
    try {
      await updateDoc(doc(db, 'users', profile.id), { photo_url: null })
      await refreshProfile()
    } catch (err) {
      setPhotoError(err.message || 'Could not remove the photo.')
    } finally {
      setUploading(false)
    }
  }

  // --- Personal email (password recovery, T-139) ---
  const [personalEmail, setPersonalEmail] = useState(profile.personal_email ?? '')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailStatus, setEmailStatus] = useState(null)

  async function handleSaveEmail(e) {
    e?.preventDefault()
    setEmailStatus(null)
    const trimmed = (personalEmail ?? '').trim()
    if (trimmed && !trimmed.includes('@')) {
      setEmailStatus({ error: 'Please enter a valid email address.' })
      return
    }
    setEmailSaving(true)
    try {
      await updateDoc(doc(db, 'users', profile.id), { personal_email: trimmed || null })
      await refreshProfile()
      setEmailStatus({ success: 'Password recovery email saved.' })
    } catch (err) {
      setEmailStatus({ error: err.message || 'Could not save the recovery email.' })
    } finally {
      setEmailSaving(false)
    }
  }

  /* The photo and password recovery email are the ONLY fields a student may
     change (T-139). Name, student number, LRN, course, year level and birthdate
     are registrar data -- a student editing their own birthdate could flip
     themselves to "of legal age" and unlock the guardian-access panel below,
     so the edit form was removed rather than trimmed. Teachers maintain these
     fields from the class roster. firestore.rules is what actually enforces
     this; the UI just stops asking. */

  // --- Consent (unchanged) ---
  const { data: consent, isLoading } = useQuery({
    queryKey: ['student-consent', profile.id],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'consent_records', profile.id))
      return snap.exists() ? snap.data() : null
    },
  })

  const mutation = useMutation({
    mutationFn: async (status) => {
      await updateDoc(doc(db, 'consent_records', profile.id), { status, signed_at: serverTimestamp() })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student-consent', profile.id] }),
  })

  /* A student manages their own access once they are of legal age.
     This deliberately does NOT require a consent record to exist: under the
     code flow the student sets permissions and shares their code BEFORE any
     guardian is linked, so gating on `consent.is_minor === false` locked the
     panel for exactly the people who need it first. An explicit minor flag on
     the record still wins when there is one. */
  const canManage = isAdult === true && consent?.is_minor !== true

  /* Locked for two quite different reasons -- saying "you are a minor" to a
     student who simply has no birthdate on file would be both wrong and a
     dead end, since it never says what to do about it. */
  const lockedReason = canManage
    ? null
    : age == null
      ? 'Your birthdate is not on file, so we cannot confirm you are of legal age to manage guardian access. Ask your teacher to add it to your record.'
      : 'Because you are a minor, your parent or guardian has guardian access to your academic records under RA 10173. It was set up for you by your teacher and cannot be changed here.'
  const parentName = consent
    ? [consent.parent_first_name, consent.parent_last_name].filter(Boolean).join(' ')
    : null

  // --- Parental access -----------------------------------------------------
  /* Real now. `const linkCode = 'K7M2Q9'` used to sit here with a note saying
     the backend work was pending -- the same six characters for every student,
     wired to nothing, alongside a "Preview Guardian" placeholder row. Both are
     gone: the hook reads the guardian_codes and guardian_links collections the
     mobile app writes, so a student's code is the same on either device. */
  const access = useGuardianAccess(profile.id, profile.birthdate)

  const fullName = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <h1 className="text-[clamp(28px,4vw,38px)]" style={{ ...serif, lineHeight: 1.1, margin: '0 0 4px', color: ink }}>
        Profile &amp; Settings
      </h1>
      <p style={{ fontSize: 14, color: muted, margin: '0 0 24px' }}>
        Your account details and who can view your academic performance.
      </p>

      {/* Account details */}
      <section style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 24 }}>
        <div className="flex items-center justify-between gap-4" style={{ marginBottom: 18 }}>
          <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
            <Avatar
              profile={profile}
              busy={uploading}
              open={false}
              onToggle={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={onPhotoPicked}
              style={{ display: 'none' }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 22, color: ink, lineHeight: 1.1 }}>{fullName || 'Your name'}</div>
              <div style={{ fontSize: 13, color: muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.login_id ?? profile.email}</div>
            </div>
          </div>
        </div>

        {profile.photo_url && (
          <button
            type="button"
            onClick={removePhoto}
            disabled={uploading}
            style={{ fontSize: 12.5, color: muted, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Remove photo
          </button>
        )}

        {photoError && (
          <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>{photoError}</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCell label="Student number" value={profile.student_number} />
          <InfoCell label="DepEd LRN" value={profile.lrn} />
          <InfoCell label="Course / Strand" value={profile.course} />
          <InfoCell label="Year / Grade level" value={profile.year_level} />
          <InfoCell label="Birthdate" value={profile.birthdate} />
          <InfoCell label="Age" value={age == null ? '—' : `${age} ${isAdult ? '(of legal age)' : '(minor)'}`} />
        </div>

        {/* Password recovery email (T-139) */}
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${line}` }}>
          <form onSubmit={handleSaveEmail}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 520 }}>
              <label htmlFor="recovery-email" style={{ fontSize: 13, fontWeight: 700, color: ink, fontFamily: sans }}>
                Password recovery email
              </label>
              <p style={{ fontSize: 12.5, color: muted, margin: 0, lineHeight: 1.4 }}>
                Used to reset your password if you ever forget it. You will still sign in with your login ID ({profile.login_id ?? profile.email}).
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <input
                  id="recovery-email"
                  type="email"
                  placeholder="e.g. sample.student@gmail.com"
                  value={personalEmail}
                  onChange={(e) => {
                    setPersonalEmail(e.target.value)
                    if (emailStatus) setEmailStatus(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 14,
                    fontFamily: sans,
                    color: ink,
                    background: '#FFFFFF',
                    border: `1.5px solid ${line}`,
                    borderRadius: 10,
                  }}
                />
                <button
                  type="submit"
                  disabled={emailSaving}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13.5,
                    fontWeight: 700,
                    fontFamily: sans,
                    color: '#FAFAF6',
                    background: navy,
                    border: 'none',
                    borderRadius: 10,
                    cursor: emailSaving ? 'wait' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {emailSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
              {emailStatus?.error && (
                <p role="alert" style={{ fontSize: 12.5, color: red, margin: '4px 0 0' }}>{emailStatus.error}</p>
              )}
              {emailStatus?.success && (
                <p role="status" style={{ fontSize: 12.5, color: '#27AE60', margin: '4px 0 0', fontWeight: 600 }}>{emailStatus.success}</p>
              )}
            </div>
          </form>
        </div>

        <p style={{ fontSize: 12, color: faint, margin: '14px 0 0' }}>
          Your name and these details were set up for you. Ask your teacher
          to correct anything that is wrong. Your profile photo and password recovery email are yours to change.
        </p>
      </section>

      <ParentalAccessPanel
        code={access.code}
        guardians={access.guardians}
        onPermissionChange={access.setGuardianPermission}
        defaultPermissions={access.defaultPermissions}
        onDefaultPermissionChange={access.setDefaultPermission}
        onApprove={access.approveGuardian}
        onRevoke={access.revokeGuardian}
        /* Deliberately NOT rotateCode: the panel fires this when the student
           reveals their code, and rotating there would mint a new one every
           time they looked at it, silently breaking any code already shared. */
        onGenerateCode={undefined}
        /* Two gates, and both have to hold. `canManage` above is this page's
           age check off the roster record; the hook re-derives the same thing
           from the birthdate, and firestore.rules enforces it a third time on
           the write. A minor sees the panel disabled, never hidden -- they
           still need to see who is watching. */
        canManage={canManage && access.canManage}
        /* T-105: a minor still gets shown their own code (guardian_codes'
           create rule auto-approves on redeem for them, RA 10173) -- `canManage`
           above only gates approving/revoking/toggling scopes, not visibility.
           This tells the panel which caption to use under the revealed code. */
        isMinor={isAdult === false || consent?.is_minor === true}
        lockedReason={lockedReason}
        loading={isLoading || access.loading}
        busy={access.busy}
        error={access.error}
      />

      <ChangePassword />
      <SignOutCard />
    </div>
  )
}
