# ActivKlass — Web

React web portal for **ActivKlass**, an AI-powered class record and scaffolded learning management system designed for Philippine K-12 and tertiary education.

🌐 **Live Deployment:** [https://activklass.vercel.app/](https://activklass.vercel.app/)  
⚙️ **Cloud Run API:** [https://activklass-backend-59267706068.asia-southeast1.run.app](https://activklass-backend-59267706068.asia-southeast1.run.app/api/health)

Built with **React 19**, **Vite**, **Tailwind CSS v4**, **TanStack Query**, and **React Router v7**. Connects directly to **Firebase** (Authentication, Cloud Firestore, Cloud Storage) for real-time operations, and communicates with the **Flask AI microservice** on Cloud Run for generative AI, predictive remediation analytics, and payment checkout.

---

## 🔗 Related Repositories

| Repository | Description |
|---|---|
| [activklass-backend](https://github.com/danadepz/activklass-backend) | Flask API, Google Gemini AI services, Random Forest risk model, Firebase rules/indexes, shared architecture docs |
| [activklass-web](https://github.com/danadepz/activklass-web) | **This repo** — React teacher, student, school admin, and superadmin web portal |
| [activklass-mobile](https://github.com/danadepz/activklass-mobile) | Expo React Native app for students and guardians |

---

## ✨ Features

- **🏫 Multi-Role Portal:** Dedicated interfaces for Teachers, Students, School Administrators, and Superadmins.
- **📊 DepEd & CHED Gradebooks:** Flexible calculation supporting DepEd K-12 transmutation, CHED percentage, and CHED point grades (1.00–5.00) with weight rebalancing and score auditing.
- **📅 Daily Attendance Tracking:** At-a-glance attendance marking with bulk updates and audit trails.
- **📚 Syllabus & Course Builder:** Module and topic manager with rich study materials, external links, and PDF attachments.
- **📝 Quiz Bank & Assessment Engine:** Interactive quiz builder supporting Multiple Choice, True/False, Short Answer, Matching, and Essays with automated objective scoring.
- **🤖 AI Integrations (Google Gemini & scikit-learn):**
  - AI Syllabus Draft Generator aligned with Philippine curriculum standards.
  - Bloom's Taxonomy-mapped AI Quiz Generator.
  - Predictive Early-Warning Remediation Risk Classifier.
  - Automated Essay Grading with rubrics.
- **💳 Subscription & PayMongo Gateway:** Support for Solo Teacher and School Institution subscriptions with PayMongo checkout (test mode for demonstrations).

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js 18+
- npm 9+
- Running backend instance (or pointing to Cloud Run)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/danadepz/activklass-web.git
cd activklass-web

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local and fill in your Firebase project credentials

# 4. Start the development server
npm run dev
```

The app will run locally at **http://localhost:5173**.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env.local`:

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain (e.g. `activklass1.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID (e.g. `activklass1`) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket (e.g. `activklass1.firebasestorage.app`) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Firebase Analytics measurement ID |
| `VITE_API_URL` | Flask API URL (leave blank in local dev to use Vite's `/api` proxy; set to Cloud Run URL in production) |

---

## 🧪 Testing & Scripts

| Command | Action |
|---|---|
| `npm run dev` | Starts the local Vite development server with HMR |
| `npm run build` | Compiles the production build to `dist/` |
| `npm run preview` | Previews the production build locally |
| `npm test` | Runs the Vitest test suite (**523 unit/integration tests across 27 suites**) |
| `npm run test:watch` | Runs Vitest in interactive watch mode |
| `npm run test:rules` | Runs `firestore.rules` validation against the local Firebase emulator |
| `npm run lint` | Runs ESLint |

---

## 📁 Project Structure

```
src/
├── routes/         # Page routes (teacher, student, admin, superadmin, auth)
├── components/     # Reusable UI controls, cards, dialogs, and navigation
├── context/        # Global state and authentication context (useAuth)
├── hooks/          # React Query hooks for Firestore subscriptions and caching
├── lib/            # Domain logic (grading calculations, validation, API client, Firebase init)
├── features/       # Scoped feature packages
└── theme.js        # Centralized theme tokens, colors, and typography
```

---

## ☁️ Deployment

- **Frontend:** Hosted on [Vercel](https://vercel.com) with automatic continuous deployment on push to `main`. SPA deep-links are managed via [`vercel.json`](vercel.json).
- **Backend:** Containerized via Docker and deployed to **Google Cloud Run** in `asia-southeast1`.
