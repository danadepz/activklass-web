/**
 * One deliverable as the dashboard lists it: kind, class, title, the window
 * chip, and where to go -- a quiz to its player, a task to its sub-module on
 * the class's Modules tab (both hrefs come from lib/deliverables, the same
 * link a publish notification carries).
 *
 * Owned by the Student lane (see OWNERSHIP.md). Shared by the "Up next"
 * list and the calendar's day list so the two views read the same.
 */
import { Link } from 'react-router-dom'
import { faint, ink, line, muted } from '@/theme'
import { KIND_LABEL } from '@/lib/deliverables'
import { WindowChip } from './WindowChip'

export function DeliverableRow({ item, now }) {
  return (
    <Link
      to={item.href}
      data-deliverable={`${item.source}:${item.id}`}
      className="ak-card-hov focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E2A5C]"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none',
        padding: '10px 12px', borderRadius: 12, border: `1px solid ${line}`, background: '#FFFFFF',
      }}
    >
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 16, background: 'rgba(14,42,92,0.06)' }}>
        {item.source === 'quiz' ? '📝' : '📋'}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {KIND_LABEL[item.kind] ?? KIND_LABEL.other}{item.className ? ` · ${item.className}` : ''}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
          {item.title}
        </div>
        <div style={{ marginTop: 5 }}>
          <WindowChip item={item} now={now} />
        </div>
      </div>
      <span aria-hidden="true" style={{ color: faint, fontSize: 16, flexShrink: 0 }}>›</span>
    </Link>
  )
}
