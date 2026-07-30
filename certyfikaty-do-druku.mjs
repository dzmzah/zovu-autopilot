// Собирает все сертификаты в один print-ready PDF: каждая страница = A4, картинка по центру.
// Ничего не растрируем — страницы вставляются как есть, качество исходное.
import { PDFDocument } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'D:\\My AI\\мои доки\\certificate';
const OUT = 'D:\\My AI\\мои доки\\Certyfikaty_ZAKHAR_do_druku.pdf';

// порядок: сначала Anthropic, потом OpenAI, потом n8n
const FILES = [
  'certificate-budjaj5pi2r8-1785349736.pdf', // Anthropic — Claude Code in Action
  'certificate-664min78izgs-1785353458.pdf', // Anthropic — Introduction to Claude Cowork
  'certificate-nfj62hs9hi.pdf', // OpenAI — AI Foundations
  'certificate-m5tund1jhj.pdf', // OpenAI — Applied AI Foundations
  'certificate-61baoonj79.pdf', // OpenAI — Agents and Workflows
  'n8n N8N101 Certificate _ n8n.pdf', // n8n — Essentials: Your First Workflows
];

const A4 = { w: 595.28, h: 841.89 }; // портрет, в пунктах
const MARGIN = 36; // ~1.27 см — с запасом под поля принтера

const out = await PDFDocument.create();

for (const name of FILES) {
  const src = await PDFDocument.load(await readFile(path.join(SRC, name)));
  const pages = await out.embedPdf(src, src.getPageIndices());

  for (const emb of pages) {
    const landscape = emb.width > emb.height;
    const page = out.addPage(landscape ? [A4.h, A4.w] : [A4.w, A4.h]);
    const availW = page.getWidth() - MARGIN * 2;
    const availH = page.getHeight() - MARGIN * 2;
    const scale = Math.min(availW / emb.width, availH / emb.height);
    const w = emb.width * scale;
    const h = emb.height * scale;
    page.drawPage(emb, {
      x: (page.getWidth() - w) / 2,
      y: (page.getHeight() - h) / 2,
      width: w,
      height: h,
    });
    console.log(
      `${name} → ${landscape ? 'A4 poziomo' : 'A4 pionowo'} (${Math.round(w)}x${Math.round(h)} pt)`
    );
  }
}

await writeFile(OUT, await out.save());
console.log(`\nГотово: ${OUT}\nСтраниц: ${out.getPageCount()}`);
