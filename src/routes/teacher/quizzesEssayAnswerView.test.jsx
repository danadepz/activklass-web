/**
 * T-199 (maykel_64440-305 / -306 items 8-10) -- a teacher could not see a
 * student's answers, so an essay quiz never reached the gradebook.
 *
 * The scoring/clearing arithmetic is pure and unit-tested in
 * lib/quizGrading.test.js (`applyEssayMarks`). What this file pins is the
 * page wiring: the read-only answer view and essay-marking panel exist, are
 * reachable from a result row, and -- the regression this file exists to
 * catch -- that the "View answers" button's style prop is never built by
 * spreading `sans`.
 *
 * `sans` (imported here as `sansFamily as sans`) is a font-family STRING,
 * used everywhere in this file as `fontFamily: sans`. While building the
 * button this file pins, `style={{ ...sans, ... }}` was written instead of
 * `style={{ fontFamily: sans, ... }}` -- spreading a string spreads its
 * characters onto numeric keys (`{0: "'", 1: "P", ...}`), and React then
 * tries `element.style['0'] = ...`, which throws
 * `Failed to set an indexed property [0] on 'CSSStyleDeclaration'` and white
 * -screens the whole page the instant that button mounts. Caught by actually
 * clicking "View answers" in the browser, not by the build or the other
 * tests in this suite -- none of them render far enough into the modal to
 * mount the button.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = readFileSync(fileURLToPath(new URL('./quizzes.$quizId.jsx', import.meta.url)), 'utf8')

describe('sans is a string, never spread into a style object (T-199 regression)', () => {
  it('has no `...sans` spread anywhere in the file', () => {
    // The only correct form is `fontFamily: sans`. A spread here crashes the
    // page the moment the element mounts -- see the file header for why.
    expect(src).not.toMatch(/\.\.\.sans\b/)
  })

  it('the View answers / Hide answers toggle sets fontFamily: sans, not a spread', () => {
    const btnSrc = src.slice(src.indexOf("'View answers'") - 400, src.indexOf("'View answers'"))
    expect(btnSrc).toMatch(/fontFamily:\s*sans/)
  })
})

describe('the essay answer view and marking panel are wired up (T-199)', () => {
  it('imports the pure essay-marking helper from the data/logic lane', () => {
    expect(src).toMatch(/import\s*\{[^}]*applyEssayMarks[^}]*\}\s*from\s*'@\/lib\/quizGrading'/)
  })

  it('defines the read-only answer view component', () => {
    expect(src).toContain('function AttemptAnswers(')
  })

  it('keeps an attempt its own Firestore id so a mark has somewhere to write', () => {
    // ResultsView used to build attempts from d.data() alone, which drops the
    // document id -- the exact thing AttemptAnswers needs to call updateDoc.
    expect(src).toMatch(/const a = \{ id: d\.id, \.\.\.d\.data\(\) \}/)
  })

  it('a save writes status "graded" once nothing is pending, not "submitted"', () => {
    // quizToRecord's skip (quizScoreCells) treats "submitted" as unscorable
    // forever -- the whole point of T-199 is that marking must clear it.
    const fnSrc = src.slice(src.indexOf('async function saveEssayMarks'), src.indexOf('function AttemptAnswers('))
    expect(fnSrc).toContain('status: result.status')
  })
})
