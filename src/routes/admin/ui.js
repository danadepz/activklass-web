/** Shared chrome for the admin console tabs. */
import { navy, navyDeep, ink, line, sansFamily as sans } from '@/theme'

export const ROLES = ['admin', 'teacher', 'student', 'parent']
export const MIN_PASSWORD = 8

export const card = { background: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 16 }

export const field = {
  width: '100%', padding: '10px 12px', fontSize: 14, fontFamily: sans, color: ink,
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 10,
}

export const btnPrimary = {
  padding: '10px 18px', fontSize: 14, fontWeight: 700, fontFamily: sans, color: '#FAFAF6',
  background: navy, border: 'none', borderRadius: 10, cursor: 'pointer',
  boxShadow: `0 3px 0 ${navyDeep}`,
}

export const btnGhost = {
  padding: '7px 12px', fontSize: 13, fontWeight: 600, fontFamily: sans, color: '#3A4A6B',
  background: '#FFFFFF', border: '1.5px solid rgba(14,42,92,0.14)', borderRadius: 9,
  cursor: 'pointer',
}

export const th = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
}
