import { missingFirebaseKeys } from '../lib/firebase'

/** Shown instead of the app when web/.env.local has no Firebase config. */
export default function SetupRequired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-xl">
        <h1 className="text-2xl font-bold text-indigo-700">Activklass</h1>
        <h2 className="text-lg font-semibold text-slate-800 mt-4">
          Firebase isn't configured yet
        </h2>
        <p className="text-slate-600 mt-2 text-sm">
          The web app needs your Firebase project's keys before sign-in can work.
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-600 mt-4 space-y-2">
          <li>
            In the <span className="font-medium">Firebase Console</span>, open{' '}
            <span className="font-medium">Project settings → General → Your apps</span> and copy
            the web app config values.
          </li>
          <li>
            Copy <code className="bg-slate-100 px-1 rounded">web/.env.example</code> to{' '}
            <code className="bg-slate-100 px-1 rounded">web/.env.local</code> and paste the values in.
          </li>
          <li>Restart the dev server (<code className="bg-slate-100 px-1 rounded">npm run dev</code>).</li>
        </ol>
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs font-medium text-slate-500">Missing values:</p>
          <ul className="mt-1 text-xs font-mono text-red-600 space-y-0.5">
            {missingFirebaseKeys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Full walkthrough: <span className="font-mono">docs/04-setup.md</span>
        </p>
      </div>
    </div>
  )
}
