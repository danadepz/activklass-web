import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { ink, navy, muted } from '@/theme'

/* ------------------------------------------------------------------ *
 * Privacy Notice and Terms and Conditions — the text, and the two inline
 * consent checkboxes used at the end of the registration form. Each link opens
 * the full text in a popup whose "I Agree" button ticks the matching box.
 *
 * Front-end only: the agreement lives in the form's state for that one
 * sitting and is NOT recorded anywhere (no Firestore write, no API call).
 * Recording it would need a backend field and a rules change.
 *
 * The text below is the team's own, supplied as a document. Anything still in
 * [square brackets] is a value the team has not confirmed yet.
 * ------------------------------------------------------------------ */

// A string is a paragraph, an array is a bulleted list.
export const PRIVACY_NOTICE = {
  title: 'Privacy Notice',
  version: 'Version 1.0',
  sections: [
    { h: 'Who We Are', blocks: [
      'ActivKlass is a class management system developed as a capstone project of the University of Cebu – Banilad Campus. It is currently in a pilot phase. It is not owned, endorsed, or operated by DepEd or CHED.',
      'For this notice, ActivKlass is the entity that decides how your personal data is used. The school or teacher who creates your account also has responsibilities for the data they enter (see Consent and Minors).',
      'Data Protection Officer / Contact: activklassteam.2026@gmail.com',
    ] },
    { h: 'What We Collect', blocks: [
      [
        'Account details: name, login ID or email address, and the school or institution you belong to.',
        'Student registry details: student number, LRN, grade or year level, section, course, birthdate, and personal email.',
        'Class records: grades, attendance, quiz and assignment scores, syllabus content, and announcements.',
        'Guardian records: the link between a guardian account and a student, and whether guardian consent has been recorded.',
        'AI feature content: the topic, grade or year level, and learning material a teacher enters to generate a quiz or syllabus. For the risk prediction feature, this includes academic performance data. See AI Features and Automated Processing.',
        'Technical data: session information needed to keep you signed in.',
      ],
      'Birthdate and education records are sensitive personal information under RA 10173. We handle them with extra care and collect them only because the system cannot work without them.',
    ] },
    { h: 'Why We Collect It', blocks: [
      'We use your data only to run the system: to create and secure your account, compute grades, track attendance, generate and grade quizzes, show progress to students and guardians, identify students who may need extra support, and produce reports for your school. We do not use your data for advertising.',
    ] },
    { h: 'AI Features and Automated Processing', blocks: [
      [
        'Content generation: quiz and syllabus requests are sent to Google Gemini, an outside AI service. We send only what is needed for the request.',
        'Risk prediction: a model uses academic and engagement data to flag students who may need support. It lists the factors behind each flag. The result is a recommendation for the teacher, not a decision about the student. Teachers make the final judgment.',
      ],
      'Your data may be processed on servers outside the Philippines by these providers.',
    ] },
    { h: 'Who Receives Your Data', blocks: [
      [
        'Within your school: only the people your role allows. A teacher sees their own classes, a student sees their own records, and a guardian sees the records of linked children.',
        'Service providers: Firebase and Google Cloud, for hosting, sign-in and storage, and for AI features.',
        'Legal requirements: we may disclose data if the law requires it.',
      ],
      'We do not sell your personal data.',
    ] },
    { h: 'Consent and Minors', blocks: [
      'By creating or using an account, you consent to the processing described in this notice.',
      'Many users are minors. The school or teacher who creates a student account must have the parent or guardian consent that their own enrollment process requires. ActivKlass records the guardian’s consent when a guardian links to a student in the app.',
      'Guardians register themselves in the mobile app and connect to their child with an invitation code.',
    ] },
    { h: 'How Long We Keep Data', blocks: [
      'We keep your data until your school or you ask for deletion, whichever comes first. After that, it is deleted or made anonymous.',
    ] },
    { h: 'How We Protect Your Data', blocks: [
      'We use sign-in, role-based access rules, encrypted connections, and password-protected accounts. Temporary passwords must be changed at first sign-in. No system is perfectly secure. If a breach affects your data and may put you at risk, we will notify you and the National Privacy Commission within the time the law requires.',
    ] },
    { h: 'Your Rights', blocks: [
      'Under RA 10173 you may:',
      [
        'be informed about how your data is used',
        'access your data',
        'correct inaccurate data',
        'object to processing or withdraw your consent',
        'request erasure or blocking of your data',
        'receive a copy of your data in a common format',
        'claim compensation for damages caused by unlawful processing',
        'file a complaint with the National Privacy Commission (privacy.gov.ph)',
      ],
      'A self-service account deletion feature does not exist yet. Until it does, we handle requests manually. Contact the Data Protection Officer named under Who We Are.',
    ] },
  ],
}

