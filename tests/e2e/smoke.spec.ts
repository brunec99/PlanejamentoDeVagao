import { expect, test } from '@playwright/test';

test('a tela de login abre com o acesso pelo Google', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar no Obra 360' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuar com o Google/ })).toBeVisible();
});

test('uma rota protegida sem sessão volta para o login', async ({ page }) => {
  await page.goto('/obras');
  await expect(page).toHaveURL(/\/login\?redirect=%2Fobras/);
});

test('o manifest e o ícone respondem', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect(await manifest.json()).toMatchObject({ short_name: 'Obra 360' });
  const icon = await request.get('/icon.svg');
  expect(icon.ok()).toBeTruthy();
});

test('endereço inexistente mostra a página de não encontrado', async ({ page }) => {
  const response = await page.goto('/login/nao-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: /não existe no Obra 360/ })).toBeVisible();
});
