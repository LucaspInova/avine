import { useEffect, useState } from 'react'
import { useInvoiceUnknownHistory } from '../../../../domains/invoices'
import pdfIcon from '../../../../shared/assets/ui-icons/arquivo-pdf.png'

export default function NotaFiscalModal({
  note,
  store,
  onClose,
  onPending,
  onUnknown,
  onRecognize,
  Icon,
  NotaStatusIcon,
  formatNoteDate,
  formatNoteQuantity,
}) {
  const [invoiceCopied, setInvoiceCopied] = useState(false)
  const [pendingBusy, setPendingBusy] = useState(false)
  const [pendingError, setPendingError] = useState('')
  const [unknownBusy, setUnknownBusy] = useState(false)
  const [unknownError, setUnknownError] = useState('')
  const [unknownConfirmOpen, setUnknownConfirmOpen] = useState(false)
  const [unknownComment, setUnknownComment] = useState('')
  const [recognizeBusy, setRecognizeBusy] = useState(false)
  const [recognizeError, setRecognizeError] = useState('')
  const historyQuery = useInvoiceUnknownHistory(store?.id, note?.nota_fiscal)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!note) return null

  const isFinalized = note.status === 'Finalizada'
  const isUnknown = note.status === 'Desconhecida'
  const title = `${note.codigo_cliente ?? '-'} - ${note.nota_fiscal ?? '-'}`
  const statusDescription = isFinalized ? 'FSTD Finalizada' : isUnknown ? 'NFD Desconhecida' : 'FSTD Pendente'

  async function handleOpenInvoice() {
    window.open('https://meudanfe.com.br/#', '_blank', 'noopener,noreferrer')
    const accessKey = String(note.chave_acesso ?? '').trim()
    if (!accessKey) return
    try {
      await navigator.clipboard.writeText(accessKey)
      setInvoiceCopied(true)
    } catch {
      setInvoiceCopied(false)
    }
  }

  async function handleOpenPending() {
    if (isFinalized || note.status !== 'Pendente' || !onPending || pendingBusy) return
    setPendingBusy(true)
    setPendingError('')
    try {
      await onPending(note)
    } catch (requestError) {
      setPendingError(requestError?.message || requestError?.details || requestError?.hint || 'Não foi possível abrir o preenchimento da NFD.')
    } finally {
      setPendingBusy(false)
    }
  }

  function handleOpenUnknownConfirm() {
    if (isFinalized || !onUnknown || unknownBusy) return
    setUnknownComment('')
    setUnknownError('')
    setUnknownConfirmOpen(true)
  }

  async function handleMarkUnknown() {
    if (isFinalized || !onUnknown || unknownBusy) return
    const comment = unknownComment.trim()
    if (comment.length < 5) return
    setUnknownBusy(true)
    setUnknownError('')
    try {
      await onUnknown(note, comment, isUnknown ? 'retificacao' : 'comentario')
      setUnknownConfirmOpen(false)
    } catch (requestError) {
      setUnknownError(requestError?.message || requestError?.details || requestError?.hint || 'Não foi possível atualizar a NFD como desconhecida.')
    } finally {
      setUnknownBusy(false)
    }
  }

  async function handleRecognize() {
    if (!isUnknown || !onRecognize || recognizeBusy) return
    setRecognizeBusy(true)
    setRecognizeError('')
    try {
      await onRecognize(note)
    } catch (requestError) {
      setRecognizeError(requestError?.message || requestError?.details || requestError?.hint || 'Não foi possível reconhecer novamente esta NFD.')
    } finally {
      setRecognizeBusy(false)
    }
  }

  return (
    <div className="nota-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="nota-modal" role="dialog" aria-modal="true" aria-labelledby="nota-modal-title">
        <header className="nota-modal-titlebar">
          <strong id="nota-modal-title">{title}</strong>
          <button type="button" onClick={onClose} aria-label="Fechar nota fiscal"><Icon name="x" /></button>
        </header>

        <div className="nota-modal-summary">
          <button className="nota-modal-summary-button is-invoice" type="button" onClick={handleOpenInvoice}>
            <NotaStatusIcon status="Finalizada" />
            <span><strong>NFD</strong><small>Emitida em {formatNoteDate(note.data_emissao)}</small></span>
            <img className="nota-modal-pdf-icon" src={pdfIcon} alt="" aria-hidden="true" />
          </button>
          <button className="nota-modal-summary-button is-status" type="button" disabled={isFinalized || note.status !== 'Pendente' || pendingBusy} onClick={handleOpenPending}>
            <NotaStatusIcon status={note.status} />
            <span><strong>{note.status}</strong><small>{pendingBusy ? 'Abrindo preenchimento...' : statusDescription}</small></span>
            <span className="nota-modal-add" aria-hidden="true">+</span>
          </button>
        </div>

        <div className="nota-modal-body">
          <div className="nota-modal-content">
            <div className="nota-modal-backlink">‹ <strong>{title}</strong></div>
            <h2>Faturado</h2>
            <dl>
              <div><dt>Galinha</dt><dd>{formatNoteQuantity(note.quantidade_galinha)} ovos</dd></div>
              <div><dt>Codorna</dt><dd>{formatNoteQuantity(note.quantidade_codorna)} ovos</dd></div>
            </dl>
          </div>

          <div className="nota-modal-alerts">
            <div className="nota-modal-alert is-pdf">
              <img src={pdfIcon} alt="" aria-hidden="true" />
              <span><strong>Arquivo PDF indisponível!</strong><small>{statusDescription}</small></span>
            </div>
            <div className="nota-modal-alert is-unknown">
              <Icon name="alert" />
              <span>{isUnknown ? 'NFD marcada como desconhecida' : 'Desconheço NF?'}</span>
              {isUnknown ? (
                <div className="nota-modal-unknown-actions">
                  <button type="button" disabled={unknownBusy} onClick={handleOpenUnknownConfirm}>Comentário</button>
                  <button className="is-recognize" type="button" disabled={recognizeBusy} onClick={handleRecognize}>
                    {recognizeBusy ? 'Atualizando...' : 'Reconheço NFD'}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={isFinalized || unknownBusy} onClick={handleOpenUnknownConfirm}>Desconheço</button>
              )}
            </div>
            {historyQuery.data?.length > 0 && (
              <section className="nota-unknown-history" aria-label="Histórico do desconhecimento">
                <strong>Histórico</strong>
                {historyQuery.data.map((item) => (
                  <article key={item.comentario_id}>
                    <div><b>{item.autor_nome}</b><time dateTime={item.created_at}>{formatNoteDate(item.created_at)}</time></div>
                    <small>{item.tipo === 'abertura' ? 'Abertura' : item.tipo === 'retificacao' ? 'Retificação' : item.tipo === 'reconhecimento' ? 'Reconhecimento' : 'Comentário'}</small>
                    <p>{item.comentario}</p>
                  </article>
                ))}
              </section>
            )}
            {historyQuery.isLoading && <small className="nota-unknown-history-loading">Carregando histórico...</small>}
            {historyQuery.error && <small className="nota-unknown-history-error">Não foi possível carregar o histórico.</small>}
          </div>
        </div>

        {invoiceCopied && <p className="nota-modal-copy-feedback" role="status">Chave de acesso copiada.</p>}
        {pendingError && <p className="nota-modal-pending-error" role="alert">{pendingError}</p>}
        {unknownError && <p className="nota-modal-pending-error" role="alert">{unknownError}</p>}
        {recognizeError && <p className="nota-modal-pending-error" role="alert">{recognizeError}</p>}
      </section>

      {unknownConfirmOpen && (
        <div className="nota-unknown-confirm-layer" role="presentation">
          <section className="nota-unknown-confirm" role="dialog" aria-modal="true" aria-labelledby="nota-unknown-confirm-title">
            <header>
              <strong id="nota-unknown-confirm-title">{isUnknown ? 'Adicionar comentário' : 'Desconhecer NFD'}</strong>
              <button type="button" onClick={() => setUnknownConfirmOpen(false)} aria-label="Fechar confirmação">×</button>
            </header>
            <p>{isUnknown ? 'Registre uma correção ou nova informação sem apagar os comentários anteriores.' : 'Informe por que o usuário não reconhece esta nota fiscal.'}</p>
            <label>
              <span>{isUnknown ? 'Comentário' : 'Motivo'} <small>Obrigatório</small></span>
              <textarea value={unknownComment} onChange={(event) => setUnknownComment(event.target.value)} placeholder={isUnknown ? 'Digite a nova informação ou retificação' : 'Explique o motivo'} rows="4" autoFocus />
            </label>
            {unknownError && <strong className="nota-unknown-confirm-error" role="alert">{unknownError}</strong>}
            <footer>
              <button type="button" onClick={() => setUnknownConfirmOpen(false)}>Cancelar</button>
              <button type="button" disabled={unknownComment.trim().length < 5 || unknownBusy} onClick={handleMarkUnknown}>
                {unknownBusy ? 'Atualizando...' : isUnknown ? 'Adicionar' : 'Confirmar'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
