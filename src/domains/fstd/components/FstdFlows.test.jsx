import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workspaceSpy = vi.fn()
vi.mock('../../../apps/promotor/PromotorApp.jsx', () => ({ PromotorWorkspace: (props) => {
  workspaceSpy(props)
  return <div data-testid="promotor-presentation">{props.embeddedFstd ? 'Gerencial' : 'Promotor'}</div>
} }))
vi.mock('../../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ profile: { id: 'u1', perfil: 'Gerencial' } }) }))

import { PromotorFstdFlow } from './PromotorFstdFlow.jsx'
import { GerencialFstdModal } from '../../../apps/gerencial/features/fstd/GerencialFstdModal.jsx'

describe('apresentações Promotor e Gerencial do mesmo fluxo FSTD', () => {
  beforeEach(() => workspaceSpy.mockClear())

  it('apresenta o caso de uso como jornada Promotor', () => {
    render(<PromotorFstdFlow profile={{ id: 'p1', perfil: 'Promotor' }} initialStore={{ id: 'l1' }} initialFstdTarget={{ chave_acesso: 'n1' }} />)
    expect(screen.getByTestId('promotor-presentation')).toHaveTextContent('Promotor')
    expect(workspaceSpy).toHaveBeenCalledWith(expect.objectContaining({ initialStore: { id: 'l1' }, initialFstdTarget: { chave_acesso: 'n1' } }))
  })

  it('muda para modal Gerencial preservando alvo, callbacks e fluxo compartilhado', () => {
    const onClose = vi.fn(); const onCompleted = vi.fn()
    render(<GerencialFstdModal note={{ chave_acesso: 'n1' }} store={{ id: 'l1' }} onClose={onClose} onCompleted={onCompleted} />)
    expect(screen.getByTestId('promotor-presentation')).toHaveTextContent('Gerencial')
    expect(workspaceSpy).toHaveBeenCalledWith(expect.objectContaining({ embeddedFstd: true, initialStore: { id: 'l1' }, initialFstdTarget: { chave_acesso: 'n1' }, onEmbeddedClose: onClose, onEmbeddedComplete: onCompleted }))
  })
})
