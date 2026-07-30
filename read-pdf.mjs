// Извлечение текста из PDF: node read-pdf.mjs "<путь>" [макс_символов]
import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';

const file = process.argv[2];
const limit = Number(process.argv[3] || 4000);

const parser = new PDFParse({ data: new Uint8Array(await readFile(file)) });
const result = await parser.getText();
await parser.destroy();

console.log(`=== ${file} | стр.: ${result.pages?.length ?? '?'} ===`);
console.log(result.text.replace(/\n{3,}/g, '\n\n').slice(0, limit));
