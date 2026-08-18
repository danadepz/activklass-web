import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/useAuth'
import { adminUsersKey, useAdminUsers, setUserRole, setUserStatus } from '@/hooks/useAdminUsers'
import { createUser, resetPassword, setAccountDisabled } from '@/lib/admin'
import { downloadCsv, stampedName } from '@/lib/csv'
import { navy, ink, muted, faint, green, red, line, serif, mono } from '@/theme'
import { ROLES, MIN_PASSWORD, card, field, btnPrimary, btnGhost, th } from './ui'
import Notice from './Notice'
import BulkUpload from './BulkUpload'

const ROLE_TINT = {
  admin: { fg: navy, bg: 'rgba(14,42,92,0.08)' },
  teacher: { fg: green, bg: 'rgba(31,138,91,0.10)' },
  student: { fg: '#1E6FB0', bg: 'rgba(30,111,176,0.10)' },
  parent: { fg: '#8B6A00', bg: 'rgba(245,197,24,0.18)' },
}

function Pill({ tint, children }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: tint.fg, background: tint.bg, borderRadius: 20, padding: '3px 10px',
    }}>
      {children}
    </span>
  )
}

/* ─────────────────────────── create user ─────────────────────────── */

function CreateUserForm({ onCreated }) {
  const blank = { email: '', password: '', role: 'teacher', firstName: '', lastName: '' }
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const mut = useMutation({
    mutationFn: createUser,
    onSuccess: (res) => {
      setDone(`Created ${res.user.email}. They can sign in with the password you set.`)
      setForm(blank)
      setError('')
      onCreated()
    },
    onError: (e) => { setError(e.message); setDone('') },
  })

  function submit(e) {
    e.preventDefault()
    setDone('')
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('First and last name are required.')
    if (!form.email.trim()) return setError('Email is required.')
    if (form.password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`)
    setError('')
    mut.mutate(form)
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <form onSubmit={submit} style={{ ...card, padding: 22 }}>
      <h2 style={{ ...serif, fontSize: 20, color: ink, margin: '0 0 4px' }}>Add a user</h2>
      <p style={{ fontSize: 13, color: muted, margin: '0 0 18px' }}>
        Creates the sign-in account and the profile together. Give them the password directly —
        it is not emailed.
      </p>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          First name
          <input style={{ ...field, marginTop: 6 }} value={form.firstName} onChange={set('firstName')} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Last name
          <input style={{ ...field, marginTop: 6 }} value={form.lastName} onChange={set('lastName')} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Email
          <input style={{ ...field, marginTop: 6 }} type="email" value={form.email} onChange={set('email')} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Role
          <select style={{ ...field, marginTop: 6, cursor: 'pointer' }} value={form.role} onChange={set('role')}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: ink }}>
          Temporary password
          <input style={{ ...field, marginTop: 6 }} type="text" value={form.password}
                 onChange={set('password')} placeholder={`at least ${MIN_PASSWORD} characters`} />
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="submit" style={btnPrimary} disabled={mut.isPending}>
          {mut.isPending ? 'Creating…' : 'Create user'}
        </button>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Notice>{error}</Notice>
          <Notice tone="ok">{done}</Notice>
        </div>
      </div>
    </form>
  )
}

/* ─────────────────────────── user row ─────────────────────────── */

function UserRow({ user, isSelf, onChanged }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const active = (user.status ?? 'active') === 'active'
  const tint = ROLE_TINT[user.role] ?? ROLE_TINT.student

  async function run(label, fn) {
    setBusy(label); setError('')
    try { await fn(); onChanged() } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  function toggleActive() {
    const next = active ? 'inactive' : 'active'
    if (active && !window.confirm(
      `Deactivate ${user.first_name} ${user.last_name}? They will be hidden from rosters and unable to sign in.`,
    )) return
    // Both halves: status hides them from the app, disabled stops the login.
    // Doing only the first leaves a working account.
    run('status', async () => {
      await setUserStatus(user.id, next)
      await setAccountDisabled(user.id, active)
    })
  }

  function changeRole(e) {
    const role = e.target.value
    if (!window.confirm(`Change ${user.first_name}'s role to ${role}?`)) return
    run('role', () => setUserRole(user.id, role))
  }

  function doReset() {
    const pw = window.prompt(`New password for ${user.email} (min ${MIN_PASSWORD} characters):`)
    if (pw == null) return
    if (pw.length < MIN_PASSWORD) { setError(`Password must be at least ${MIN_PASSWORD} characters.`); return }
    run('password', () => resetPassword(user.id, pw))
  }

  return (
    <tr style={{ borderTop: `1px solid ${line}` }}>
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: ink }}>
          {user.last_name}, {user.first_name}
          {isSelf && <span style={{ ...mono, fontSize: 11, color: faint, marginLeft: 8 }}>you</span>}
        </div>
        <div style={{ fontSize: 12.5, color: muted }}>{user.email}</div>
        {error && <div style={{ fontSize: 12, color: red, marginTop: 4 }}>{error}</div>}
      </td>

      <td style={{ padding: '12px 14px' }}>
        {isSelf ? (
          <Pill tint={tint}>{user.role}</Pill>
        ) : (
          <select value={user.role ?? 'student'} onChange={changeRole} disabled={!!busy}
                  style={{ ...field, padding: '6px 10px', fontSize: 13, cursor: 'pointer', width: 'auto' }}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </td>

      <td style={{ padding: '12px 14px' }}>
        <Pill tint={active ? { fg: green, bg: 'rgba(31,138,91,0.10)' } : { fg: red, bg: 'rgba(192,57,43,0.08)' }}>
          {active ? 'active' : 'inactive'}
        </Pill>
      </td>

      <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button style={btnGhost} onClick={doReset} disabled={!!busy}>
          {busy === 'password' ? '…' : 'Reset password'}
        </button>
        <button
          style={{ ...btnGhost, marginLeft: 8, color: active ? red : green,
                   borderColor: active ? 'rgba(192,57,43,0.3)' : 'rgba(31,138,91,0.3)' }}
          onClick={toggleActive}
          disabled={!!busy || isSelf}
          title={isSelf ? 'You cannot deactivate your own account' : undefined}
        >
          {busy === 'status' ? '…' : active ? 'Deactivate' : 'Reactivate'}
        </button>
      </td>
    </tr>
  )
}

export default function UsersTab() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: users = [], isLoading, isError, error } = useAdminUsers()
  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: adminUsersKey })

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q)
    })
  }, [users, roleFilter, search])

  function exportCsv() {
    downloadCsv(stampedName('users'), [
      ['Last name', 'First name', 'Email', 'Role', 'Status'],
      ...shown.map((u) => [u.last_name, u.first_name, u.email, u.role, u.status ?? 'active']),
    ])
  }

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <CreateUserForm onCreated={refresh} />
      <BulkUpload onDone={refresh} />

      <section style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: `1px solid ${line}`,
                      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...serif, fontSize: 20, color: ink, margin: 0, flex: 1 }}>
            Users <span style={{ ...mono, fontSize: 13, color: faint }}>{shown.length}</span>
          </h2>
          <input placeholder="Search name or email" value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 style={{ ...field, width: 220, padding: '8px 12px', fontSize: 13 }} />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
                  style={{ ...field, width: 'auto', padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>
            <option value="all">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button style={btnGhost} onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
        </div>

        {isLoading && <p style={{ padding: 24, color: faint }}>Loading users…</p>}
        {isError && <div style={{ padding: 20 }}><Notice>{error?.message ?? 'Could not load users.'}</Notice></div>}

        {!isLoading && !isError && (
          shown.length === 0 ? (
            <p style={{ padding: 28, textAlign: 'center', color: faint }}>No users match that filter.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'rgba(14,42,92,0.03)' }}>
                    {['Name', 'Role', 'Status', ''].map((h, i) => (
                      <th key={h || i} style={{ ...th, color: muted, textAlign: i === 3 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <UserRow key={u.id} user={u} isSelf={u.id === profile.id} onChanged={refresh} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>
    </div>
  )
}
