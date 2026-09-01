// Рендер макетов New Orchard: HTML → PNG точного размера.
//
// Почему браузером, а не графическим редактором: макет описан кодом, значит
// правка «сдвинь на 20 px» стоит секунды и повторяется одинаково для ленты,
// сторис и кадров видео. Шрифт Outfit тянется из Google Fonts — он же указан
// в брендбуке.
//
//   node orchard-render.mjs <html> <selektor> <plik.png>
import { chromium } from 'playwright';
import path from 'node:path';

const [html, selektor, wyjscie] = process.argv.slice(2);
if (!html || !selektor || !wyjscie) throw new Error('node orchard-render.mjs <html> <#selektor> <plik.png>');

const przegladarka = await chromium.launch();
const strona = await przegladarka.newPage({ viewport: { width: 1200, height: 2000 }, deviceScaleFactor: 1 });
await strona.goto('file:///' + path.resolve(html).replace(/\\/g, '/'));
// Шрифты обязаны догрузиться до снимка, иначе текст встанет системным и
// вся типографика поедет — это видно только на готовом файле.
await strona.evaluate(() => document.fonts.ready);
await strona.waitForTimeout(600);
const el = await strona.$(selektor);
if (!el) throw new Error('нет элемента ' + selektor);
await el.screenshot({ path: path.resolve(wyjscie) });
await przegladarka.close();
console.log('[orchard] ' + wyjscie);
