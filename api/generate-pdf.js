import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

let browserPromise;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  return browserPromise;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { html, title } = req.body;

    if (!html) {
      return res.status(400).json({ error: "HTML content is required" });
    }

    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setContent(
      `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #181818;
            line-height: 1.6;
            padding: 40px;
          }

          h1, h2, h3, h4 {
            line-height: 1.3;
            margin-top: 32px;
            margin-bottom: 16px;
          }

          p {
            margin: 0 0 16px;
          }

          img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 24px 0;
          }

          figure {
            margin: 24px 0;
          }

          figcaption {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 8px;
          }

          blockquote {
            border-left: 4px solid #181818;
            padding-left: 16px;
            margin: 24px 0;
            font-style: italic;
          }

          ul, ol {
            margin-bottom: 20px;
            padding-left: 24px;
          }

          li {
            margin-bottom: 8px;
          }

          a {
            color: #1a5cff;
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        ${html}
      </body>
      </html>
      `,
      { waitUntil: "domcontentloaded" }
    );

    // Force lazy images to load
    await page.evaluate(async () => {
      const images = Array.from(document.images);

      images.forEach((img) => {
        img.loading = "eager";
        if (img.dataset.src && !img.src) {
          img.src = img.dataset.src;
        }
      });

      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();

          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        })
      );
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "20mm",
        right: "18mm",
        bottom: "20mm",
        left: "18mm",
      },
    });

    await page.close();

    const finalBuffer = Buffer.from(pdfBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", finalBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${title || "blog-content"}.pdf"`
    );

    return res.status(200).send(finalBuffer);
  } catch (error) {
    return res.status(500).json({
      error: "PDF generation failed",
      details: error.message,
    });
  }
}