export const TERMS = {
  title: 'Terms and Conditions',
  version: 'Version 1.0',
  sections: [
    { h: 'Acceptance', blocks: [
      'By creating or using an ActivKlass account, you agree to these Terms. If you do not agree, do not use the system. If you are under 18, a parent, guardian or your school must agree on your behalf.',
    ] },
    { h: 'About ActivKlass', blocks: [
      'ActivKlass is an AI-powered class management system for web and mobile, with tools for grading, attendance, quizzes, syllabi, learning recommendations and progress tracking. It is a pilot project of the University of Cebu – Banilad Campus. Features may change, break or be removed, and the service is provided “as is,” without guarantees of uninterrupted use.',
    ] },
    { h: 'Accounts', blocks: [
      [
        'Roles: School Admin, Teacher, Student and Parent. Your role decides what you can see and do.',
        'Creation: school accounts are created by an administrator or by bulk upload. Parent accounts are self-registered using an invitation code. Individual teachers may subscribe without an institution.',
        'First sign-in: if you receive a temporary password, you must change it. Passwords must have at least 8 characters, with uppercase, lowercase, a number and a special character.',
        'Accuracy: information you provide must be true and current.',
      ],
    ] },
    { h: 'Your Responsibilities', blocks: [
      [
        'Keep your password private. You are responsible for activity under your account.',
        'Tell us right away if you think your account was used without permission.',
        'Do not share your account or access another person’s account.',
      ],
    ] },
    { h: 'Acceptable Use', blocks: [
      'You agree not to:',
      [
        'try to access data or features outside your role',
        'upload malicious code or attempt to disrupt or probe the system',
        'enter false, offensive or unlawful content',
        'copy or resell the system without permission',
        'use AI features to produce harmful, discriminatory or plagiarized material',
        'cheat or share quiz answers in ways your teacher prohibits',
      ],
    ] },
    { h: 'Teachers and Schools', blocks: [
      [
        'You are responsible for the accuracy of the grades, attendance and records you enter.',
        'You must have the authority and consent your institution requires before adding students.',
        'AI-generated quizzes, syllabi and recommendations are drafts. You must review them before use.',
        'Risk predictions are decision aids and must not be the only basis for any action against a student.',
      ],
    ] },
    { h: 'Students and Parents', blocks: [
      [
        'Students should use quizzes and learning tools honestly.',
        'Parents may only link to their own child and may only use the information to support that child’s learning.',
      ],
    ] },
    { h: 'AI Features', blocks: [
      'AI output can be incorrect, incomplete or biased. ActivKlass does not guarantee that AI-generated content or predictions are accurate or fit for a particular purpose. Users remain responsible for how they use it.',
    ] },
    { h: 'Content and Ownership', blocks: [
      [
        'You keep ownership of the content you create, such as syllabi, quizzes and class records.',
        'You give ActivKlass permission to store and process it so the system can work.',
        'The ActivKlass software, design and name belong to its developers and the University of Cebu – Banilad Campus.',
        'Personal data is handled under the Privacy Notice.',
      ],
    ] },
    { h: 'Subscriptions', blocks: [
      'During the pilot, access is free or provided under the arrangement agreed with your institution. If paid plans are introduced later, the price and conditions will be shown before you subscribe.',
    ] },
    { h: 'Suspension and Ending Access', blocks: [
      'We may suspend or remove an account that violates these Terms or puts the system or other users at risk. You or your institution may stop using ActivKlass at any time. Data deletion requests follow the Privacy Notice.',
    ] },
    { h: 'Limit of Liability', blocks: [
      'To the extent allowed by Philippine law, the developers and the University are not liable for losses caused by system downtime, data errors, AI output, or use of the pilot system, except where the law does not allow this limit.',
    ] },
    { h: 'Governing Law', blocks: [
      'These Terms are governed by the laws of the Republic of the Philippines.',
    ] },
    { h: 'Changes to These Terms', blocks: [
      'We may update these Terms as the system develops. We will change the version and date, and ask you to accept the new version if the change is significant.',
    ] },
    { h: 'Contact', blocks: ['For questions about these Terms, contact us at activklassteam.2026@gmail.com.'] },
  ],
}

