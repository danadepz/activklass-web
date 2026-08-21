/**
 * The student's parental-access state: their share code and their guardians.
 *
 * Owned by the logic lane (see OWNERSHIP.md). Plain Firestore reads and writes
 * through `@/lib/guardianCodes`, which is the web half of the module the mobile
 * app uses -- both hit the same `guardian_codes` and `guardian_links`
 * collections, so a student sees the SAME code whichever device they open.
 *
 * The page this feeds used to render `const linkCode = 'K7M2Q9'`, a literal
 * that was identical for every student and connected to nothing.
 *
 * No endpoint is involved: firestore.rules lets a student read and write their
 * own code, and read and manage the links that point at them. Those rules, not
 * this hook, are what actually stop a guardian granting themselves anything.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveGuardianLink,
  canManageOwnLinks,
  ensureMyGuardianCode,
  getDefaultScopes,
  setDefaultScopes,
  listMyGuardians,
  permissionsToScopes,
  revokeGuardianLink,
  rotateMyGuardianCode,
  scopesToPermissions,
  setGuardianLinkScopes,
} from '@/lib/guardianCodes'

export const guardianAccessKey = (uid) => ['fs-guardian-access', uid ?? null]

/**
 * Guardians, shaped for ParentalAccessPanel.
 *
 * `permissions` rides on each guardian rather than sitting once at the top of
 * the panel: scopes live on the LINK, so one guardian can see grades while
 * another sees only attendance. A single shared set would have to write the
 * same values to every link and could not represent what the model stores.
 */
function toPanelGuardian(link) {
  return {
    id: link.link_id,
    name: link.guardian_name || link.guardian_email || 'Guardian',
    email: link.guardian_email ?? '',
    relation: link.relationship_type || 'Guardian',
    status: link.status,
    permissions: scopesToPermissions(link.scopes),
    /* Toggling a pending link would be theatre -- the rules write its scopes
       all-false and a pending guardian reads nothing regardless. */
    permissionsEditable: link.status === 'approved',
  }
}

export async function fetchGuardianAccess(uid) {
  // The code has to resolve first -- defaults are stored on that document.
  const code = await ensureMyGuardianCode(uid)
  const [links, defaults] = await Promise.all([listMyGuardians(uid), getDefaultScopes(code)])
  return { code, guardians: links.map(toPanelGuardian), defaults }
}

/**
 * @param uid       the signed-in student's Firebase uid
 * @param birthdate their profile birthdate, which decides the age gate
 */
export function useGuardianAccess(uid, birthdate) {
  const queryClient = useQueryClient()
  const key = guardianAccessKey(uid)

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchGuardianAccess(uid),
    enabled: Boolean(uid),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  const rotate = useMutation({
    mutationFn: () => rotateMyGuardianCode(uid),
    onSuccess: invalidate,
  })

  /* Approving grants the student's defaults rather than everything, so the
     toggles they set before any guardian existed are what actually lands. */
  const approve = useMutation({
    mutationFn: (guardian) =>
      approveGuardianLink(guardian.id, permissionsToScopes(scopesToPermissions(query.data?.defaults))),
    onSuccess: invalidate,
  })

  const setDefault = useMutation({
    mutationFn: ({ key: permission, next }) =>
      setDefaultScopes(
        query.data?.code,
        permissionsToScopes({ ...scopesToPermissions(query.data?.defaults), [permission]: next })
      ),
    onSuccess: invalidate,
  })

  const revoke = useMutation({
    mutationFn: (guardian) => revokeGuardianLink(guardian.id),
    onSuccess: invalidate,
  })

  const setPermission = useMutation({
    mutationFn: ({ guardian, key: permission, next }) =>
      setGuardianLinkScopes(
        guardian.id,
        permissionsToScopes({ ...guardian.permissions, [permission]: next })
      ),
    onSuccess: invalidate,
  })

  const busy =
    rotate.isPending ||
    approve.isPending ||
    revoke.isPending ||
    setPermission.isPending ||
    setDefault.isPending

  const failed = [rotate, approve, revoke, setPermission, setDefault].find((m) => m.isError)

  return {
    code: query.data?.code ?? null,
    guardians: query.data?.guardians ?? [],
    defaultPermissions: scopesToPermissions(query.data?.defaults),
    // Adults manage their own; minors cannot, and an unknown birthdate takes
    // the adult path so consent is required rather than assumed.
    canManage: canManageOwnLinks(birthdate),
    loading: query.isLoading,
    busy,
    error: query.isError
      ? "Couldn't load your parental access settings."
      : failed
        ? `Couldn't save that change. ${failed.error?.message ?? ''}`.trim()
        : null,
    rotateCode: () => rotate.mutate(),
    approveGuardian: (guardian) => approve.mutate(guardian),
    revokeGuardian: (guardian) => revoke.mutate(guardian),
    setGuardianPermission: (guardian, permission, next) =>
      setPermission.mutate({ guardian, key: permission, next }),
    setDefaultPermission: (permission, next) => setDefault.mutate({ key: permission, next }),
  }
}
