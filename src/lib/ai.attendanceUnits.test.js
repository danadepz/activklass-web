/**
 * Attendance unit contract (2026-11-23): callers hand over a PERCENTAGE (0-100)
 * and the request body carries the model's FRACTION (0-1). The old converter
 * guessed that a value <= 1 was already a fraction, so 1% went out as 100%
 * attendance and 0.5% as 50%. Checked on the body that reaches /api/predict,
 * through both exported callers (student forecast and teacher batch).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({ api: vi.fn(async () => ({ status: 'insufficient_data', results: [] })), ApiError: class extends Error {} }))

const { api } = await import('./api')
const { predictRisk, predictRiskBatch } = await import('./ai')

const CASES = [
  [0, 0],
  [0.5, 0.005],
  [1, 0.01],
  [50, 0.5],
  [100, 1],
  [500 / 7, 5 / 7], // 4 present, 2 late, 1 absent, 1 excused -> 71.428571…%
]

beforeEach(() => vi.mocked(api).mockClear())

describe('attendance percentage -> model fraction', () => {
  it.each(CASES)('student path: %s%% is sent as %s', async (pct, fraction) => {
    await predictRisk({ attendanceRate: pct })
    const body = vi.mocked(api).mock.calls[0][1].body
    expect(body.indicators.attendance_rate).toBeCloseTo(fraction, 12)
  })

  it.each(CASES)('teacher batch path: %s%% is sent as %s', async (pct, fraction) => {
    await predictRiskBatch([{ studentId: 's1', indicators: { attendanceRate: pct } }])
    const body = vi.mocked(api).mock.calls[0][1].body
    expect(body.students[0].indicators.attendance_rate).toBeCloseTo(fraction, 12)
  })

  it('missing stays missing, and out-of-range is refused rather than guessed', async () => {
    await predictRisk({ attendanceRate: null })
    expect(vi.mocked(api).mock.calls[0][1].body.indicators).not.toHaveProperty('attendance_rate')
    await expect(predictRisk({ attendanceRate: 101 })).rejects.toThrow()
    await expect(predictRisk({ attendanceRate: -1 })).rejects.toThrow()
  })
})
