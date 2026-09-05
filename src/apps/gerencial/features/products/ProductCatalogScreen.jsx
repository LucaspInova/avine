import { useEffect, useMemo, useState } from 'react'
import {
  linkProductCode,
  listPendingProducts,
  listProducts,
  saveProduct,
  splitProductCodes,
  uploadProductImage,
} from '../../../../domains/products'
import './ProductCatalogScreen.css'

const emptyForm = {
  id: null,
  nome: '',
  codigos: '',
  ovosUnd: '',
  categoria: '',
  imagemUrl: '',
  status: true,
}

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

async function loadProductData() {
  const [products, pending] = await Promise.all([listProducts(), listPendingProducts()])
  return { products, pending }
}

function ProductFormModal({ initial, busy, error, onClose, onSave }) {
  const [form, setForm] = useState(initial)
  const [image, setImage] = useState(null)
  const valid = form.nome.trim() && splitProductCodes(form.codigos).length > 0
    && Number(form.ovosUnd) > 0 && form.categoria.trim()

  return (
    <div className="product-modal-backdrop" role="presentation">
      <form className="product-modal" onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSave(form, image)
      }}>
        <header><h2>{form.id ? 'Editar produto' : 'Cadastrar produto'}</h2><button type="button" onClick={onClose} aria-label="Fechar produto">×</button></header>
        <label><span>Nome</span><input value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} required /></label>
        <label><span>Códigos vinculados</span><textarea value={form.codigos} onChange={(event) => setForm({ ...form, codigos: event.target.value })} placeholder="Separe os códigos com ponto e vírgula" required /></label>
        <div className="product-modal-grid">
          <label><span>Ovos por embalagem</span><input type="number" min="1" value={form.ovosUnd} onChange={(event) => setForm({ ...form, ovosUnd: event.target.value })} required /></label>
          <label><span>Categoria</span><input value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value })} required /></label>
        </div>
        <label><span>URL da foto</span><input type="url" value={form.imagemUrl} onChange={(event) => setForm({ ...form, imagemUrl: event.target.value })} placeholder="Opcional: cole uma URL ou envie um arquivo" /></label>
        <label className="product-file"><span>Enviar nova foto</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] ?? null)} /></label>
        <label className="product-status"><input type="checkbox" checked={form.status} onChange={(event) => setForm({ ...form, status: event.target.checked })} /><span>Produto ativo</span></label>
        {error && <p className="product-error">{error}</p>}
        <footer><button type="button" onClick={onClose}>Cancelar</button><button className="is-primary" type="submit" disabled={!valid || busy}>{busy ? 'Salvando...' : 'Salvar produto'}</button></footer>
      </form>
    </div>
  )
}

