import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EnvironmentBanner from './EnvironmentBanner.jsx'

describe('EnvironmentBanner', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('identifica visualmente o ambiente de homologação', () => {
    vi.stubEnv('VITE_APP_ENV', 'homologacao')

    render(<EnvironmentBanner />)

    expect(screen.getByRole('status')).toHaveTextContent('Ambiente de homologação')
  })

  it('não aparece em outros ambientes', () => {
    vi.stubEnv('VITE_APP_ENV', 'producao')

    render(<EnvironmentBanner />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
