/**
 * T-99: opening a module file and saving it proposed a name derived from the
 * storage object's full path -- an id prefix and url-encoded folder slashes
 * included -- because nothing ever set a filename on the upload. `saveBlob`
 * (lib/csv.js) sets one directly for a report's own download; a file
 * attachment has no such call site, so the name has to be set on the object
 * itself, at upload time, via Content-Disposition.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(async () => 'https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media'),
  ref: vi.fn((storage, path) => ({ storage, path })),
  uploadBytes: vi.fn(async () => {}),
}))
vi.mock('./firebase', () => ({ storage: {} }))

import { uploadBytes } from 'firebase/storage'
import { composeDownloadName, uploadAttachment } from './attachments'

describe('composeDownloadName', () => {
  it('builds a readable, hyphenated name from what the person named their file', () => {
    // The ticket's own example of a "structured" name.
    expect(composeDownloadName('Mathematics 3 Module 2 Multiplication.pdf'))
      .toBe('Mathematics-3-Module-2-Multiplication.pdf')
  })

  it('keeps the original extension, lowercased', () => {
    expect(composeDownloadName('Reviewer.PDF')).toBe('Reviewer.PDF'.replace('PDF', 'pdf'))
  })

  it('collapses punctuation and repeated separators instead of stacking hyphens', () => {
    expect(composeDownloadName('My__Notes -- v2!!.docx')).toBe('My-Notes-v2.docx')
  })

  it('never proposes an empty name', () => {
    expect(composeDownloadName('')).toBe('file')
  })

  it('treats a leading dot as part of the name, not an extension marker', () => {
    // A single leading dot never marks an extension -- ".pdf" and ".htaccess"
    // are both a whole (dotfile-shaped) name with nothing to split off.
    expect(composeDownloadName('.htaccess')).toBe('htaccess')
    expect(composeDownloadName('.pdf')).toBe('pdf')
  })

  it('is ASCII-only, so the result is always safe inside a quoted header value', () => {
    const name = composeDownloadName('Café — Notes (Übung).pdf')
    expect(name).toMatch(/^[A-Za-z0-9-]+\.pdf$/)
  })
})

describe('uploadAttachment', () => {
  it('sets an inline Content-Disposition carrying the composed name, so the file still previews', async () => {
    const file = { name: 'Mathematics 3 Module 2 Multiplication.pdf', type: 'application/pdf' }
    await uploadAttachment('learning_materials/syl1/123-Mathematics 3 Module 2 Multiplication.pdf', file)

    expect(uploadBytes).toHaveBeenCalledTimes(1)
    const [, uploadedFile, metadata] = uploadBytes.mock.calls[0]
    expect(uploadedFile).toBe(file)
    expect(metadata.contentType).toBe('application/pdf')
    expect(metadata.contentDisposition).toBe(
      'inline; filename="Mathematics-3-Module-2-Multiplication.pdf"',
    )
  })
})
