import { ink } from '@/theme'
// Shared field styling for the Login / Register forms. Kept out of
// AuthLayout.jsx so that file can stay component-only (React Fast Refresh
// requires a module to export either components or plain values, not both).

const sans = "'Plus Jakarta Sans', sans-serif"

export const authInputStyle = {
  width: '100%',
  padding: '14px 16px',
  fontSize: 15,
  fontFamily: sans,
  color: ink,
  background: '#FFFFFF',
  border: '1.5px solid rgba(14,42,92,0.14)',
  borderRadius: 11,
  transition: 'border-color 0.15s, box-shadow 0.15s',
}

export const authLabelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: ink,
  marginBottom: 8,
}
