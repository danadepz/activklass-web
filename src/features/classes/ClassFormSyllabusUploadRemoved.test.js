import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const source = readFileSync(fileURLToPath(new URL('./ClassFormModal.jsx', import.meta.url)), 'utf8')

describe('class creation keeps syllabus authoring separate from file attachments', () => {
  it('does not render or process a class-creation syllabus upload', () => {
    expect(source).not.toMatch(/type="file"/)
    expect(source).not.toContain('uploadAttachment')
    expect(source).not.toContain('handleFile')
    expect(source).not.toContain('syllabus_file:')
  })

  it('retains the read-only display for historical class syllabus metadata', () => {
    expect(source).toContain('currentSyllabusFile.url')
    expect(source).toContain('currentSyllabusFile.name')
  })
})
