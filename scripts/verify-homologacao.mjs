import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT = 'binxgymusventbechztf'

function readEnvFile(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

const env = readEnvFile('.env.homologacao')
const url = env.VITE_SUPABASE_URL
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
const password = process.env.FSTD_TEST_PASSWORD

assert.equal(new URL(url).hostname, `${EXPECTED_PROJECT}.supabase.co`)
assert.ok(publishableKey?.startsWith('sb_publishable_'), 'Chave publicável de homologação ausente.')
assert.ok(password, 'Defina FSTD_TEST_PASSWORD somente no ambiente do processo.')

const cases = [
  {
    profile: 'Admin',
    email: 'admin@homologacao.avine.test',
    expected: { lojas: 3, nfd_itens: 4, fstd_processos: 2 },
  },
  {
    profile: 'Gerencial CE',
    email: 'gerencial.ce@homologacao.avine.test',
    expected: { lojas: 2, nfd_itens: 3, fstd_processos: 2 },
  },
  {
    profile: 'Gerencial BA',
    email: 'gerencial.ba@homologacao.avine.test',
    expected: { lojas: 1, nfd_itens: 1, fstd_processos: 0 },
  },
  {
    profile: 'Promotor CE 1',
    email: 'promotor.ce1@homologacao.avine.test',
    expected: { lojas: 2, nfd_itens: 3, fstd_processos: 2 },
  },
  {
    profile: 'Promotor CE 2',
    email: 'promotor.ce2@homologacao.avine.test',
    expected: { lojas: 1, nfd_itens: 2, fstd_processos: 0 },
  },
  {
    profile: 'Promotor inativo',
    email: 'promotor.inativo@homologacao.avine.test',
    expected: { lojas: 0, nfd_itens: 0, fstd_processos: 0 },
  },
]

function client() {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function countRows(supabase, table) {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

const anonymous = client()
const anonymousRead = await anonymous.from('lojas').select('id', { count: 'exact', head: true })
assert.ok(
  anonymousRead.error || anonymousRead.count === 0,
  'Anon não pode ler lojas.',
)

const results = []
for (const scenario of cases) {
  const supabase = client()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: scenario.email,
    password,
  })
  if (error) throw new Error(`${scenario.profile}: login falhou: ${error.message}`)
  assert.ok(data.user, `${scenario.profile}: usuário não retornado pelo Auth.`)

  const observed = {}
  for (const table of Object.keys(scenario.expected)) {
    observed[table] = await countRows(supabase, table)
  }
  assert.deepEqual(observed, scenario.expected, `${scenario.profile}: escopo RLS divergente.`)
  results.push({ profile: scenario.profile, ...observed })

  await supabase.auth.signOut({ scope: 'local' })
}

console.table(results)
console.log(`Homologação ${EXPECTED_PROJECT}: login e escopo RLS confirmados para ${cases.length} perfis.`)