export function ProductCatalogScreen({ search = '', onSearch }) {
  const [tab, setTab] = useState('catalog')
  const [products, setProducts] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [aliasTarget, setAliasTarget] = useState({})

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await loadProductData()
      setProducts(data.products)
      setPending(data.pending)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void loadProductData()
      .then((data) => {
        if (!active) return
        setProducts(data.products)
        setPending(data.pending)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const query = normalized(search.trim())
  const filteredProducts = useMemo(() => products.filter((product) => !query || normalized(`${product.nome} ${product.codigos_vinculados} ${product.categoria}`).includes(query)), [products, query])
  const filteredPending = useMemo(() => pending.filter((product) => !query || normalized(`${product.codigo_produto} ${product.descricao_produto}`).includes(query)), [pending, query])

  function openProduct(product = null, pendingProduct = null) {
    setError('')
    setModal(product ? {
      id: product.id,
      nome: product.nome ?? '',
      codigos: product.codigos_vinculados ?? '',
      ovosUnd: product.ovos_und ?? '',
      categoria: product.categoria ?? '',
      imagemUrl: product.imagem_url ?? '',
      status: product.status !== false,
    } : {
      ...emptyForm,
      nome: pendingProduct?.descricao_produto ?? '',
      codigos: pendingProduct?.codigo_produto ?? '',
      ovosUnd: pendingProduct?.quantidade_codorna > 0 && pendingProduct?.quantidade_galinha === 0 ? 30 : '',
      categoria: pendingProduct?.quantidade_codorna > 0 && pendingProduct?.quantidade_galinha === 0 ? 'Codorna' : '',
    })
  }

  async function handleSave(form, image) {
    setSaving(true)
    setError('')
    try {
      const imageUrl = image ? await uploadProductImage(image) : form.imagemUrl.trim() || null
      await saveProduct({
        id: form.id,
        nome: form.nome,
        codigos: splitProductCodes(form.codigos),
        ovosUnd: Number(form.ovosUnd),
        categoria: form.categoria,
        imagemUrl: imageUrl,
        status: form.status,
      })
      setModal(null)
      await refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleAlias(item) {
    const productId = aliasTarget[item.codigo_produto] || item.produto_sugerido_id
    if (!productId) {
      setError('Escolha um produto existente antes de vincular o código como alias.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await linkProductCode(productId, item.codigo_produto)
      await refresh()
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : String(linkError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="product-management" aria-label="Gestão de produtos">
      <div className="product-toolbar">
        <div className="product-tabs" role="tablist" aria-label="Seções de produtos">
          <button className={tab === 'catalog' ? 'is-active' : ''} role="tab" aria-selected={tab === 'catalog'} onClick={() => setTab('catalog')} type="button">Catálogo <span>{products.length}</span></button>
          <button className={tab === 'pending' ? 'is-active' : ''} role="tab" aria-selected={tab === 'pending'} onClick={() => setTab('pending')} type="button">Pendentes <span>{pending.length}</span></button>
        </div>
        <label className="product-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => onSearch?.(event.target.value)} placeholder="Buscar produto ou código" aria-label="Buscar produto" /></label>
        <button className="product-create" type="button" onClick={() => openProduct()}>+ Novo produto</button>
      </div>

      {error && <p className="product-error">{error}</p>}
      {loading ? <p className="product-state">Carregando produtos...</p> : tab === 'catalog' ? (
        <div className="product-grid">
          {filteredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-image">{product.imagem_url ? <img src={product.imagem_url} alt="" /> : <span>Sem foto</span>}</div>
              <div className="product-card-content"><header><h3>{product.nome || 'Produto sem nome'}</h3><span className={product.status === false ? 'is-inactive' : 'is-active'}>{product.status === false ? 'Inativo' : 'Ativo'}</span></header><p>{product.categoria || 'Sem categoria'} · {product.ovos_und ?? '-'} ovos</p><div className="product-codes">{splitProductCodes(product.codigos_vinculados).map((code) => <code key={code}>{code}</code>)}</div><button type="button" onClick={() => openProduct(product)}>Editar</button></div>
            </article>
          ))}
          {filteredProducts.length === 0 && <p className="product-state">Nenhum produto encontrado.</p>}
        </div>
      ) : (
        <div className="product-pending-list">
          {filteredPending.map((item) => (
            <article className="product-pending-card" key={item.codigo_produto}>
              <div><code>{item.codigo_produto}</code><h3>{item.descricao_produto || 'Descrição não informada'}</h3><p>{item.notas_count} nota(s) · {item.itens_count} item(ns) · última ocorrência {item.ultima_data ? new Date(`${item.ultima_data}T12:00:00`).toLocaleDateString('pt-BR') : '-'}</p></div>
              {item.produto_sugerido_id && <p className="product-suggestion">Sugestão: <strong>{item.produto_sugerido_nome}</strong> ({Math.round(Number(item.similaridade ?? 0) * 100)}%). Confirme antes de vincular.</p>}
              <div className="product-pending-actions"><select aria-label={`Produto para ${item.codigo_produto}`} value={aliasTarget[item.codigo_produto] ?? item.produto_sugerido_id ?? ''} onChange={(event) => setAliasTarget((current) => ({ ...current, [item.codigo_produto]: event.target.value }))}><option value="">Escolha um produto</option>{products.filter((product) => product.status !== false).map((product) => <option key={product.id} value={product.id}>{product.nome}</option>)}</select><button disabled={saving} type="button" onClick={() => handleAlias(item)}>Vincular como alias</button><button className="is-primary" type="button" onClick={() => openProduct(null, item)}>Criar produto novo</button></div>
            </article>
          ))}
          {filteredPending.length === 0 && <p className="product-state">Nenhum código aguardando classificação.</p>}
        </div>
      )}

      {modal && <ProductFormModal initial={modal} busy={saving} error={error} onClose={() => setModal(null)} onSave={handleSave} />}
    </section>
  )
}
