import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function getDefaultKey(envName: string, fallbackName: string) {
  const fallback = Deno.env.get(fallbackName)
  if (fallback) return fallback

  const value = Deno.env.get(envName)
  if (!value) return ''

  try {
    const parsed = JSON.parse(value)
    return parsed.default ?? Object.values(parsed)[0] ?? ''
  } catch {
    return ''
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Metodo nao permitido.' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = getDefaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const serviceRoleKey = getDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization') ?? ''

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Funcao Supabase sem configuracao de ambiente.' })
  }

  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return jsonResponse(401, { error: 'Sessao invalida. Entre novamente.' })
  }

  let body: {
    nome?: unknown
    email?: unknown
    password?: unknown
    perfil?: unknown
    estado?: unknown
    fotos_habilitadas?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return jsonResponse(400, { error: 'Envie nome, email e senha.' })
  }

  const nome = typeof body.nome === 'string' ? body.nome.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const perfil = typeof body.perfil === 'string' ? body.perfil : 'Gerencial'
  const estado = typeof body.estado === 'string' ? body.estado : 'CE'
  const fotosHabilitadas = body.fotos_habilitadas === true
  const perfisPermitidos = ['Promotor', 'Entregador', 'Gerencial']
  const estadosPermitidos = ['CE', 'MA', 'BA', 'PA', 'PB', 'PI', 'PE', 'AP', 'SE', 'RN', 'AL']

  if (nome.length < 4) return jsonResponse(400, { error: 'Informe um nome valido.' })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonResponse(400, { error: 'Informe um e-mail valido.' })
  }
  if (password.length < 12) {
    return jsonResponse(400, { error: 'A senha deve ter pelo menos 12 caracteres.' })
  }
  if (!perfisPermitidos.includes(perfil)) {
    return jsonResponse(400, { error: 'Perfil de acesso invalido.' })
  }
  if (!estadosPermitidos.includes(estado)) {
    return jsonResponse(400, { error: 'Estado invalido.' })
  }

  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser()

  if (callerError || !caller) {
    return jsonResponse(401, { error: 'Sessao invalida. Entre novamente.' })
  }

  const { data: callerProfile, error: permissionError } = await adminClient
    .from('usuarios')
    .select('id')
    .eq('auth_user_id', caller.id)
    .eq('perfil', 'Gerencial')
    .eq('ativo', true)
    .eq('acesso_habilitado', true)
    .maybeSingle()

  if (permissionError || !callerProfile) {
    return jsonResponse(403, { error: 'Apenas Gerenciais ativos podem criar Gerenciais.' })
  }

  const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: perfil.toLowerCase() },
    user_metadata: { nome },
  })

  if (createError || !authData.user) {
    return jsonResponse(400, {
      error: createError?.message?.includes('already')
        ? 'Este e-mail ja possui uma conta de acesso.'
        : createError?.message ?? 'Nao foi possivel criar o usuario no Auth.',
    })
  }

  const { data: usuario, error: profileError } = await adminClient
    .from('usuarios')
    .upsert(
      {
        auth_user_id: authData.user.id,
        nome,
        email,
        perfil,
        estado,
        fotos_habilitadas: fotosHabilitadas,
        ativo: true,
        acesso_habilitado: true,
      },
      { onConflict: 'email' },
    )
    .select()
    .single()

  if (profileError) {
    await adminClient.auth.admin.deleteUser(authData.user.id)
    return jsonResponse(400, { error: profileError.message })
  }

  return jsonResponse(200, { usuario })
})
