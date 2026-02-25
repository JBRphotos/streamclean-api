import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

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
    // Use sparticuz chromium executable — built specifically for Vercel/Lambda
    const executablePath = await chromium.executablePath();

    browser = await playwrightChromium.launch({
      args: [
        ...chromium.args,
        '--disable-web-security',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
      ],
      executablePath,
      headless: true,
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    // Block heavy assets to speed things up
    await context.route('**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,otf,mp4,mp3}', route => route.abort());

    const page = await context.newPage();

    // Track every iframe URL the browser actually loads
    const iframeSrcs = [];
    page.on('frameattached', frame => {
      const src = frame.url();
      if (src && src.startsWith('http') && src !== target.href) {
        iframeSrcs.push(src);
      }
    });

    await page.goto(target.href, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });

    // Extra wait for JS-injected player iframes
    await page.waitForTimeout(3000);

    // Catch any late-loading iframes
    page.frames().forEach(f => {
      const src = f.url();
      if (src && src.startsWith('http') && src !== target.href && !iframeSrcs.includes(src)) {
        iframeSrcs.push(src);
      }
    });

    const html = await page.content();
    const finalUrl = page.url();

    await browser.close();

    return res.status(200).json({ html, iframeSrcs, finalUrl });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
