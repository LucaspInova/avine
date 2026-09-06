import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FstdAvulsaFlow, FstdLegacyTotalsEditor, FstdTableEditor, InvoiceIcon, LegacyFstdScreen, NfdConferenceErrorPopup, StoreDetailScreen, StoresScreen, UnknownNfdSheet } from './PromotorWorkspace.jsx'
import { keepNumericNfdCode } from '../model/validation'

const noop = vi.fn()

describe('NFD avulsa', () => {
  it('explica as diferenças e encaminha o autor para revisar a mesma FSTD', () => {
    const onReview = vi.fn()
    render(
      <NfdConferenceErrorPopup
        nfd={{
          numero: '123',
          conferencia_detalhes: {
            produtos: [{
              chave_produto: 'produto-1',
              nome_produto: 'OVOS BRANCOS C/30',
              tipo: 'quantidade_divergente',
              fstd_galinha: 5,
              fstd_codorna: 0,
              nota_galinha: 6,
              nota_codorna: 0,
            }],
          },
        }}
        busy={false}
        error=""
        onClose={noop}
        onReview={onReview}
      />,
    )

    expect(screen.getByRole('alertdialog')).toHaveTextContent('Revisão pendente')
    expect(screen.getByRole('table', { name: 'Comparação dos produtos' })).toHaveTextContent('FSTD: 5 · Nota: 6')
    fireEvent.click(screen.getByRole('button', { name: 'Revisar FSTD' }))
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('aceita somente dÃ­gitos no cÃ³digo da NFD', () => {
    expect(keepNumericNfdCode('NFD-12A/3')).toBe('123')

    render(<FstdAvulsaFlow store={{ nome: 'Loja Centro', codigo: '10' }} productsCatalog={[]} catalogLoading={false} busy={false} onBack={noop} onCreate={noop} />)
    const codeInput = screen.getByRole('textbox')
    fireEvent.change(codeInput, { target: { value: '12A/3' } })
    expect(codeInput).toHaveValue('123')
  })

  it('deixa o faturado editÃ¡vel e posiciona adicionar produtos apÃ³s o total', () => {
    const product = {
      codigo_produto: '123',
      nome: 'CAIPIRA C/10',
      descricao: 'CAIPIRA C/10',
      imagem_url: '',
      quantidade_faturada_galinha: 0,
      quantidade_faturada_codorna: 0,
      is_avulsa: true,
    }
    render(<FstdTableEditor products={[product]} motivos={[{ id: 'm1', nome: 'Avaria', ativo: true }]} busy={false} processFinalized={false} allowFinalizedEdit={false} onAddProducts={noop} onSubmit={noop} />)

    const billedInput = screen.getByRole('spinbutton', { name: 'Faturado de CAIPIRA C/10' })
    expect(billedInput).not.toBeDisabled()
    fireEvent.change(billedInput, { target: { value: '7' } })
    expect(billedInput).toHaveValue(7)

    const totalRow = screen.getByRole('row', { name: /Total/ })
    const addProductsButton = screen.getByRole('button', { name: '+ Adicionar mais produtos' })
    expect(totalRow.compareDocumentPosition(addProductsButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('restaura o rascunho local sem enviar alterações', () => {
    const product = {
      codigo_produto: '123',
      nome: 'CAIPIRA C/10',
      descricao: 'CAIPIRA C/10',
      imagem_url: '',
      quantidade_faturada_galinha: 0,
      quantidade_faturada_codorna: 0,
      is_avulsa: true,
    }
    const onSubmit = vi.fn()
    render(<FstdTableEditor products={[product]} motivos={[{ id: 'm1', nome: 'Avaria', ativo: true }]} busy={false} processFinalized={false} allowFinalizedEdit={false} onAddProducts={noop} onSubmit={onSubmit} />)

    const billedInput = screen.getByRole('spinbutton', { name: 'Faturado de CAIPIRA C/10' })
    fireEvent.change(billedInput, { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar alterações', hidden: true }))

    expect(billedInput.value).toBe('')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('histórico de desconhecimento', () => {
  it('mostra os comentários anteriores e permite adicionar uma retificação', () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    render(<UnknownNfdSheet
      open
      comment="Nova informação"
      busy={false}
      error=""
      history={[{
        comentario_id: 'c1',
        autor_nome: 'Promotor Um',
        tipo: 'abertura',
        comentario: 'Não reconheço esta nota.',
        created_at: '2026-09-05T12:00:00Z',
      }]}
      isExistingCase
      onChange={onChange}
      onClose={noop}
      onSubmit={onSubmit}
    />)

    expect(screen.getByRole('dialog', { name: 'Histórico do desconhecimento' })).toHaveTextContent('Não reconheço esta nota.')
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled()
    fireEvent.change(screen.getByPlaceholderText('Adicione uma correção ou informação ao histórico'), { target: { value: 'Informação corrigida' } })
    expect(onChange).toHaveBeenCalledWith('Informação corrigida')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('mantém observações opcionais orientadas no modo agregado', () => {
    render(<FstdTableEditor
      products={[]}
      motivos={[]}
      busy={false}
      processFinalized={false}
      allowFinalizedEdit={false}
      onAddProducts={noop}
      onSubmit={noop}
    />)

    expect(screen.getByPlaceholderText(/Opcional: lote, data do ovo, nota de venda/)).toBeVisible()
  })
})

describe('FSTD legada sem produtos detalhados', () => {
  it('edita somente os retornos agregados de Galinha e Codorna', () => {
    const onSubmit = vi.fn()
    render(
      <FstdLegacyTotalsEditor
        legacy={{ legado_id: 7, qtd_retorno_galinha: 10, qtd_retorno_codorna: 2 }}
        billedGalinha={100}
        billedCodorna={20}
        busy={false}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText(/não possui produtos detalhados/i)).toBeVisible()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Retorno de Galinha' }), { target: { value: '25' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Retorno de Codorna' }), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(onSubmit).toHaveBeenCalledWith({ legadoId: 7, retornoGalinha: 25, retornoCodorna: 5 })
  })

  it('rejeita retorno maior que o faturado', () => {
    const onSubmit = vi.fn()
    render(<FstdLegacyTotalsEditor legacy={{ legado_id: 7 }} billedGalinha={10} billedCodorna={0} busy={false} onSubmit={onSubmit} />)

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Retorno de Galinha' }), { target: { value: '11' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    expect(screen.getByText(/não pode ser maior/i)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
const storesProps = {
  stores: [], nfds: [], loading: false, search: '', onSearch: noop, onMenu: noop,
  onCloseProfileMenu: noop, onLogout: noop, onUploadPhoto: noop, photoBusy: false,
  profile: { id: 'p1', nome: 'Paula', perfil: 'Promotor' }, profileMenuOpen: false,
  profilePhoto: '', onOpenStore: noop,
}

describe('support header', () => {
  it('opens WhatsApp in a new tab with the pre-filled message', () => {
    render(<StoresScreen {...storesProps} />)

    const supportLink = screen.getByRole('link', { name: 'Abrir suporte pelo WhatsApp' })
    expect(supportLink).toHaveAttribute('href', 'https://wa.me/5585986532599?text=Ol%C3%A1!%20Preciso%20de%20suporte%20na%20plataforma%20Avine.')
    expect(supportLink).toHaveAttribute('target', '_blank')
    expect(supportLink).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

describe('telas proprietárias de lojas e notas do Promotor', () => {
  it('normaliza finalizada para o ícone visual verde de concluída', () => {
    render(<InvoiceIcon status="finalizada" />)

    expect(document.querySelector('svg')).toHaveClass('document-glyph', 'is-sent')
  })

  it('cobre carregamento, vazio, pesquisa e abertura da loja pelo contrato público', () => {
    const { rerender } = render(<StoresScreen {...storesProps} loading />)
    expect(screen.getByText('Carregando lojas...')).toBeVisible()
    rerender(<StoresScreen {...storesProps} />)
    expect(screen.getByText('Nenhuma loja vinculada ao seu usuário.')).toBeVisible()

    const onOpenStore = vi.fn()
    const store = { id: 'l1', nome: 'Loja Centro', codigo: '10', cidade: 'Fortaleza', uf: 'CE' }
    rerender(<StoresScreen {...storesProps} stores={[store]} nfds={[{ loja_id: 'l1', status_nfd: 'atrasada', visual_status: 'overdue' }]} onOpenStore={onOpenStore} />)
    expect(screen.getByText('1 Notas Pendentes')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Loja Centro/ }))
    expect(onOpenStore).toHaveBeenCalledWith(store)
  })

  it('restaura filtros de notas, abre nota/FSTD avulsa e volta à navegação anterior', () => {
    const onBack = vi.fn(); const onOpenNfd = vi.fn(); const onOpenAvulsa = vi.fn(); const onStatusFilter = vi.fn()
    const note = { id: 'n1', numero: '123', data_emissao: '2026-08-01', status_nfd: 'atrasada', visual_status: 'overdue', valor_total: 10 }
    render(<StoreDetailScreen store={{ nome: 'Loja Centro' }} nfds={[note]} statusFilter="atrasada" search="" onSearch={noop} onStatusFilter={onStatusFilter} onBack={onBack} onOpenNfd={onOpenNfd} onOpenAvulsa={onOpenAvulsa} />)
    fireEvent.click(screen.getByRole('button', { name: 'Finalizadas' }))
    expect(onStatusFilter).toHaveBeenCalledWith('finalizada')
    fireEvent.click(screen.getByRole('button', { name: /NFD: 123/ }))
    expect(onOpenNfd).toHaveBeenCalledWith(note)
    fireEvent.click(screen.getByRole('button', { name: '+ FSTD Avulsa' }))
    expect(onOpenAvulsa).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('mantém a busca visível e evita o estado de notas pendentes quando a pesquisa não encontra NFD', () => {
    render(<StoreDetailScreen store={{ nome: 'Loja Centro' }} nfds={[]} statusFilter="atrasada" search="a" onSearch={noop} onStatusFilter={noop} onBack={noop} onOpenNfd={noop} onOpenAvulsa={noop} />)

    expect(screen.getByRole('searchbox')).toHaveValue('a')
    expect(screen.getByText('Nenhuma NFD encontrada para esta pesquisa.')).toBeVisible()
    expect(screen.queryByText('0 Notas Pendentes!')).not.toBeInTheDocument()
  })
})

describe('integração do formulário FSTD com o contrato de domínio', () => {
  it('envia os totais agregados sem criar dados por produto', () => {
    const onSubmit = vi.fn()
    render(
      <LegacyFstdScreen
        store={{ id: 'loja-1', nome: 'Loja Centro' }}
        nfd={{ numero: '123', quantidade_galinha: 10, quantidade_codorna: 4 }}
        motivos={[{ id: 'motivo-1', nome: 'Avaria' }]}
        summary={{ motivo_id: 'motivo-1', quantidade_retorno_galinha: 2, quantidade_retorno_codorna: 1, fotos: ['foto.webp'] }}
        busy={false}
        error=""
        onBack={noop}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '3' } })
    fireEvent.change(screen.getByPlaceholderText(/nota de venda/i), { target: { value: 'Caixas conferidas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      motivoId: 'motivo-1',
      retornoGalinha: 3,
      retornoCodorna: 1,
      observacao: 'Caixas conferidas',
      fotosExistentes: ['foto.webp'],
    }))
  })

  it('mostra erro da fronteira e não confirma uma mutação incompleta', () => {
    const onSubmit = vi.fn()
    render(<LegacyFstdScreen store={{ nome: 'Loja Centro' }} nfd={{ numero: '123' }} motivos={[]} busy={false} error="Falha ao salvar FSTD" onBack={noop} onSubmit={onSubmit} />)
    expect(screen.getByText('Falha ao salvar FSTD')).toBeVisible()
    const submit = screen.getByRole('button', { name: /Finalizar|Enviar|Salvar/ })
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
