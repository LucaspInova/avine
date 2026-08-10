import { describe, expect, it } from 'vitest'
import { can, getCapabilities } from './capabilities'

const base = { ativo: true, acesso_habilitado: true }

describe('auth capabilities', () => {
  it('grants every capability to a consistent active Admin', () => {
    const profile = { ...base, perfil: 'Admin', auth_role: 'admin' }
    expect(can(profile, 'admin.runRestrictedOperations')).toBe(true)
    expect(can(profile, 'stores.create')).toBe(true)
  })

  it('grants scoped capabilities to Gerencial with multiple UFs', () => {
    const profile = { ...base, perfil: 'Gerencial', auth_role: 'gerencial', ufs: ['CE', 'PI', 'CE'] }
    expect(can(profile, 'users.managePromoters')).toBe(true)
    expect(can(profile, 'fstd.editFinalized')).toBe(true)
    expect(can(profile, 'users.manageGerencial')).toBe(false)
  })

  it('grants a Promotor with exactly one UF only operational capabilities', () => {
    const profile = { ...base, perfil: 'Promotor', auth_role: 'promotor', ufs: ['CE'] }
    expect(can(profile, 'fstd.create')).toBe(true)
    expect(can(profile, 'stores.create')).toBe(false)
  })

  it.each([
    [{ ...base, perfil: 'Admin', auth_role: 'gerencial' }],
    [{ ...base, perfil: 'Gerencial', auth_role: 'admin', ufs: ['CE'] }],
    [{ ...base, perfil: 'Promotor', auth_role: 'promotor', ufs: ['CE', 'PI'] }],
    [{ ...base, perfil: 'Gerencial', auth_role: 'gerencial', ufs: [] }],
  ])('rejects an inconsistent profile or UF scope', (profile) => {
    expect(getCapabilities(profile)).toEqual([])
  })

  it.each([
    [{ ...base, ativo: false, perfil: 'Admin', auth_role: 'admin' }],
    [{ ...base, acesso_habilitado: false, perfil: 'Admin', auth_role: 'admin' }],
  ])('does not use legacy status flags as access control', (profile) => {
    expect(can(profile, 'admin.runRestrictedOperations')).toBe(true)
  })
})
