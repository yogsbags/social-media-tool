const { test, expect } = require('@playwright/test');

test('stage 2 modal renders blog article with structure', async ({ page }) => {
  test.setTimeout(420000);
  await page.goto('http://127.0.0.1:3007', { waitUntil: 'networkidle', timeout: 120000 });

  const campaignSelect = page.locator('select').first();
  await campaignSelect.selectOption('blog');
  await page.locator('input[placeholder*="e.g."]').first().fill('AI Action Summit 2026 key takeaways');

  const stage1Card = page.locator('div.rounded-lg.border-2').filter({ hasText: 'Stage 1: Campaign Planning' }).first();
  await stage1Card.getByRole('button', { name: /Execute Stage|Re-run Stage/i }).click();
  await expect(stage1Card.getByRole('button', { name: /View & Edit Data/i })).toBeVisible({ timeout: 180000 });

  const stage2Card = page.locator('div.rounded-lg.border-2').filter({ hasText: 'Stage 2: Content Generation' }).first();
  await stage2Card.getByRole('button', { name: /Approve & Continue|Re-run Stage/i }).click();
  await expect(stage2Card.getByRole('button', { name: /View & Edit Data/i })).toBeVisible({ timeout: 360000 });

  await stage2Card.getByRole('button', { name: /View & Edit Data/i }).click();
  await expect(page.getByText('Article Preview')).toBeVisible({ timeout: 60000 });

  const metrics = await page.evaluate(() => {
    const previewBanner = Array.from(document.querySelectorAll('div')).find(el => el.textContent?.trim() === 'Article Preview');
    const container = previewBanner?.parentElement?.nextElementSibling || document.body;
    return {
      h1: container.querySelectorAll('h1').length,
      h2: container.querySelectorAll('h2').length,
      p: container.querySelectorAll('p').length,
      ul: container.querySelectorAll('ul').length,
      ol: container.querySelectorAll('ol').length,
      textSample: (container.textContent || '').slice(0, 1600)
    };
  });

  console.log('MODAL_METRICS=' + JSON.stringify(metrics));
  await page.screenshot({ path: '/tmp/stage2-modal-check.png', fullPage: true });

  expect(metrics.h1).toBeGreaterThan(0);
  expect(metrics.p).toBeGreaterThan(3);
});
