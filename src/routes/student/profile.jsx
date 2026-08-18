import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { useAuth } from '@/context/useAuth'
import { ageFromBirthdate } from '@/lib/roster'
import { ShieldCheck, Check, X } from '@/components/icons'
import { navy, ink, goldDeep, muted, faint, green, red, line, serif } from '@/theme'

const STATUS_META = {
  approved: { label: 'Approved', fg: green, bg: 'rgba(31,138,91,0.10)', border: 'rgba(31,138,91,0.4)' },
  pending: { label: 'Pending', fg: goldDeep, bg: 'rgba(245,197,24,0.18)', border: 'rgba(245,197,24,0.55)' },
  declined: { label: 'Declined', fg: red, bg: 'rgba(192,57,43,0.08)', border: 'rgba(192,57,43,0.38)' },
}

const fieldStyle = { width: '100%', padding: '10px 12px', fontSize: 14, color: ink, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9 }
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: ink, marginBottom: 6 }

function InfoCell({ label, value }) {
  return (
    <div style={{ padding: '13px 16px', border: `1px solid ${line}`, borderRadius: 12, background: 'rgba(14,42,92,0.015)' }}>
      <div style={{ fontSize: 12, color: muted, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 600, color: ink }}>{value ?? '—'}</div>
    </div>
  )
}

function Avatar({ profile, uploading, onPick }) {
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
      <label
        htmlFor="avatar-input"
        title="Change photo"
        style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: navy, color: '#FFFFFF', display: 'grid', placeItems: 'center', cursor: uploading ? 'wait' : 'pointer', border: '2px solid #FFFFFF', fontSize: 12 }}
      >
        {uploading ? '…' : '📷'}
      </label>
      <input id="avatar-input" type="file" accept="image/*" onChange={onPick} disabled={uploading} style={{ display: 'none' }} />
    </div>
  )
}

