/**
 * Student Journey Safety & Regression Test Suite
 *
 * Locks down:
 * 1. Query gating: queries that depend on student ID refuse to execute before auth is ready.
 * 2. Enrolled classes load properly once the student profile is populated.
 * 3. Class detail resilience: optional sub-data failures (e.g. announcements, remediations)
 *    do not crash or blank out the entire class page.
 * 4. Dual quiz-class association: both `class_ids` (array) and legacy `class_id` (scalar)
 *    quizzes are retrieved and deduplicated by id.
 * 5. Quiz submission routes to the authoritative backend endpoint with correct method and body,
 *    and normalizeApiPath safeguards against missing /api prefixes.
 * 6. Quiz submission error reporting accurately explains errors to students.
 * 7. Authorization boundaries: access is refused for missing classes and unenrolled students.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({
  profile: null,
  status: 'loading',
}))

const queryState = vi.hoisted(() => ({
  dashboard: { data: null, isLoading: true, isError: false, error: null },
  classes: { data: null, isLoading: true, isError: false, error: null },
}))

const apiCalls = vi.hoisted(() => [])

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    profile: authState.profile,
    status: authState.status,
  }),
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useQuery: ({ queryKey }) => {
      if (queryKey[0] === 'student-dashboard') return queryState.dashboard
      if (queryKey[0] === 'student-classes') return queryState.classes
      return { data: null, isLoading: false, isError: false, error: null }
    },
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    api: vi.fn(async (path, opts) => {
      apiCalls.push({ path, opts })
      return { total_score: 10, status: 'graded' }
    }),
  }
})

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 's1' } } }))

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    doc: vi.fn((_db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] })),
    collection: vi.fn((_db, path) => ({ path })),
    query: vi.fn((coll, ...filters) => ({ coll, filters, path: coll?.path })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    serverTimestamp: () => 'SERVER_TS',
  }
})

vi.mock('@/lib/studentData', () => ({
  loadStudentEntry: vi.fn(async () => ({ final_grade: 92, mode: 'percentage' })),
  loadStudentAttendance: vi.fn(async () => ({ rate: 95 })),
  loadSyllabus: vi.fn(async () => ({ modules: [{ id: 'm1' }] })),
  loadStudentContests: vi.fn(async () => ({})),
  loadStudentGradeContests: vi.fn(async () => ({})),
}))

vi.mock('@/lib/roster', () => ({
  fetchUsersByIds: vi.fn(async (ids) => ids.map((id) => ({ id, first_name: 'Maria', last_name: 'Santos' }))),
  isDroppedFromClass: vi.fn(() => false),
  ageFromBirthdate: vi.fn(() => 16),
}))

// Dynamic imports after hoisting
const { loadDashboard, default: StudentDashboard } = await import('./index.jsx')
const { loadClasses, default: StudentClassesIndex } = await import('./classes/index.jsx')
const { loadClassDetail } = await import('./classes/$classId/index.jsx')
const { finishAttempt } = await import('@/hooks/useAttemptSession')
const { normalizeApiPath, ApiError } = await import('@/lib/api')
const { explainSubmitFailure } = await import('./quiz-player.jsx')
const { getDoc, getDocs } = await import('firebase/firestore')

beforeEach(() => {
  apiCalls.length = 0
  authState.profile = null
  authState.status = 'loading'
  queryState.dashboard = { data: null, isLoading: true, isError: false, error: null }
  queryState.classes = { data: null, isLoading: true, isError: false, error: null }
  vi.clearAllMocks()
})

describe('1. Student query gating & authentication readiness', () => {
  it('loadDashboard refuses execution without an authenticated student profile', async () => {
    await expect(loadDashboard(null)).rejects.toThrow('not_authenticated')
    await expect(loadDashboard({})).rejects.toThrow('not_authenticated')
  })

  it('loadClasses refuses execution without an authenticated student profile', async () => {
    await expect(loadClasses(null)).rejects.toThrow('not_authenticated')
    await expect(loadClasses({})).rejects.toThrow('not_authenticated')
  })

  it('StudentDashboard renders loading state without throwing when profile is loading', () => {
    authState.status = 'loading'
    authState.profile = null
    queryState.dashboard = { data: null, isLoading: true, isError: false, error: null }

    const html = renderToStaticMarkup(
      <MemoryRouter><StudentDashboard /></MemoryRouter>,
    )
    expect(html).toContain('Loading student dashboard')
  })

  it('StudentClassesIndex renders skeleton without throwing when profile is loading', () => {
    authState.status = 'loading'
    authState.profile = null
    queryState.classes = { data: null, isLoading: true, isError: false, error: null }

    const html = renderToStaticMarkup(
      <MemoryRouter><StudentClassesIndex /></MemoryRouter>,
    )
    expect(html).toContain('Loading your classes')
  })

  it('StudentClassesIndex displays a helpful error state on query failure rather than empty classes', () => {
    authState.status = 'signed_in'
    authState.profile = { id: 's1', first_name: 'Juan' }
    queryState.classes = {
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Permission denied by Firestore rules'),
    }

    const html = renderToStaticMarkup(
      <MemoryRouter><StudentClassesIndex /></MemoryRouter>,
    )
    expect(html).toContain('Could not load your classes')
    expect(html).toContain('Permission denied by Firestore rules')
    expect(html).toContain('Retry')
    expect(html).not.toContain('No classes yet')
  })
})

describe('2. Enrolled classes load after student profile becomes available', () => {
  it('loadClasses queries by student_ids and decorates each class with teacher and grade', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 'c1',
          data: () => ({ subject_code: 'BIO101', section: 'St. Peter', teacher_id: 't1', student_ids: ['s1'] }),
        },
      ],
    })

    const result = await loadClasses({ id: 's1' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
    expect(result[0].teacher_name).toBe('Maria Santos')
    expect(result[0].current_grade).toBe(92)
  })
})

describe('3. Student class detail resilience with optional sub-queries', () => {
  it('successfully loads class detail even when announcements query rejects', async () => {
    // getDoc for classes/c1
    vi.mocked(getDoc).mockImplementation(async (ref) => {
      if (ref?.path?.includes('classes/c1') || ref?.id === 'c1') {
        return { exists: () => true, id: 'c1', data: () => ({ student_ids: ['s1'], teacher_id: 't1' }) }
      }
      return { exists: () => false, data: () => null }
    })

    // getDocs mock
    vi.mocked(getDocs).mockImplementation(async (q) => {
      const path = q?.path || q?.coll?.path || ''
      // Simulate announcements failing with 403 permission-denied
      if (path === 'announcements') {
        throw new Error('Missing or insufficient permissions')
      }
      return { docs: [] }
    })

    const detail = await loadClassDetail('c1', { id: 's1' })
    expect(detail).toBeDefined()
    expect(detail.clazz.id).toBe('c1')
    expect(detail.announcements).toEqual([])
    expect(detail.queryErrors.announcements).toBeDefined()
    expect(detail.queryErrors.announcements.message).toContain('Missing or insufficient permissions')
  })
})

describe('4. Legacy and current quiz-class associations', () => {
  it('combines quizzes with class_ids array and legacy class_id scalar without duplicating', async () => {
    vi.mocked(getDoc).mockImplementation(async () => ({
      exists: () => true,
      id: 'c1',
      data: () => ({ student_ids: ['s1'], teacher_id: 't1' }),
    }))

    vi.mocked(getDocs).mockImplementation(async (q) => {
      const filters = q?.filters || []
      const hasClassIds = filters.some((f) => f.field === 'class_ids')
      const hasClassId = filters.some((f) => f.field === 'class_id')

      if (hasClassIds) {
        return {
          docs: [
            { id: 'quiz-1', data: () => ({ status: 'published', title: 'Array Quiz', class_ids: ['c1'] }) },
          ],
        }
      }
      if (hasClassId) {
        return {
          docs: [
            { id: 'quiz-1', data: () => ({ status: 'published', title: 'Array Quiz', class_id: 'c1' }) },
            { id: 'quiz-2', data: () => ({ status: 'published', title: 'Legacy Quiz', class_id: 'c1' }) },
          ],
        }
      }
      return { docs: [] }
    })

    const detail = await loadClassDetail('c1', { id: 's1' })
    const quizIds = detail.quizzes.map((q) => q.id)
    expect(quizIds).toContain('quiz-1')
    expect(quizIds).toContain('quiz-2')
    // Deduplicated by id: quiz-1 appears only once
    expect(quizIds.filter((id) => id === 'quiz-1')).toHaveLength(1)
  })
})

describe('5. Quiz submission endpoint & path safety', () => {
  it('finishAttempt POSTs to /api/quiz_attempts/${attemptId}/submit with answers and expired', async () => {
    const payload = { answers: { q1: 'opt-a' }, expired: false }
    const res = await finishAttempt('att-999', payload)

    expect(apiCalls).toHaveLength(1)
    expect(apiCalls[0].path).toBe('/api/quiz_attempts/att-999/submit')
    expect(apiCalls[0].opts.method).toBe('POST')
    expect(apiCalls[0].opts.body).toEqual(payload)
    expect(res).toEqual({ total_score: 10, status: 'graded' })
  })

  it('normalizeApiPath normalizes relative submit endpoints missing /api', () => {
    expect(normalizeApiPath('/quiz_attempts/att-123/submit')).toBe('/api/quiz_attempts/att-123/submit')
    expect(normalizeApiPath('quiz_attempts/att-123/submit')).toBe('/api/quiz_attempts/att-123/submit')
    expect(normalizeApiPath('/api/quiz_attempts/att-123/submit')).toBe('/api/quiz_attempts/att-123/submit')
  })
})

describe('6. Submission error explanation', () => {
  it('reports teacher discarded status accurately', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'discarded' }),
    })

    const msg = await explainSubmitFailure('att-1', new Error('Update failed'))
    expect(msg).toMatch(/teacher ended this attempt/i)
  })

  it('reports already submitted status accurately', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ status: 'graded' }),
    })

    const msg = await explainSubmitFailure('att-1', new Error('Update failed'))
    expect(msg).toMatch(/already been submitted/i)
  })

  it('surfaces ApiError messages directly when the server cannot be reached', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('Network error'))

    const serverError = new ApiError(0, 'unreachable', 'Cannot reach the ActivKlass server. It may not be running — ask whoever set up your environment to start the API, then try again.')
    const msg = await explainSubmitFailure('att-1', serverError)
    expect(msg).toBe(serverError.message)
  })
})

describe('7. Enrollment and authorization guards', () => {
  it('throws Class not found when class does not exist in Firestore', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
      data: () => null,
    })

    await expect(loadClassDetail('nonexistent', { id: 's1' })).rejects.toThrow('Class not found')
  })

  it('throws not_enrolled when student is not present in class student_ids', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'c2',
      data: () => ({ student_ids: ['other-student'] }),
    })

    await expect(loadClassDetail('c2', { id: 's1' })).rejects.toThrow('not_enrolled')
  })
})
