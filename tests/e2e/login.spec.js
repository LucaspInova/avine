import { expect, test } from '@playwright/test'

test('login não exibe métricas ou status fictícios', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /FSTD DIGITAL/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  await expect(page.getByText('11:12')).toHaveCount(0)
  await expect(page.getByText('R$ 1.491.439,77')).toHaveCount(0)
})

test('recuperação de senha está acessível pelo login', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Esqueceu sua senha?' }).click()

  await expect(
    page.getByRole('heading', { name: 'Esqueceu sua senha?' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Enviar link de recuperação' }),
  ).toBeVisible()
})
