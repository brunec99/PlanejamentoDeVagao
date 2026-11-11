import { expect, test } from '@playwright/test';

test('a tela de login abre com o acesso pelo Google', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Entrar no Obra 360' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuar com o Google/ })).toBeVisible();
});

test('o botão do Google é um formulário comum, e o início do login manda para o Supabase', async ({ page, request }) => {
  await page.goto('/login?redirect=%2Fobras%2Fabc');
  const form = page.locator('form', { has: page.getByRole('button', { name: /Continuar com o Google/ }) });
  await expect(form).toHaveAttribute('action', '/login/google');
  await expect(form).toHaveAttribute('method', 'get');
  const response = await request.get('/login/google?redirect=%2Fobras%2Fabc', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const location = new URL(response.headers()['location']);
  expect(location.pathname).toBe('/auth/v1/authorize');
  expect(location.searchParams.get('provider')).toBe('google');
  // A volta do Google usa o endereço pelo qual o navegador chegou, não o endereço interno do servidor.
  expect(location.searchParams.get('redirect_to')).toBe('http://127.0.0.1:3100/auth/callback?redirect=%2Fobras%2Fabc');
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
