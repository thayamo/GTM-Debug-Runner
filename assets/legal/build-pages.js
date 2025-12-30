#!/usr/bin/env node
/**
 * Convert all markdown files in assets/legal into HTML files in assets/legal/pages.
 * Dependency-free, minimal Markdown handling (headings + paragraphs).
 */
const fs = require('fs');
const path = require('path');

const LEGAL_DIR = __dirname; // assets/legal
const OUT_DIR = path.resolve(LEGAL_DIR, '../../docs');

function ensureOutDir() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const htmlLines = [];
  let para = [];

  const flushPara = () => {
    if (para.length) {
      htmlLines.push(`<p>${para.join(' ')}</p>`);
      para = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushPara();
      const level = Math.min(6, trimmed.match(/^#+/)[0].length);
      const text = trimmed.replace(/^#{1,6}\s+/, '');
      htmlLines.push(`<h${level}>${text}</h${level}>`);
    } else {
      para.push(trimmed);
    }
  }
  flushPara();
  return htmlLines.join('\n');
}

function buildFile(mdPath) {
  const name = path.basename(mdPath, '.md');
  const outPath = path.join(OUT_DIR, `${name}.html`);
  const md = fs.readFileSync(mdPath, 'utf8');
  const body = mdToHtml(md);
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; line-height: 1.6; color: #111; }
    h1, h2, h3 { color: #111; }
    a { color: #1a73e8; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`Built ${outPath}`);
}

function run() {
  ensureOutDir();
  const files = fs.readdirSync(LEGAL_DIR).filter((f) => f.endsWith('.md'));
  files.forEach((file) => buildFile(path.join(LEGAL_DIR, file)));
}

run();
