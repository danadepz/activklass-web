import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const performanceSource = readFileSync(new URL('./performance.jsx', import.meta.url), 'utf8')
const syncSource = readFileSync(new URL('../../../../hooks/useQuizRecordSync.js', import.meta.url), 'utf8')

describe('Performance loads quiz scores without opening Class Record', () => {
  it('starts the shared class-scoped idempotent poster after its own gradebook and quiz queries resolve', () => {
    expect(performanceSource).toContain("useAutoPostScores({")
    expect(performanceSource).toContain('quizzesToAutoPost(quizzes ?? [], classId)')
    expect(performanceSource).toContain('enabled: !!bundle?.configured && !quizzesLoading && !quizzesError')
    expect(performanceSource).toContain("queryKey: ['fs-record', classId]")
  })

  it('waits for the active gradebook refresh and exposes sync failures', () => {
    expect(syncSource).toContain('await onPosted?.()')
    expect(performanceSource).toContain('autoPost.status === \'posting\'')
    expect(performanceSource).toContain('autoPost.skipped.join')
    expect(performanceSource).toContain('Quiz results could not be refreshed')
  })
})
