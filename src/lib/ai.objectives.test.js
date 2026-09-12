/**
 * The objective fence on the quiz-generation side of ./ai.js.
 *
 * The backend prompt tells the model to assess only the topic's listed
 * objectives and to name, word for word, the one each question assesses
 * (activklass-backend, services/ai/quiz_gen.py). This is the client's half:
 * tagObjectives() marks a drafted question that names none of them, and
 * draftToQuestions() carries that mark onto the saved question so the editor
 * can show it. A flagged question is the one most likely to be testing what
 * the students never studied -- the frustration this exists to prevent -- and
 * it is flagged, never dropped, because the teacher decides.
 */
import { describe, expect, it } from 'vitest'
import { draftToQuestions, tagObjectives } from './ai.js'

const OBJECTIVES = ['Apply the rule of thirds', 'Use leading lines to direct attention.']

describe('tagObjectives', () => {
  it('passes a question that copies a listed objective', () => {
    const [q] = tagObjectives([{ text: 'x', objective: 'Apply the rule of thirds' }], OBJECTIVES)
    expect(q.off_objective).toBe(false)
    expect(q.objective).toBe('Apply the rule of thirds')
  })

  it('ignores case, spacing and trailing punctuation when matching', () => {
    const [a, b] = tagObjectives(
      [
        { text: 'x', objective: '  apply the RULE of thirds. ' },
        { text: 'y', objective: 'Use leading lines to direct attention' },
      ],
      OBJECTIVES,
    )
    expect(a.off_objective).toBe(false)
    expect(b.off_objective).toBe(false)
  })

  it('accepts a shortened or extended wording of a listed objective', () => {
    const [short, long] = tagObjectives(
      [
        { text: 'x', objective: 'rule of thirds' },
        { text: 'y', objective: 'Apply the rule of thirds to a landscape' },
      ],
      OBJECTIVES,
    )
    expect(short.off_objective).toBe(false)
    expect(long.off_objective).toBe(false)
  })

  it('flags a question whose objective is not one the model was given', () => {
    const [q] = tagObjectives([{ text: 'x', objective: 'Explain depth of field' }], OBJECTIVES)
    expect(q.off_objective).toBe(true)
    expect(q.objective).toBe('Explain depth of field')
  })

  it('flags a question that names no objective at all when objectives were listed', () => {
    const [blank, missing] = tagObjectives([{ text: 'x', objective: '' }, { text: 'y' }], OBJECTIVES)
    expect(blank.off_objective).toBe(true)
    expect(missing.off_objective).toBe(true)
    expect(missing.objective).toBe('')
  })

  it('flags nothing when the topic had no objectives -- there is nothing to check against', () => {
    const tagged = tagObjectives([{ text: 'x', objective: 'Anything' }, { text: 'y', objective: '' }], [])
    expect(tagged.map((q) => q.off_objective)).toEqual([false, false])
  })

  it('never drops a question', () => {
    const tagged = tagObjectives(
      [{ text: 'a', objective: 'nope' }, { text: 'b', objective: 'Apply the rule of thirds' }],
      OBJECTIVES,
    )
    expect(tagged).toHaveLength(2)
  })
})

describe('draftToQuestions carries the fence onto the saved question', () => {
  it('keeps the objective and the flag from a tagged draft', () => {
    const draft = {
      questions: tagObjectives(
        [
          { type: 'true_false', text: 'x', points: 1, answer: true, objective: 'Explain depth of field' },
          { type: 'true_false', text: 'y', points: 1, answer: false, objective: 'Apply the rule of thirds' },
        ],
        OBJECTIVES,
      ),
    }
    const [flagged, fine] = draftToQuestions(draft)
    expect(flagged.ai_generated).toBe(true)
    expect(flagged.off_objective).toBe(true)
    expect(flagged.objective).toBe('Explain depth of field')
    expect(fine.off_objective).toBe(false)
    expect(fine.objective).toBe('Apply the rule of thirds')
  })

  it('defaults to an unflagged, empty objective on a draft that was never tagged', () => {
    const [q] = draftToQuestions({ questions: [{ type: 'true_false', text: 'x', points: 1, answer: true }] })
    expect(q.objective).toBe('')
    expect(q.off_objective).toBe(false)
  })
})
