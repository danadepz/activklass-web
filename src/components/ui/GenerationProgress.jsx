import { gold, heading, ink, line, muted, navy, sansFamily } from '@/theme'

export default function GenerationProgress({ title, description }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-10 flex items-center justify-center px-5"
      style={{ background: 'rgba(10,23,51,0.3)', backdropFilter: 'blur(4px)', fontFamily: sansFamily }}
    >
      <div
        className="flex w-full max-w-sm flex-col items-center rounded-3xl bg-white px-7 py-8 text-center sm:px-9 sm:py-10"
        style={{ border: `1px solid ${line}`, boxShadow: '0 24px 80px -20px rgba(10,23,51,0.45)' }}
      >
        <span
          aria-hidden="true"
          className="mb-6 grid h-20 w-20 place-items-center rounded-full"
          style={{ background: 'rgba(14,42,92,0.04)' }}
        >
          <span
            className="h-12 w-12 animate-spin rounded-full border-[3px]"
            style={{ borderColor: 'rgba(14,42,92,0.12)', borderTopColor: navy, borderRightColor: gold }}
          />
        </span>
        <p style={{ ...heading, color: ink, fontSize: 20, lineHeight: 1.4, margin: 0 }}>{title}</p>
        <p style={{ color: muted, fontSize: 13.5, lineHeight: 1.7, margin: '10px 0 0' }}>{description}</p>
        <p
          className="mt-6 w-full border-t pt-5"
          style={{ borderColor: line, color: muted, fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}
        >
          This may take a moment. Please keep this window open.
        </p>
      </div>
    </div>
  )
}
