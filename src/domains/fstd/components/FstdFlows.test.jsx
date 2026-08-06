import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const workspaceSpy = vi.fn()
vi.mock('./PromotorWorkspace.jsx', () => ({
  PromotorWorkspace: (props) => {
    workspaceSpy(props)
    return <div data-testid="fstd-flow">{props.embeddedFstd ? 'Embutido' : 'Completo'}</div>
  },
}))

import { PromotorFstdFlow } from './PromotorFstdFlow.jsx'

describe('PromotorFstdFlow', () => {
  beforeEach(() => workspaceSpy.mockClear())

  it('expõe a jornada completa pela API pública do domínio', () => {
    const profile = { id: 'p1', perfil: 'Promotor' }
    const store = { id: 'l1' }
    const target = { chave_acesso: 'n1' }

    render(<PromotorFstdFlow profile={profile} initialStore={store} initialFstdTarget={target} />)

    expect(screen.getByTestId('fstd-flow')).toHaveTextContent('Completo')
    expect(workspaceSpy).toHaveBeenCalledWith(expect.objectContaining({
      profile,
      initialStore: store,
      initialFstdTarget: target,
    }))
  })

  it('preserva o contrato do fluxo embutido e seus callbacks', () => {
    const onClose = vi.fn()
    const onCompleted = vi.fn()

    render(
      <PromotorFstdFlow
        embeddedFstd
        profile={{ id: 'g1', perfil: 'Gerencial' }}
        initialStore={{ id: 'l1' }}
        initialFstdTarget={{ chave_acesso: 'n1' }}
        onEmbeddedClose={onClose}
        onEmbeddedComplete={onCompleted}
      />,
    )

    expect(screen.getByTestId('fstd-flow')).toHaveTextContent('Embutido')
    expect(workspaceSpy).toHaveBeenCalledWith(expect.objectContaining({
      embeddedFstd: true,
      onEmbeddedClose: onClose,
      onEmbeddedComplete: onCompleted,
    }))
  })
})
