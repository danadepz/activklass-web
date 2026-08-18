import { ink, inkMuted as muted, navy, serif, monoFamily as mono } from '@/theme'
/**
 * Minimal, dependency-free markdown renderer for AI study guides.
 *
 * Renders to React elements (never dangerouslySetInnerHTML) so untrusted AI/LLM
 * output can't inject markup — it's XSS-safe by construction. Supports the
 * common subset: #/##/### headings, ordered + unordered lists, **bold**, and
 * `inline code` (also used to show math/equation snippets in monospace).
 */

const codeBg = 'rgba(14,42,92,0.06)'
/** Inline: split on `code`, then **bold** within the plain runs. */
function parseInline(text, keyBase) {
  const out = []
  const codeSplit = text.split(/(`[^`]+`)/g)
  codeSplit.forEach((chunk, ci) => {
    if (!chunk) return
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      out.push(
        <code
          key={`${keyBase}-c${ci}`}
          style={{ fontFamily: mono, fontSize: '0.88em', background: codeBg, color: navy, padding: '1px 6px', borderRadius: 5 }}
        >
          {chunk.slice(1, -1)}
        </code>,
      )
      return
    }
    chunk.split(/(\*\*[^*]+\*\*)/g).forEach((part, pi) => {
      if (!part) return
      if (part.startsWith('**') && part.endsWith('**')) {
        out.push(<strong key={`${keyBase}-b${ci}-${pi}`} style={{ fontWeight: 700, color: ink }}>{part.slice(2, -2)}</strong>)
      } else {
        out.push(<span key={`${keyBase}-t${ci}-${pi}`}>{part}</span>)
      }
    })
  })
  return out
}

export default function Markdown({ text }) {
  if (!text) return null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      i += 1
      continue
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      const size = level === 1 ? 21 : level === 2 ? 17 : 15
      blocks.push(
        <div key={`h${i}`} style={{ ...serif, fontSize: size, color: ink, margin: blocks.length ? '18px 0 8px' : '0 0 8px' }}>
          {parseInline(h[2], `h${i}`)}
        </div>,
      )
      i += 1
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`ol${i}`} style={{ margin: '6px 0', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: 14, color: muted, lineHeight: 1.55 }}>{parseInline(it, `ol${i}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`ul${i}`} style={{ margin: '6px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5, listStyle: 'disc' }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ fontSize: 14, color: muted, lineHeight: 1.55 }}>{parseInline(it, `ul${i}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Paragraph (gather consecutive non-empty, non-block lines)
    const para = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i])
    ) {
      para.push(lines[i])
      i += 1
    }
    blocks.push(
      <p key={`p${i}`} style={{ fontSize: 14, color: muted, lineHeight: 1.6, margin: '0 0 4px' }}>
        {parseInline(para.join(' '), `p${i}`)}
      </p>,
    )
  }

  return <div>{blocks}</div>
}
