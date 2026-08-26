# Vision — ActivKlass web

## Why this exists

A Philippine teacher's class record is a spreadsheet, and the grade that comes out of it
has to satisfy a DepEd or CHED computation that the spreadsheet does not know about. The
work is real and repetitive: transmuting grades per period, tracking attendance, noticing
which students are slipping while there is still time to do something about it, and
writing the quizzes and syllabi that fill the term.

ActivKlass is a class record system that does that computation correctly and puts an AI
layer beside it — drafting quizzes, syllabi and module outlines, and flagging students who
look like they are heading for a failing mark.

**This repo is the web portal**: where teachers do all of it, where school admins manage
accounts, and where students see their own grades, take quizzes and get remediation.

## Who is on the other side of the screen

- **The teacher** — the primary user, and the one every design decision answers to. They
  are not a technologist. An error message that says "Failed to fetch" is, to them, a
  broken feature; that has been demonstrated, not assumed.
- **The student** — reads their own grades, takes quizzes, works through remediation.
  Sees a derived, teacher-published view, never the gradebook itself.
- **The school admin** — provisions accounts, manages classes and the subscription.
- **The guardian** — mobile only, by design.

## The non-negotiable shape

**AI drafts, the teacher decides.** Every AI feature has a manual path beside it and a
review step in front of it. Nothing the model produces lands in a gradebook, a syllabus or
a published quiz without a teacher approving it. This is not a hedge against model
quality — it is what makes the system defensible to a school, and it is the first thing to
protect when a feature is being simplified.

Two consequences that keep coming back:
- A grade is authored by a teacher and *derived* for a student. The derivation must be
  kept in sync explicitly, or the student reads a stale number and nothing errors.
- Anything labelled "at risk" must say which rule produced it. Three different rules once
  shared that label on one screen.

## What success looks like

**Right now, success is the capstone defense demo**: the whole product driven end to end,
in a browser, without a recovery. Not scale, not uptime, not a deployment — a system that
visibly does what it claims, with the grade computation credible enough to hold up to
someone who knows how DepEd transmutation works.

The honest test has turned out to be a person clicking through it. Every walkthrough has
found things the test suite could not, and the fixes that came out of them — one home for
validation, one recognisable message when the server is down, type-to-confirm on
irreversible deletes — are worth more to the demo than any feature added since.

## What this is not trying to be

- Not a deployed product. There is no host and no users outside the pilot.
- Not a learning management system. It records and computes; it does not deliver courses.
- Not multi-tenant at scale. Subscriptions and institutions exist as a shape, at pilot size.
- Not a replacement for the teacher's judgement, at any point in the pipeline.
