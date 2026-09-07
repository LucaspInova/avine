import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT = 'bbkrhsskluqtsnpphkfd'
const AUTH_USER_ID = '20000000-0000-4000-8000-000000000004'
const fixtures = [
  `${AUTH_USER_ID}/60000000-0000-4000-8000-000000000001/foto-teste.webp`,
  `${AUTH_USER_ID}/60000000-0000-4000-8000-000000000002/foto-avulsa.webp`,
]

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

const supabase = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
  email: 'promotor.ce1@homologacao.avine.test',
  password,
})
if (authError) throw authError
assert.equal(auth.user?.id, AUTH_USER_ID, 'A fixture só pode ser enviada pela conta sintética esperada.')

const bytes = readFileSync('src/shared/assets/avine-egg-factory.webp')
for (const path of fixtures) {
  const { error } = await supabase.storage.from('fstd-fotos').upload(path, bytes, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (error) throw new Error(`${path}: ${error.message}`)
}

await supabase.auth.signOut({ scope: 'local' })
console.log(`Fixtures de Storage carregadas: ${fixtures.length}`)
