import { expect, test } from '@playwright/test'
import process from 'node:process'

const credentials = {
  Promotor: [process.env.E2E_PROMOTOR_EMAIL, process.env.E2E_PROMOTOR_PASSWORD],
  Gerencial: [process.env.E2E_GERENCIAL_EMAIL, process.env.E2E_GERENCIAL_PASSWORD],
  Admin: [process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD],
}

async function login(page, profile) {
  const [email, password] = credentials[profile]
  test.skip(!email || !password, `Defina credenciais E2E de ${profile} para executar contra o ambiente de teste.`)
  await page.goto('/')
  await page.getByLabel(/e-mail/i).fill(email)
  await page.getByLabel(/senha/i).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText(profile, { exact: true }).first()).toBeVisible()
}

for (const profile of ['Promotor', 'Gerencial', 'Admin']) {
  test(`login por perfil: ${profile}`, async ({ page }) => login(page, profile))
}

test('Promotor finaliza uma FSTD', async ({ page }) => {
  await login(page, 'Promotor')
  test.skip(!process.env.E2E_PROMOTOR_NFD, 'Defina E2E_PROMOTOR_NFD com uma nota descartável.')
  await page.getByPlaceholder(/buscar.*NFD/i).fill(process.env.E2E_PROMOTOR_NFD)
  await page.getByText(process.env.E2E_PROMOTOR_NFD, { exact: false }).first().click()
  await expect(page.getByText(/FSTD finalizada|Finalizada/i)).toBeVisible()
})

test('Gerencial preenche FSTD dentro de sua UF', async ({ page }) => {
  await login(page, 'Gerencial')
  test.skip(!process.env.E2E_GERENCIAL_NFD, 'Defina E2E_GERENCIAL_NFD com uma nota da UF autorizada.')
  await page.getByPlaceholder(/buscar.*NFD/i).fill(process.env.E2E_GERENCIAL_NFD)
  await page.getByText(process.env.E2E_GERENCIAL_NFD, { exact: false }).first().click()
  await expect(page.getByText(/Preencher NFD/i)).toBeVisible()
})

test('Admin executa rotina restrita', async ({ page }) => {
  await login(page, 'Admin')
  test.skip(!process.env.E2E_ADMIN_ROUTINE, 'Defina E2E_ADMIN_ROUTINE com o nome da rotina segura no ambiente de teste.')
  await page.getByRole('button', { name: process.env.E2E_ADMIN_ROUTINE }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})
