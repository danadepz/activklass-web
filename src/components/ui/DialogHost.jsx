import { useRef, useState, useSyncExternalStore } from 'react'
import { ink, muted, red, sansFamily } from '@/theme'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { getDialogs, settleDialog, subscribeDialogs } from '@/components/ui/dialogs'

/* ------------------------------------------------------------------ *
 * DialogHost — renders whatever confirmDialog()/promptDialog()/alertDialog()
 * has queued. Mounted once, in main.jsx.
 *
 * Owned by the UI/UX lane (see OWNERSHIP.md). The store and the imperative
 * API live in dialogs.js; see the note there for why they are separate files.
 * ------------------------------------------------------------------ */

function ConfirmBody({ spec }) {
  const danger = spec.tone === 'danger'
  const isAlert = spec.kind === 'alert'
  return (
    <Modal
      open
      onClose={() => settleDialog(spec.id, isAlert ? undefined : false)}
      title={spec.title ?? (isAlert ? 'Heads up' : 'Please confirm')}
      size="sm"
      showClose={false}
      footer={
        <>
          {!isAlert && (
            <Button variant="quiet" radius={12} onClick={() => settleDialog(spec.id, false)} style={{ flex: 1 }}>
              {spec.cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button
            variant={!isAlert && danger ? 'dangerSolid' : 'primary'}
            radius={12}
            autoFocus
            onClick={() => settleDialog(spec.id, isAlert ? undefined : true)}
            style={{ flex: 1 }}
          >
            {spec.confirmLabel ?? (isAlert ? 'Got it' : 'Confirm')}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, color: ink, whiteSpace: 'pre-line' }}>{spec.message}</p>
    </Modal>
  )
}

function fieldStyle(error) {
  return {
    width: '100%',
    padding: '11px 13px',
    fontSize: 14,
    fontFamily: sansFamily,
    color: ink,
    border: `1.5px solid ${error ? red : 'rgba(14,42,92,0.14)'}`,
    borderRadius: 10,
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  }
}

function PromptBody({ spec }) {
  const [value, setValue] = useState(spec.defaultValue ?? '')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const submit = (e) => {
    e?.preventDefault?.()
    // `trim: false` matters for passwords, where a trailing space is a
    // character the reader typed on purpose.
    const cleaned = spec.trim === false ? value : value.trim()
    if (spec.required && !cleaned) {
      setError('This field is required.')
      return
    }
    const problem = spec.validate?.(cleaned)
    if (problem) {
      setError(problem)
      return
    }
    settleDialog(spec.id, cleaned)
  }

  const Field = spec.multiline ? 'textarea' : 'input'

  return (
    <Modal
      open
      onClose={() => settleDialog(spec.id, null)}
      title={spec.title ?? 'Enter a value'}
      subtitle={spec.message}
      size="sm"
      showClose={false}
      initialFocusRef={inputRef}
      footer={
        <>
          <Button variant="quiet" radius={12} onClick={() => settleDialog(spec.id, null)} style={{ flex: 1 }}>
            {spec.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant={spec.tone === 'danger' ? 'dangerSolid' : 'primary'}
            radius={12}
            onClick={submit}
            style={{ flex: 1 }}
          >
            {spec.confirmLabel ?? 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        {spec.label && (
          <label
            htmlFor={`prompt-${spec.id}`}
            style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: muted, marginBottom: 6 }}
          >
            {spec.label}
          </label>
        )}
        <Field
          id={`prompt-${spec.id}`}
          ref={inputRef}
          type={spec.multiline ? undefined : (spec.type ?? 'text')}
          rows={spec.multiline ? 3 : undefined}
          value={value}
          placeholder={spec.placeholder}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          className="ak-input"
          style={fieldStyle(error)}
        />
        {error && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: red, fontFamily: sansFamily }}>
            {error}
          </p>
        )}
        {/* Enter submits without the footer button having to be focused. */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}

/**
 * Renders the oldest pending dialog only — these are modal by definition, so a
 * second one waits its turn rather than stacking on top.
 */
export default function DialogHost() {
  const items = useSyncExternalStore(subscribeDialogs, getDialogs, getDialogs)
  const spec = items[0]
  if (!spec) return null
  return spec.kind === 'prompt'
    ? <PromptBody key={spec.id} spec={spec} />
    : <ConfirmBody key={spec.id} spec={spec} />
}
