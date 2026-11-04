import { Check } from '@/components/icons'
import { muted } from '@/theme'
import { MIN_PASSWORD } from '@/lib/validation'

/* T-201 (maykel_64440-301) / T-234 (maykel_64440-321): the same five
   rules passwordError() enforces (lib/validation.js), reported live instead
   of one message at a time -- a checklist does not DEFINE the rules, it only
   reports them, so these checks must stay in the same order and match the
   same regexes passwordError uses. Lifted to components/ for shared use across
   login, reset-password, and admin password reset prompts. */
export const PASSWORD_REQUIREMENTS = [
  { label: `At least ${MIN_PASSWORD} characters`, test: (v) => v.length >= MIN_PASSWORD },
  { label: 'An uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'A number', test: (v) => /\d/.test(v) },
  { label: 'A special character (like ! @ # $)', test: (v) => /[^A-Za-z0-9\s]/.test(v) },
]

export function PasswordChecklist({ value = '' }) {
  return (
    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {PASSWORD_REQUIREMENTS.map(({ label, test }) => {
        const met = test(value)
        return (
          <li key={label} className="flex items-center gap-2" style={{ fontSize: 12, color: met ? '#1F8A5B' : muted }}>
            <span
              aria-hidden="true"
              style={{
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: met ? 'none' : '1.5px solid #C7D0DE',
                background: met ? '#1F8A5B' : 'transparent',
                color: '#FFFFFF',
              }}
            >
              {met && <Check className="h-2.5 w-2.5" />}
            </span>
            {label}
          </li>
        )
      })}
    </ul>
  )
}

export default PasswordChecklist
