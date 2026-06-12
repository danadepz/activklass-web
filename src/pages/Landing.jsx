import { Link } from 'react-router-dom'
import hero from '../assets/hero.png'

const VALUE_CARDS = [
  {
    title: 'Automated Grade Computation',
    body: 'Spreadsheet-style class records with real-time weighted totals, DepEd Order No. 8 s. 2015 transmutation, and a CHED tertiary mode.',
    icon: '🧮',
  },
  {
    title: 'AI-Driven Remediation',
    body: 'Risk prediction and least-mastered skill mapping recommend targeted remediation quizzes — always reviewed by the teacher before assignment.',
    icon: '🤖',
  },
  {
    title: 'RA 10173 Compliant',
    body: 'Parental consent records gate access to student grades, in line with the Philippine Data Privacy Act of 2012.',
    icon: '🔒',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero */}
      <header className="bg-gradient-to-b from-indigo-50 to-white">
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
          <span className="text-xl font-bold text-indigo-700">ActivKlass</span>
          <Link
            to="/login"
            className="rounded-lg border border-indigo-600 text-indigo-600 font-medium px-4 py-2 hover:bg-indigo-50"
          >
            Sign in
          </Link>
        </nav>
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
              The AI-powered Class Record System for Philippine schools
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Automated grade computation, predictive remediation, and data-privacy-first
              design — built for DepEd and CHED classrooms.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-block rounded-lg bg-indigo-600 text-white font-semibold px-8 py-3 text-lg hover:bg-indigo-700"
            >
              Go to Portal
            </Link>
          </div>
          <img
            src={hero}
            alt="ActivKlass dashboard preview"
            className="rounded-xl shadow-lg border border-slate-200 w-full"
          />
        </div>
      </header>

      {/* Core value cards */}
      <section className="max-w-6xl mx-auto px-6 py-16 w-full">
        <h2 className="text-2xl font-bold text-slate-900 text-center">
          Why schools choose ActivKlass
        </h2>
        <div className="mt-10 grid md:grid-cols-3 gap-6">
          {VALUE_CARDS.map((card) => (
            <div
              key={card.title}
              className="rounded-xl border border-slate-200 bg-white shadow-sm p-6"
            >
              <div className="text-3xl">{card.icon}</div>
              <h3 className="mt-3 text-lg font-semibold text-slate-800">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <div>
            <p className="font-semibold text-slate-700">ActivKlass</p>
            <p>Pilot deployment — Cebu campus</p>
          </div>
          <p>© {new Date().getFullYear()} ActivKlass. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
