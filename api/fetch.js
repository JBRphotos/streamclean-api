import { chromium } from 'playwright-core';
import chromiumPkg from '@sparticuz/chromium';

// Vercel serverless function
// GET /api/fetch?url=https://crackstreams.ms/stream/philadelphia
// Returns JSON: { html: "...", url: "..." }

export const config = {
  maxDuration: 30, // seconds — Vercel hobby allows up to 60s
};

export default async function handler(req, res) {
  // CORS — allow your GitHub Pages domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Validate it's a real URL
  let target;
  try {
    target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) {
      return res.status(400).json({ error: 'Invalid URL protocol' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  let browser;
  try {
    browser = await chromium.launch({
      args: chromiumPkg.args,
      executablePath: await chromiumPkg.executablePath(),
      headless: chromiumPkg.headless,
    });

    const context = await browser.newContext({
      // Spoof a real mobile Safari — less likely to get Cloudflare-blocked
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      // Block images/fonts/css to speed up load — we only need DOM + scripts
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Block heavy assets we don't need
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf}', route => route.abort());

    const page = await context.newPage();

    // Intercept and log all iframe srcs as they load
    const iframeSrcs = [];
    page.on('frameattached', frame => {
      const src = frame.url();
      if (src && src.startsWith('http') && src !== target.href) {
        iframeSrcs.push(src);
      }
    });

    // Navigate and wait for network to settle
    await page.goto(target.href, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    // Extra wait for lazy-loaded player iframes
    await page.waitForTimeout(3000);

    // Collect any iframes that loaded after navigation
    const frames = page.frames();
    frames.forEach(f => {
      const src = f.url();
      if (src && src.startsWith('http') && src !== target.href && !iframeSrcs.includes(src)) {
        iframeSrcs.push(src);
      }
    });

    // Get the fully rendered HTML
    const html = await page.content();

    await browser.close();

    return res.status(200).json({
      html,
      iframeSrcs, // bonus: list of all iframe URLs that actually loaded
      finalUrl: page.url(),
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('Playwright error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
