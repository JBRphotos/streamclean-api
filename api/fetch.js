export const runtime = 'nodejs'

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

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
    const executablePath = await chromium.executablePath()

    browser = await puppeteer.launch({
      executablePath,
      headless: chromium.headless,
      args: chromium.args
    })

    const page = await browser.newPage()

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    )

    const iframeSrcs = new Set()

    page.on('frameattached', frame => {
      const src = frame.url()
      if (src && src.startsWith('http')) {
        iframeSrcs.add(src)
      }
    })

    await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })

    // Wait for scripts
    await new Promise(r => setTimeout(r, 4000))

    // Click center of screen a few times (fake play buttons)
    const { width, height } = await page.viewport()
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(width / 2, height / 2)
      await new Promise(r => setTimeout(r, 1500))
    }

    // Final iframe sweep
    const frames = page.frames()
    for (const frame of frames) {
      const src = frame.url()
      if (src && src.startsWith('http')) {
        iframeSrcs.add(src)
      }
    }

    const finalUrl = page.url()

    await browser.close()

    return res.status(200).json({
      finalUrl,
      iframeSrcs: Array.from(iframeSrcs)
    })

  } catch (err) {
    if (browser) {
      try { await browser.close() } catch {}
    }

    return res.status(500).json({ error: err.message })
  }
}
