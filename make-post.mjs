#!/usr/bin/env node
// CLI-обёртка над render.mjs
// node make-post.mjs --json '{"title":"...","bullets":["..."]}'
// echo '{...}' | node make-post.mjs
import { renderPost } from './render.mjs';

async function readInput() {
  const i = process.argv.indexOf('--json');
  if (i !== -1 && process.argv[i + 1]) return JSON.parse(process.argv[i + 1]);
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) throw new Error('нет входных данных: передай --json или подай JSON в stdin');
  return JSON.parse(raw);
}

const result = await renderPost(await readInput());
console.log(JSON.stringify(result));
