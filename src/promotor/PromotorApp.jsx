import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import avineLogo from '../assets/avine-logo.svg'
import './PromotorApp.css'

const statusTabs = [
  { id: 'atrasada', label: 'Atrasadas' },
  { id: 'finalizada', label: 'Finalizadas' },
  { id: 'avulsa', label: 'Avulsas' },
  { id: 'outros', label: 'Outros' },
]

const initialFstdForm = {
  motivoId: '',
  gal: '',
  cod: '',
  notaVenda: '',
  lotes: '',
  fotos: [],
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0
}

function formatDate(date) {
  if (!date) return '-'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`))
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', {
    currency: 'BRL',
    style: 'currency',
  }).format(value ?? 0)
}

function getFirstName(name) {
  return name?.split(/\s+/).filter(Boolean)[0] ?? 'Promotor'
}

function getStoreTitle(store) {
  return store?.nome ?? 'Loja'
}

function getStoreCode(store, nfd) {
  return store?.codigo ?? nfd?.loja_codigo ?? '-'
}

function getBilledGal(nfd) {
  return Number(nfd?.quantidade_gal ?? nfd?.quantidade_total ?? 0)
}

function getBilledCod(nfd) {
  return Number(nfd?.quantidade_cod ?? 0)
}

function getPendingCount(storeId, nfds) {
  return nfds.filter((nfd) => nfd.loja_id === storeId && nfd.status_nfd === 'atrasada').length
}

function filterBySearch(items, search, fields) {
  const query = search.trim().toLowerCase()
  if (!query) return items

  return items.filter((item) =>
    fields.some((field) => String(item[field] ?? '').toLowerCase().includes(query)),
  )
}

async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

async function getPromotorProfile(userId) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, auth_user_id, email, nome, perfil, estado, fotos_habilitadas, ativo, foto_url')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

function AppHeader({ title, onBack, onLogout }) {
  return (
    <header className="mobile-header">
      <div className="mobile-status" aria-hidden="true">
        <span>11:12</span>
        <span className="mobile-notch" />
        <span className="mobile-signal">▮▮▮</span>
      </div>
      <div className="mobile-titlebar">
        {onBack ? (
          <button className="mobile-icon-button" type="button" onClick={onBack} aria-label="Voltar">
            ‹
          </button>
        ) : (
          <button className="mobile-icon-button" type="button" aria-label="Menu">
            ≡
          </button>
        )}
        <strong>{title}</strong>
        {onLogout ? (
          <button className="mobile-text-button" type="button" onClick={onLogout}>
            Sair
          </button>
        ) : (
          <span className="mobile-spacer" />
        )}
      </div>
    </header>
  )
}

function LoginScreen({ error, busy, onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <main className="promotor-login">
      <form
        className="promotor-login-card"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit(email.trim().toLowerCase(), password)
        }}
      >
        <img src={avineLogo} alt="Avine" />
        <div>
          <h1>FSTD Digital</h1>
          <p>Acesso do promotor</p>
        </div>

        <label>
          <span>E-mail</span>
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </label>

        <label>
          <span>Senha</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>

        {error && <strong className="promotor-error">{error}</strong>}

        <button type="submit" disabled={busy || !email || !password}>
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

function SearchField({ value, onChange }) {
  return (
    <label className="mobile-search">
      <span aria-hidden="true">⌕</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Procurar"
        type="search"
      />
    </label>
  )
}

function EmptyNotice({ children }) {
  return (
    <div className="empty-notice">
      <span aria-hidden="true">♡</span>
      <strong>{children}</strong>
    </div>
  )
}

function StoreIcon({ pending }) {
  return <span className={`store-glyph ${pending ? 'is-pending' : 'is-clear'}`} aria-hidden="true" />
}

function StoresScreen({ stores, nfds, loading, search, onSearch, onOpenStore, onLogout }) {
  const filteredStores = filterBySearch(stores, search, ['nome', 'codigo', 'cidade', 'uf'])

  return (
    <main className="promotor-app">
      <AppHeader title="Lojas" onLogout={onLogout} />

      <section className="mobile-card stores-card">
        <SearchField value={search} onChange={onSearch} />

        {loading && <p className="mobile-muted">Carregando lojas...</p>}

        {!loading && filteredStores.length === 0 && (
          <p className="mobile-muted">Nenhuma loja vinculada ao seu usuário.</p>
        )}

        <div className="store-rows">
          {filteredStores.map((store) => {
            const pendingCount = getPendingCount(store.id, nfds)

            return (
              <button
                className="store-row"
                key={store.id}
                onClick={() => onOpenStore(store)}
                type="button"
              >
                <StoreIcon pending={pendingCount > 0} />
                <span>
                  <strong>{store.nome} - (cód av: {store.codigo})</strong>
                  <small>{pendingCount} Notas Pendentes</small>
                </span>
                <b aria-hidden="true">›</b>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}

function StoreDetailScreen({
  store,
  nfds,
  statusFilter,
  search,
  onSearch,
  onStatusFilter,
  onBack,
  onOpenNfd,
  onOpenFstd,
}) {
  const visibleNfds = filterBySearch(
    nfds.filter((nfd) => nfd.status_nfd === statusFilter),
    search,
    ['numero', 'data_emissao'],
  )
  const isPendingTab = statusFilter === 'atrasada'

  return (
    <main className="promotor-app">
      <AppHeader title={getStoreTitle(store)} onBack={onBack} />

      <nav className="mobile-tabs" aria-label="Status das notas">
        {statusTabs.map((status) => (
          <button
            className={statusFilter === status.id ? 'is-active' : ''}
            key={status.id}
            onClick={() => onStatusFilter(status.id)}
            type="button"
          >
            {status.label}
          </button>
        ))}
      </nav>

      <section className="store-detail-body">
        {isPendingTab && visibleNfds.length === 0 ? (
          <EmptyNotice>0 Notas Pendentes!</EmptyNotice>
        ) : (
          <>
            <SearchField value={search} onChange={onSearch} />

            <div className="nfd-rows">
              {visibleNfds.map((nfd) => (
                <button className="nfd-row" key={nfd.id} type="button" onClick={() => onOpenNfd(nfd)}>
                  <span className="document-glyph" aria-hidden="true" />
                  <span>
                    <small>{formatDate(nfd.data_emissao)}</small>
                    <strong>NFD: {nfd.numero} ({formatMoney(nfd.valor_total)})</strong>
                    <em>GAL: {getBilledGal(nfd)} ovos - COD: {getBilledCod(nfd)} ovos</em>
                  </span>
                  <b aria-hidden="true">›</b>
                </button>
              ))}
            </div>
          </>
        )}

        <button className="avulsa-button" type="button" onClick={() => onOpenFstd(null)}>
          + FSTD Avulsa
        </button>
      </section>
    </main>
  )
}

function NfdDetailScreen({ store, nfd, onBack, onOpenFstd }) {
  return (
    <main className="promotor-app">
      <AppHeader title={nfd.numero} onBack={onBack} />

      <section className="nfd-detail-card">
        <dl className="nfd-facts">
          <div>
            <dt>Loja</dt>
            <dd>{getStoreTitle(store)}</dd>
          </div>
          <div>
            <dt>Código Loja</dt>
            <dd>{getStoreCode(store, nfd)}</dd>
          </div>
          <div>
            <dt>NFD</dt>
            <dd>{nfd.numero}</dd>
          </div>
          <div>
            <dt>Data da Emissão</dt>
            <dd>{formatDate(nfd.data_emissao)}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{formatMoney(nfd.valor_total)}</dd>
          </div>
          <div>
            <dt>Faturado GAL</dt>
            <dd>{getBilledGal(nfd)} ovos</dd>
          </div>
          <div>
            <dt>Faturado COD</dt>
            <dd>{getBilledCod(nfd)} ovos</dd>
          </div>
        </dl>

        <div className="nfd-actions">
          <button
            type="button"
            onClick={() => window.open('https://meudanfe.com.br/', '_blank', 'noopener,noreferrer')}
          >
            <span aria-hidden="true">▤</span>
            Nota Fiscal
          </button>
          <button type="button" onClick={() => onOpenFstd(nfd)}>
            <span aria-hidden="true">✎</span>
            FSTD
          </button>
        </div>

        <p className="deadline-pill">Pendente no prazo</p>

        <div className="unknown-nf">
          <strong>△ Desconhece NF?</strong>
          <button type="button">Encaminhar</button>
        </div>
      </section>
    </main>
  )
}

function FieldCard({ title, children }) {
  return (
    <section className="fstd-card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function FstdScreen({ store, nfd, motivos, busy, error, onBack, onSubmit }) {
  const [form, setForm] = useState(() => ({
    ...initialFstdForm,
    gal: nfd ? '' : '',
    cod: nfd ? '' : '',
  }))
  const totalReturn = normalizeQuantity(form.gal) + normalizeQuantity(form.cod)
  const canSubmit = Boolean(store && form.motivoId && totalReturn > 0 && !busy)

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const observacao = [
      form.notaVenda.trim() ? `Nota de venda: ${form.notaVenda.trim()}` : '',
      form.lotes.trim() ? `Lotes: ${form.lotes.trim()}` : '',
      form.fotos.length > 0 ? `Fotos selecionadas: ${form.fotos.map((file) => file.name).join(', ')}` : '',
    ].filter(Boolean).join('\n')

    onSubmit({
      p_loja_id: store.id,
      p_motivo_id: form.motivoId,
      p_nfd_id: nfd?.id ?? null,
      p_quantidade_gal: normalizeQuantity(form.gal),
      p_quantidade_cod: normalizeQuantity(form.cod),
      p_quantidade_siu: 0,
      p_fotos: [],
      p_observacao: observacao || null,
    })
  }

  return (
    <main className="promotor-app fstd-app">
      <form className="fstd-mobile-form" onSubmit={handleSubmit}>
        <header className="fstd-topbar">
          <button type="button" onClick={onBack}>Cancelar</button>
          <strong>{nfd?.numero ?? 'Avulsa'}</strong>
          <button type="submit" disabled={!canSubmit}>{busy ? 'Enviando' : 'Enviar'}</button>
        </header>

        <section className="fstd-hero">
          <img src={avineLogo} alt="Avine" />
          <div>
            <span>Nº Controle: {nfd?.numero ?? 'Avulsa'}</span>
            <h1>{getStoreTitle(store)}</h1>
            <p>NFD: {nfd?.numero ?? 'Avulsa'} / CÓD: {getStoreCode(store, nfd)}</p>
            <p>RESPONSÁVEL: {store?.responsavel ?? '-'}</p>
          </div>
        </section>

        <div className="fstd-form-body">
          <FieldCard title="Devolução">
            <label className="mobile-field">
              <span>
                Motivo
                <small>Necessário</small>
              </span>
              <select
                value={form.motivoId}
                onChange={(event) => updateForm({ motivoId: event.target.value })}
              >
                <option value="">Selecione</option>
                {motivos.map((motivo) => (
                  <option key={motivo.id} value={motivo.id}>
                    {motivo.nome}
                  </option>
                ))}
              </select>
            </label>
          </FieldCard>

          <FieldCard title="Galinha">
            <label className="mobile-field">
              <span>Faturado</span>
              <input disabled value={nfd ? `${getBilledGal(nfd)} ovos` : '0 ovos'} />
            </label>
            <label className="mobile-field">
              <span>
                Retorno
                <small>Necessário</small>
              </span>
              <div className="unit-input">
                <input
                  min="0"
                  inputMode="numeric"
                  onChange={(event) => updateForm({ gal: event.target.value })}
                  type="number"
                  value={form.gal}
                />
                <em>ovos</em>
              </div>
            </label>
          </FieldCard>

          <FieldCard title="Codorna">
            <label className="mobile-field">
              <span>Faturado</span>
              <input disabled value={nfd ? `${getBilledCod(nfd)} ovos` : '0 ovos'} />
            </label>
            <label className="mobile-field">
              <span>
                Retorno
                <small>Necessário</small>
              </span>
              <div className="unit-input">
                <input
                  min="0"
                  inputMode="numeric"
                  onChange={(event) => updateForm({ cod: event.target.value })}
                  type="number"
                  value={form.cod}
                />
                <em>ovos</em>
              </div>
            </label>
          </FieldCard>

          <FieldCard title="Fotos">
            <label className="photo-button">
              <input
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => updateForm({ fotos: Array.from(event.target.files ?? []) })}
                type="file"
              />
              Adicionar Fotos
            </label>
            {form.fotos.length > 0 && <p className="photo-count">{form.fotos.length} foto(s) selecionada(s)</p>}
          </FieldCard>

          <FieldCard title="Adicional">
            <label className="mobile-field">
              <span>Nota de Venda</span>
              <input value={form.notaVenda} onChange={(event) => updateForm({ notaVenda: event.target.value })} />
            </label>
            <label className="mobile-field">
              <span>Lotes</span>
              <textarea value={form.lotes} onChange={(event) => updateForm({ lotes: event.target.value })} rows="3" />
            </label>
          </FieldCard>

          {error && <strong className="promotor-error">{error}</strong>}
        </div>
      </form>
    </main>
  )
}

function PromotorWorkspace({ profile, onLogout }) {
  const queryClient = useQueryClient()
  const [selectedStore, setSelectedStore] = useState(null)
  const [selectedNfd, setSelectedNfd] = useState(null)
  const [fstdTarget, setFstdTarget] = useState(undefined)
  const [storeSearch, setStoreSearch] = useState('')
  const [nfdSearch, setNfdSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('atrasada')

  const storesQuery = useQuery({
    queryKey: ['promotor', 'lojas', profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lojas')
        .select('id, codigo, nome, uf, cidade')
        .order('nome', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })

  const nfdsQuery = useQuery({
    enabled: (storesQuery.data?.length ?? 0) > 0,
    queryKey: ['promotor', 'nfds', profile.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nfds_com_status')
        .select(
          'id, loja_id, loja_codigo, loja_nome, numero, data_emissao, data_envio, valor_total, quantidade_total, status_nfd, fstd_id, fstd_status',
        )
        .order('data_emissao', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })

  const motivosQuery = useQuery({
    queryKey: ['promotor', 'motivos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motivos_devolucao')
        .select('id, nome, ordem, ativo')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('nome', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })

  const stores = storesQuery.data ?? []
  const nfds = nfdsQuery.data ?? []
  const selectedStoreNfds = selectedStore ? nfds.filter((nfd) => nfd.loja_id === selectedStore.id) : []

  const solicitarMutation = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.rpc('solicitar_fstd', payload)
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      setFstdTarget(undefined)
      setSelectedNfd(null)
      await queryClient.invalidateQueries({ queryKey: ['promotor', 'nfds'] })
    },
  })

  const pageError = storesQuery.error?.message || nfdsQuery.error?.message || motivosQuery.error?.message

  if (fstdTarget !== undefined && selectedStore) {
    return (
      <FstdScreen
        store={{ ...selectedStore, responsavel: getFirstName(profile.nome).toUpperCase() }}
        nfd={fstdTarget}
        motivos={motivosQuery.data ?? []}
        busy={solicitarMutation.isPending}
        error={solicitarMutation.error?.message}
        onBack={() => setFstdTarget(undefined)}
        onSubmit={(payload) => solicitarMutation.mutate(payload)}
      />
    )
  }

  if (selectedNfd && selectedStore) {
    return (
      <NfdDetailScreen
        store={selectedStore}
        nfd={selectedNfd}
        onBack={() => setSelectedNfd(null)}
        onOpenFstd={setFstdTarget}
      />
    )
  }

  if (selectedStore) {
    return (
      <div className="promotor-app-shell">
        {pageError && <strong className="promotor-page-error">{pageError}</strong>}
        <StoreDetailScreen
          store={selectedStore}
          nfds={selectedStoreNfds}
          statusFilter={statusFilter}
          search={nfdSearch}
          onSearch={setNfdSearch}
          onStatusFilter={setStatusFilter}
          onBack={() => {
            setSelectedStore(null)
            setNfdSearch('')
            setStatusFilter('atrasada')
          }}
          onOpenNfd={setSelectedNfd}
          onOpenFstd={setFstdTarget}
        />
      </div>
    )
  }

  return (
    <div className="promotor-app-shell">
      {pageError && <strong className="promotor-page-error">{pageError}</strong>}
      <StoresScreen
        stores={stores}
        nfds={nfds}
        loading={storesQuery.isLoading || nfdsQuery.isLoading}
        search={storeSearch}
        onSearch={setStoreSearch}
        onLogout={onLogout}
        onOpenStore={(store) => {
          setSelectedStore(store)
          setStatusFilter('atrasada')
        }}
      />
    </div>
  )
}

function PromotorApp() {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loginBusy, setLoginBusy] = useState(false)
  const [authError, setAuthError] = useState('')

  const profileQuery = useQuery({
    enabled: Boolean(session?.user?.id),
    queryKey: ['promotor', 'profile', session?.user?.id],
    queryFn: () => getPromotorProfile(session.user.id),
  })

  useEffect(() => {
    let mounted = true

    getSession()
      .then((currentSession) => {
        if (mounted) setSession(currentSession)
      })
      .catch((error) => {
        if (mounted) setAuthError(error.message)
      })
      .finally(() => {
        if (mounted) setAuthLoading(false)
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      queryClient.clear()
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const profile = profileQuery.data
  const isAllowed = profile?.perfil === 'Promotor' && profile?.ativo

  async function handleLogin(email, password) {
    setLoginBusy(true)
    setAuthError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setAuthError('E-mail ou senha inválidos.')
      setLoginBusy(false)
      return
    }

    const nextProfile = await getPromotorProfile(data.session.user.id)

    if (nextProfile?.perfil !== 'Promotor' || !nextProfile?.ativo) {
      await supabase.auth.signOut()
      setAuthError('Este usuário não tem acesso ao app do promotor.')
      setLoginBusy(false)
      return
    }

    setSession(data.session)
    setLoginBusy(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setSession(null)
    setAuthError('')
    queryClient.clear()
  }

  const authorizationError = useMemo(() => {
    if (profileQuery.isLoading || !session || !profile) return ''
    if (isAllowed) return ''
    return 'Este usuário não tem acesso ao app do promotor.'
  }, [isAllowed, profile, profileQuery.isLoading, session])

  if (authLoading || (session && profileQuery.isLoading)) {
    return (
      <main className="promotor-loading">
        <span>Carregando FSTD Digital...</span>
      </main>
    )
  }

  if (!session || !isAllowed) {
    return (
      <LoginScreen
        busy={loginBusy}
        error={authError || profileQuery.error?.message || authorizationError}
        onSubmit={handleLogin}
      />
    )
  }

  return <PromotorWorkspace profile={profile} onLogout={handleLogout} />
}

export default PromotorApp