function DocumentBody({ doc }) {
  return (
    <div className="flex flex-col" style={{ gap: 18 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: muted }}>{doc.version}</p>
      {doc.sections.map((s, i) => (
        <section key={s.h}>
          <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: ink }}>
            {i + 1}. {s.h}
          </h4>
          <div className="flex flex-col" style={{ gap: 8 }}>
            {s.blocks.map((b, j) =>
              Array.isArray(b) ? (
                <ul key={j} style={{ margin: 0, paddingLeft: 20, listStyle: 'disc' }}>
                  {b.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p key={j} style={{ margin: 0 }}>{b}</p>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function DocLink({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded transition hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6FB0]"
      style={{
        background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
        font: 'inherit', fontWeight: 700, textDecoration: 'underline', color: navy,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Two inline checkboxes for a form, in the order Privacy Notice, then Terms.
 * Each link opens the full text in a popup whose "I Agree" button ticks the
 * matching box. The parent owns `agreed` ({ privacy, terms }) so it can keep
 * its submit button disabled until both are true.
 */
export default function LegalConsentChecks({ agreed, onChange }) {
  const [reading, setReading] = useState(null) // 'privacy' | 'terms' | null
  const privacyId = useId()
  const termsId = useId()
  const box = { width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: navy, cursor: 'pointer' }
  const text = { fontSize: 13, lineHeight: 1.5, color: muted }

  const doc = reading === 'privacy' ? PRIVACY_NOTICE : reading === 'terms' ? TERMS : null

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          aria-labelledby={privacyId}
          checked={agreed.privacy}
          onChange={(e) => onChange('privacy', e.target.checked)}
          style={box}
        />
        <span id={privacyId} style={text}>
          I have read the <DocLink onClick={() => setReading('privacy')}>Privacy Notice</DocLink> and
          consent to ActivKlass collecting and using my personal information as described.
        </span>
      </div>
      <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          aria-labelledby={termsId}
          checked={agreed.terms}
          onChange={(e) => onChange('terms', e.target.checked)}
          style={box}
        />
        <span id={termsId} style={text}>
          I have read and agree to the <DocLink onClick={() => setReading('terms')}>Terms and Conditions</DocLink>.
        </span>
      </div>

      {doc && (
        // Portalled to <body>: the auth card sits inside a transformed
        // ancestor, which would otherwise pin `position: fixed` to the card.
        // Static markup (tests, no document) never reaches here: reading is
        // only set by a click.
        createPortal(
          <Modal
            open
            onClose={() => setReading(null)}
            title={doc.title}
            size="lg"
            footer={(
              <>
                <Button variant="quiet" onClick={() => setReading(null)}>Back</Button>
                <Button onClick={() => { onChange(reading, true); setReading(null) }}>I Agree</Button>
              </>
            )}
          >
            <DocumentBody doc={doc} />
          </Modal>,
          document.body,
        )
      )}
    </div>
  )
}
