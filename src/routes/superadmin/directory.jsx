import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchSchoolDirectoryAdmin,
  retireDirectoryEntryAdmin,
} from '@/lib/superadmin'
import { toast } from '@/components/ui/toast'
import { SkeletonTable } from '@/components/ui/Skeleton'
import RetireDirectoryDialog from './RetireDirectoryDialog'

const STATUS_STYLE = {
  active: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
  retired: 'bg-zinc-700/30 text-zinc-400 border-zinc-700',
  retiring: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
}

function StatusPill({ status }) {
  const s = status || 'active'
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        STATUS_STYLE[s] ?? STATUS_STYLE.active
      }`}
    >
      {s}
    </span>
  )
}

function ReviewStatusBadge({ reviewStatus, reason }) {
  if (reviewStatus === 'already_retired') {
    return <span className="text-[11px] text-zinc-500 font-medium">Retired</span>
  }
  if (reviewStatus === 'retiring') {
    return <span className="text-[11px] text-amber-400 font-medium">Retiring</span>
  }
  if (reviewStatus === 'linked_institution') {
    return (
      <span className="text-[11px] text-zinc-400" title={reason}>
        🔒 Active Institution
      </span>
    )
  }
  if (reviewStatus === 'in_use') {
    return (
      <span className="text-[11px] text-zinc-400" title={reason}>
        👥 In Use by Teachers
      </span>
    )
  }
  if (reviewStatus === 'eligible') {
    return (
      <span className="text-[11px] text-emerald-400 font-medium" title={reason}>
        ✓ Eligible to Retire
      </span>
    )
  }
  return (
    <span className="text-[11px] text-amber-300/90 font-medium" title={reason}>
      ⚠️ Needs Review
    </span>
  )
}

export default function SuperAdminDirectoryPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [actionError, setActionError] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['superadmin-directory'],
    queryFn: fetchSchoolDirectoryAdmin,
    staleTime: 30 * 1000,
  })

  const directory = data?.directory || []

  // Retirement Mutation
  const retireMutation = useMutation({
    mutationFn: ({ id, reason, confirmed }) =>
      retireDirectoryEntryAdmin(id, { reason, confirmed }),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['superadmin-directory'] })
      queryClient.invalidateQueries({ queryKey: ['school-directory'] })
      toast.success(res?.message || `Retired ${vars.id.toUpperCase()} from registration directory.`)
      setSelectedEntry(null)
      setActionError(null)
    },
    onError: (err) => {
      setActionError(err.message || 'Failed to retire directory entry.')
    },
  })

  // Summary Metrics
  const stats = useMemo(() => {
    let active = 0
    let retired = 0
    let linked = 0
    let totalAffiliations = 0

    directory.forEach((item) => {
      if (item.status === 'retired') retired++
      else active++

      if (item.linked_school) linked++
      totalAffiliations += item.affiliations_count || 0
    })

    return {
      total: directory.length,
      active,
      retired,
      linked,
      totalAffiliations,
    }
  }, [directory])

  // Filtered entries
  const filtered = useMemo(() => {
    return directory.filter((item) => {
      // Search match
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const nameMatch = (item.name || '').toLowerCase().includes(q)
        const abbrMatch = (item.abbreviation || '').toLowerCase().includes(q)
        const idMatch = (item.id || '').toLowerCase().includes(q)
        if (!nameMatch && !abbrMatch && !idMatch) return false
      }

      // Filter category
      if (filter === 'active') return item.status === 'active'
      if (filter === 'retired') return item.status === 'retired'
      if (filter === 'linked') return Boolean(item.linked_school)
      if (filter === 'independent') return !item.linked_school && item.status === 'active'
      if (filter === 'eligible') return item.eligible_for_retirement
      if (filter === 'needs_review') return item.review_status === 'needs_review'
      return true
    })
  }, [directory, search, filter])

  const handleOpenRetire = (entry) => {
    setActionError(null)
    setSelectedEntry(entry)
  }

  const handleConfirmRetire = (entry, { reason, confirmed }) => {
    retireMutation.mutate({ id: entry.id, reason, confirmed })
  }

  return (
    <div className="space-y-6">
      {/* Policy Explanation Banner (Option B) */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Registration School Directory
            </h1>
            <p className="mt-1 text-xs text-zinc-400 max-w-3xl leading-relaxed">
              Under <strong>Option B</strong>, individual teachers may self-register under legitimate schools even when those schools do not hold an institutional subscription.
              This directory controls the public <code className="text-amber-300 font-mono">school_directory</code> list offered in registration.
            </p>
          </div>
          <span className="rounded bg-amber-400/10 px-2.5 py-1 text-xs font-mono font-semibold text-amber-300 border border-amber-400/20">
            Option B Policy Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-1">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Registered Institutions (Subscribers Tab)
            </span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Paid customer accounts with school-wide subscriptions, provisioned admins, and synchronized student/teacher rosters.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-1">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              School Directory (Registration)
            </span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Self-declared affiliation options for registration. Retiring an entry hides it from new signups while strictly preserving historical academic records.
            </p>
          </div>
        </div>
      </div>

      {/* Analytics / Stats Band */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Total Entries</div>
          <div className="mt-1 text-2xl font-bold font-mono text-zinc-100">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-semibold text-emerald-400/80 uppercase tracking-wider">Active in Signups</div>
          <div className="mt-1 text-2xl font-bold font-mono text-emerald-400">{stats.active}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Retired Entries</div>
          <div className="mt-1 text-2xl font-bold font-mono text-zinc-400">{stats.retired}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-semibold text-sky-400/80 uppercase tracking-wider">Linked Schools</div>
          <div className="mt-1 text-2xl font-bold font-mono text-sky-400">{stats.linked}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-wider">Teacher Affiliations</div>
          <div className="mt-1 text-2xl font-bold font-mono text-amber-300">{stats.totalAffiliations}</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by school name, abbreviation, or ID..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'retired', label: 'Retired' },
            { id: 'linked', label: 'Linked' },
            { id: 'independent', label: 'Independent' },
            { id: 'eligible', label: 'Eligible to Retire' },
            { id: 'needs_review', label: 'Needs Review' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilter(pill.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                filter === pill.id
                  ? 'bg-zinc-800 text-amber-300 border border-amber-400/30'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 border border-transparent'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Section */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-6">
            <SkeletonTable rows={8} />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-red-400">
            Failed to load school directory: {error.message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-500">
            No school directory entries match the current search and filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-900/80 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">School Name & Abbr</th>
                  <th className="py-3 px-4">Directory Status</th>
                  <th className="py-3 px-4">Registered Institution</th>
                  <th className="py-3 px-4">Affiliations</th>
                  <th className="py-3 px-4">Review Assessment</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {filtered.map((entry) => {
                  const isRetired = entry.status === 'retired'
                  const isRetiring = entry.status === 'retiring'
                  const hasLinkedSchool = Boolean(entry.linked_school)
                  const hasAffiliations = (entry.affiliations_count || 0) > 0
                  const isProtected = hasLinkedSchool || hasAffiliations || isRetired || isRetiring

                  return (
                    <tr key={entry.id} className="hover:bg-zinc-800/30 transition">
                      {/* Name & Abbreviation */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-100">{entry.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-300 font-bold border border-zinc-700/80">
                            {entry.abbreviation || entry.id.toUpperCase()}
                          </span>
                          <span className="text-zinc-600">({entry.id})</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <StatusPill status={entry.status} />
                      </td>

                      {/* Registered Institution */}
                      <td className="py-3.5 px-4">
                        {entry.linked_school ? (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-zinc-200">
                              {entry.linked_school.name}
                            </span>
                            <div className="font-mono text-[10px] text-sky-400">
                              ID: {entry.linked_school.id}
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-500 italic">Independent (No Institution)</span>
                        )}
                      </td>

                      {/* Affiliations */}
                      <td className="py-3.5 px-4 font-mono">
                        <span className={entry.affiliations_count > 0 ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}>
                          {entry.affiliations_count || 0} teacher(s)
                        </span>
                      </td>

                      {/* Review Assessment */}
                      <td className="py-3.5 px-4">
                        <ReviewStatusBadge
                          reviewStatus={entry.review_status}
                          reason={entry.reason}
                        />
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        {isRetired ? (
                          <span className="text-[11px] font-semibold text-zinc-600 select-none">
                            Retired
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenRetire(entry)}
                            disabled={hasLinkedSchool || hasAffiliations || isRetiring}
                            title={
                              hasLinkedSchool
                                ? 'Cannot retire: linked to active registered institution'
                                : hasAffiliations
                                ? 'Cannot retire: active teacher profiles exist'
                                : 'Retire this directory entry'
                            }
                            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                          >
                            Retire
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retirement Confirmation Dialog */}
      <RetireDirectoryDialog
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onConfirm={handleConfirmRetire}
        isPending={retireMutation.isPending}
        error={actionError}
      />
    </div>
  )
}
