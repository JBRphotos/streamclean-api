export const runtime = 'nodejs'

import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { url } = req.query
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' })
  }

  let target
  try {
    target = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  let browser

  try {
    chromium.setHeadlessMode = true
    chromium.setGraphicsMode = false

    const executablePath = await chromium.executablePath()

    browser = await playwright.chromium.launch({
      executablePath,
      headless: true,
      args: chromium.args
    })

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 }
    })

    const page = await context.newPage()

    const iframeSrcs = new Set()

    page.on('frameattached', frame => {
      const src = frame.url()
      if (src && src.startsWith('http')) {
        iframeSrcs.add(src)
      }
    })

    await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    })

    // Wait for scripts
    await page.waitForTimeout(4000)

    // Simulate human clicks (unlocks fake play buttons)
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(683, 384)
      await page.waitForTimeout(1500)
    }

    // Final iframe sweep
    page.frames().forEach(frame => {
      const src = frame.url()
      if (src && src.startsWith('http')) {
        iframeSrcs.add(src)
      }
    })

    const finalUrl = page.url()

    await browser.close()

    return res.status(200).json({
      finalUrl,
      iframeSrcs: Array.from(iframeSrcs)
    })

  } catch (err) {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }

    return res.status(500).json({
      error: err.message
    })
  }
}
