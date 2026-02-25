import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

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
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      executablePath,
      headless: chromium.headless,
      args: chromium.args,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    const iframeSrcs = new Set();

    page.on('frameattached', frame => {
      const src = frame.url();
      if (src && src.startsWith('http')) iframeSrcs.add(src);
    });

    await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });

    // Wait for JS-injected player iframes
    await new Promise(r => setTimeout(r, 4000));

    // Simulate clicks to trigger lazy-loaded players
    const viewport = page.viewport();
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(viewport.width / 2, viewport.height / 2);
      await new Promise(r => setTimeout(r, 1000));
    }

    // Final sweep of all frames
    page.frames().forEach(frame => {
      const src = frame.url();
      if (src && src.startsWith('http')) iframeSrcs.add(src);
    });

    const html = await page.content();
    const finalUrl = page.url();

    await browser.close();

    return res.status(200).json({
      html,
      iframeSrcs: Array.from(iframeSrcs),
      finalUrl,
    });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
