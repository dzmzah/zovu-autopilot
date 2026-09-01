// HTML → PDF под печать: точный формат, фон печатается, поля нулевые.
//
// Вылет задаётся размером страницы (обрезной формат + 3 мм с каждой стороны),
// а не «полями» — типография режет по линии внутри, и фон обязан заходить за неё.
//
//   node orchard-pdf.mjs <html> <plik.pdf> [szer_mm] [wys_mm]
import { chromium } from 'playwright';
import path from 'node:path';

const [html, wyjscie, szer = '111', wys = '154'] = process.argv.slice(2);
if (!html || !wyjscie) throw new Error('node orchard-pdf.mjs <html> <plik.pdf> [szer_mm] [wys_mm]');

const p = await chromium.launch();
const s = await p.newPage();
await s.goto('file:///' + path.resolve(html).replace(/\\/g, '/'));
await s.evaluate(() => document.fonts.ready);
await s.waitForTimeout(600);
await s.pdf({
  path: path.resolve(wyjscie),
  width: `${szer}mm`,
  height: `${wys}mm`,
  printBackground: true,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  preferCSSPageSize: true,
});
await p.close();
console.log('[orchard] ' + wyjscie);
