import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const root = process.cwd();
const mdPath = path.join(root, 'docs/softcopyright/软件设计说明书.md');
const htmlPath = path.join(root, 'docs/softcopyright/软件设计说明书.html');
const pdfPath = path.join(root, 'docs/softcopyright/软件设计说明书.pdf');
const exportDir = '/home/xuelin/softcopyright-export';
const exportScreenshotsDir = path.join(exportDir, 'screenshots');
const exportCleanScreenshotsDir = path.join(exportDir, 'screenshots_clean');
const exportDiagramsDir = path.join(exportDir, 'diagrams');
const exportHtmlPath = path.join(exportDir, 'index.html');
const tempPdfPath = '/home/xuelin/software-design-document.tmp.pdf';

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function parseTable(lines, start) {
  const rows = [];
  let index = start;
  while (index < lines.length && /^\|.*\|$/.test(lines[index].trim())) {
    rows.push(lines[index].trim());
    index += 1;
  }
  const headers = rows[0].split('|').slice(1, -1).map((cell) => inline(cell.trim()));
  const bodyRows = rows.slice(2).map((row) => row.split('|').slice(1, -1).map((cell) => inline(cell.trim())));
  const html = [
    '<table>',
    '<thead><tr>',
    ...headers.map((header) => `<th>${header}</th>`),
    '</tr></thead>',
    '<tbody>',
    ...bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`),
    '</tbody>',
    '</table>'
  ].join('');
  return { html, index };
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let inHtml = false;

  function flushParagraph() {
    if (!paragraph.length) return;
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    if (line.startsWith('<div') || line.startsWith('<figure')) {
      flushParagraph();
      inHtml = true;
      out.push(raw);
      if (line.includes('</div>') || line.includes('</figure>')) inHtml = false;
      continue;
    }
    if (inHtml) {
      out.push(raw);
      if (line.includes('</div>') || line.includes('</figure>')) inHtml = false;
      continue;
    }
    if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|[-:| ]+\|$/.test(lines[i + 1].trim())) {
      flushParagraph();
      const table = parseTable(lines, i);
      out.push(table.html);
      i = table.index - 1;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      continue;
    }
    paragraph.push(raw);
  }
  flushParagraph();
  return out.join('\n');
}

const markdown = fs.readFileSync(mdPath, 'utf8');
const body = renderMarkdown(markdown);
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>软件设计说明书</title>
  <style>
    @page { size: A4; margin: 22mm 15mm 14mm; }
    body { font-family: "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif; color: #111827; line-height: 1.72; font-size: 13px; }
    .header { position: fixed; top: -15mm; left: 0; right: 0; height: 10mm; font-size: 11px; color: #374151; border-bottom: 1px solid #d1d5db; }
    .footer { position: fixed; bottom: calc(-14mm + 10px); left: 0; right: 0; height: 8mm; text-align: center; font-size: 10px; color: #6b7280; }
    .footer::after { content: counter(page); }
    h1 { text-align: center; font-size: 23px; margin: 0 0 18px; }
    h2 { font-size: 18px; margin: 24px 0 10px; border-bottom: 1px solid #9ca3af; padding-bottom: 4px; page-break-after: avoid; }
    h3 { font-size: 15px; margin: 18px 0 8px; page-break-after: avoid; }
    p { margin: 7px 0; text-align: justify; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 11.5px; }
    th { border-top: 1.5px solid #111827; border-bottom: 1px solid #111827; padding: 6px 5px; text-align: left; }
    td { border-bottom: 1px solid #d1d5db; padding: 6px 5px; vertical-align: top; }
    tr:last-child td { border-bottom: 1.5px solid #111827; }
    code { font-family: Consolas, monospace; background: #f3f4f6; padding: 1px 3px; border-radius: 3px; }
    figure { margin: 10px 0 16px; page-break-inside: avoid; text-align: center; }
    figure img { max-width: 100%; height: auto; border: 1px solid #d1d5db; }
    figcaption { margin-top: 5px; font-weight: 600; text-align: center; }
    .wide img { width: 100%; }
    .diagram img { max-height: 205mm; width: auto; max-width: 100%; }
    .screenshot { break-before: page; page-break-before: always; page-break-inside: avoid; break-inside: avoid; margin: 8px 0 12px; text-align: center; }
    h3 + .screenshot { break-before: auto; page-break-before: auto; }
    .screenshot img { max-width: 100%; max-height: 178mm; object-fit: contain; border: 1px solid #d1d5db; }
    .screenshot.h5 img { max-height: 176mm; width: auto; }
    .screenshot.admin img { width: 100%; height: auto; }
    .page-break { break-before: page; page-break-before: always; }
  </style>
</head>
<body>
  <div class="header">面向越南留学生的铁道专业汉越术语翻译学习软件 V1.0</div>
  <div class="footer"></div>
  ${body}
</body>
</html>`;

fs.writeFileSync(htmlPath, html, 'utf8');
fs.rmSync(exportDir, { recursive: true, force: true });
fs.mkdirSync(exportScreenshotsDir, { recursive: true });
fs.mkdirSync(exportCleanScreenshotsDir, { recursive: true });
fs.mkdirSync(exportDiagramsDir, { recursive: true });
for (const file of fs.readdirSync(path.join(root, 'docs/assets/screenshots'))) {
  if (file.endsWith('.png')) {
    fs.copyFileSync(path.join(root, 'docs/assets/screenshots', file), path.join(exportScreenshotsDir, file));
  }
}
for (const file of fs.readdirSync(path.join(root, 'docs/assets/screenshots_clean'))) {
  if (file.endsWith('.png')) {
    fs.copyFileSync(path.join(root, 'docs/assets/screenshots_clean', file), path.join(exportCleanScreenshotsDir, file));
  }
}
for (const file of fs.readdirSync(path.join(root, 'docs/assets/diagrams'))) {
  if (file.endsWith('.svg') || file.endsWith('.png')) {
    fs.copyFileSync(path.join(root, 'docs/assets/diagrams', file), path.join(exportDiagramsDir, file));
  }
}
fs.writeFileSync(
  exportHtmlPath,
  html
    .replaceAll('../assets/screenshots_clean/', 'screenshots_clean/')
    .replaceAll('../assets/screenshots/', 'screenshots/')
    .replaceAll('../assets/diagrams/', 'diagrams/'),
  'utf8'
);
execFileSync('/snap/bin/chromium', [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf=${tempPdfPath}`,
  `file://${exportHtmlPath}`
], { stdio: 'inherit' });

fs.copyFileSync(tempPdfPath, pdfPath);
fs.unlinkSync(tempPdfPath);

console.log(`Wrote ${htmlPath}`);
console.log(`Wrote ${pdfPath}`);