export default function StudentProfile() {
  const { profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  const age = ageFromBirthdate(profile.birthdate) ?? profile.age ?? null
  const isAdult = age != null ? age >= 18 : null

  // --- Profile photo upload ---
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState(null)

  async function handlePhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setPhotoError(null)
    try {
      const safe = file.name.replace(/[^\w.-]/g, '_')
      const r = ref(storage, `avatars/${profile.id}/${Date.now()}-${safe}`)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      await updateDoc(doc(db, 'users', profile.id), { photo_url: url })
      await refreshProfile()
    } catch (err) {
      setPhotoError(err.message || 'Could not upload the image.')
    } finally {
      setUploading(false)
    }
  }

  // --- Edit personal details ---
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [form, setForm] = useState(null)

  function startEdit() {
    setForm({
      first_name: profile.first_name ?? '',
      middle_name: profile.middle_name ?? '',
      last_name: profile.last_name ?? '',
      course: profile.course ?? '',
      year_level: profile.year_level ?? '',
      birthdate: profile.birthdate ?? '',
    })
    setFormError(null)
    setEditing(true)
  }

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function saveProfile() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setFormError('First name and last name are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const patch = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_name: form.middle_name.trim() || null,
        course: form.course.trim() || null,
        year_level: form.year_level.trim() || null,
      }
      if (form.birthdate) {
        patch.birthdate = form.birthdate
        patch.age = ageFromBirthdate(form.birthdate)
      }
      await updateDoc(doc(db, 'users', profile.id), patch)
      await refreshProfile()
      setEditing(false)
    } catch (err) {
      setFormError(err.message || 'Could not save your changes.')
    } finally {
      setSaving(false)
    }
  }

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

  const canManage = isAdult === true && consent?.is_minor === false
  const status = consent?.status ?? null
  const meta = status ? STATUS_META[status] : null
  const parentName = consent
    ? [consent.parent_first_name, consent.parent_last_name].filter(Boolean).join(' ')
    : null

  const fullName = [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')

  return (
    <div style={{ maxWidth: 1040 }}>
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
            <Avatar profile={profile} uploading={uploading} onPick={handlePhoto} />
            <div style={{ minWidth: 0 }}>
              <div style={{ ...serif, fontSize: 22, color: ink, lineHeight: 1.1 }}>{fullName || 'Your name'}</div>
              <div style={{ fontSize: 13, color: muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.email}</div>
            </div>
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="transition hover:bg-slate-50"
              style={{ flexShrink: 0, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, color: navy, background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.16)', borderRadius: 10, cursor: 'pointer' }}
            >
              Edit
            </button>
          )}
        </div>

        {photoError && (
          <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>{photoError}</p>
        )}

        {editing ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label style={labelStyle}>First name <span style={{ color: red }}>*</span></label>
                <input value={form.first_name} onChange={setField('first_name')} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Last name <span style={{ color: red }}>*</span></label>
                <input value={form.last_name} onChange={setField('last_name')} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Middle name</label>
                <input value={form.middle_name} onChange={setField('middle_name')} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Birthdate</label>
                <input type="date" value={form.birthdate} onChange={setField('birthdate')} style={{ ...fieldStyle, cursor: 'pointer' }} />
              </div>
              <div>
                <label style={labelStyle}>Course / Strand</label>
                <input value={form.course} onChange={setField('course')} placeholder="e.g. STEM, BSIT" style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Year / Grade level</label>
                <input value={form.year_level} onChange={setField('year_level')} placeholder="e.g. Grade 10, 1st Year" style={fieldStyle} />
              </div>
            </div>

            <p style={{ fontSize: 12, color: faint, margin: 0 }}>
              Your student number, LRN, and email are managed by your school and can't be edited here.
            </p>

            {formError && (
              <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px' }}>{formError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="transition hover:brightness-110 disabled:opacity-50"
                style={{ padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#FAFAF6', background: navy, border: 'none', borderRadius: 10, cursor: 'pointer' }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: '#3A4A6B', background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCell label="Student number" value={profile.student_number} />
            <InfoCell label="DepEd LRN" value={profile.lrn} />
            <InfoCell label="Course / Strand" value={profile.course} />
            <InfoCell label="Year / Grade level" value={profile.year_level} />
            <InfoCell label="Birthdate" value={profile.birthdate} />
            <InfoCell label="Age" value={age == null ? '—' : `${age} ${isAdult ? '(of legal age)' : '(minor)'}`} />
          </div>
        )}
      </section>

      {/* Parental access / consent management */}
      <section style={{ background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 18, padding: 24, marginTop: 20 }}>
        <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(14,42,92,0.07)', color: navy, display: 'grid', placeItems: 'center' }}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: ink, margin: 0 }}>Parental Access</h2>
            <p style={{ fontSize: 12.5, color: faint, margin: '2px 0 0' }}>RA 10173 — Data Privacy Act of 2012</p>
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse" style={{ height: 90, borderRadius: 12, background: 'rgba(14,42,92,0.05)', marginTop: 14 }} />
        ) : !consent ? (
          <p style={{ fontSize: 14, color: muted, marginTop: 14 }}>
            No parent or guardian is currently linked to your account.
          </p>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div className="flex flex-wrap items-center justify-between gap-3" style={{ background: 'rgba(14,42,92,0.025)', border: `1px solid ${line}`, borderRadius: 12, padding: '14px 16px' }}>
              <div>
                <div style={{ fontSize: 11, color: faint, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Linked parent / guardian</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: ink, marginTop: 3 }}>{parentName || 'Parent/Guardian'}</div>
                <div style={{ fontSize: 12, color: faint, marginTop: 1 }}>{consent.parent_id}</div>
              </div>
              {meta && (
                <span style={{ display: 'inline-block', padding: '5px 13px', fontSize: 12, fontWeight: 700, borderRadius: 999, color: meta.fg, background: meta.bg, border: `1px solid ${meta.border}` }}>
                  {meta.label}
                </span>
              )}
            </div>

            {mutation.isError && (
              <p role="alert" style={{ fontSize: 13, color: red, background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 12 }}>
                Couldn't update consent. {mutation.error?.message}
              </p>
            )}

            {canManage ? (
              <>
                <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, margin: '16px 0 12px' }}>
                  {status === 'approved'
                    ? 'Your parent/guardian can currently view your grades, attendance, and performance. You can revoke this at any time.'
                    : 'Your parent/guardian is requesting access to view your academic performance. You decide whether to grant it.'}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => mutation.mutate('approved')}
                    disabled={mutation.isPending || status === 'approved'}
                    className="transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 14, fontWeight: 700, color: '#FFFFFF', background: green, border: 'none', borderRadius: 11, cursor: 'pointer' }}
                  >
                    <Check className="h-4 w-4" /> Approve access
                  </button>
                  <button
                    onClick={() => mutation.mutate('declined')}
                    disabled={mutation.isPending || status === 'declined'}
                    className="transition hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', fontSize: 14, fontWeight: 700, color: red, background: '#FFFFFF', border: '1.5px solid rgba(192,57,43,0.35)', borderRadius: 11, cursor: 'pointer' }}
                  >
                    <X className="h-4 w-4" /> {status === 'approved' ? 'Revoke access' : 'Decline'}
                  </button>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 13.5, color: muted, lineHeight: 1.55, marginTop: 14 }}>
                Because you are a minor, your parent or guardian has guardian access to your
                academic records under RA 10173. This access is managed by your school and
                cannot be changed here.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
