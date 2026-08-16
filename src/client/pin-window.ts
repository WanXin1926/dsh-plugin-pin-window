/**
 * Display-only pin window: builds a self-contained HTML document for one
 * finalized assistant message and opens it in a separate popup window.
 * No framework, no controls, no storage — just the selected message.
 * @module dsh-plugin-pin-window/client/pin-window
 */

import type { AssistantBlock, AssistantMessageNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { MessagePinKey } from './locales.ts'

/** Dictionary access shape: only the keys this module needs. */
export interface PinWindowText {
  (key: MessagePinKey): string
}

/** Escape text for safe HTML insertion. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Permit only safe link targets for anchor href / image src. */
function safeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url)
}

/** Very small markdown renderer for the popup; output is always escaped first. */
function renderInline(raw: string): string {
  const codeSpans: string[] = []
  let s = escapeHtml(raw)

  // Inline code first, parked in placeholders so later rules ignore it.
  s = s.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`)
    return `\u0000${codeSpans.length - 1}\u0000`
  })

  // Images and links; unsafe protocols degrade to plain text.
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, url: string) =>
    safeUrl(url) ? `<img src="${url}" alt="${alt}" loading="lazy" />` : alt)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, url: string) =>
    safeUrl(url) ? `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>` : label)

  // Emphasis.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')

  // Restore code spans.
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => codeSpans[Number(index)] ?? '')
  return s
}

/** Whether the line starts a block construct that terminates a paragraph. */
function isBlockStart(line: string): boolean {
  return /^```/.test(line)
    || /^#{1,6}\s+/.test(line)
    || /^\s*>\s?/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+[.)]\s+/.test(line)
    || /^\s*$/.test(line)
}

function isUlMarker(line: string): boolean {
  return /^\s*[-*+]\s+/.test(line)
}

function isOlMarker(line: string): boolean {
  return /^\s*\d+[.)]\s+/.test(line)
}

function isBlank(line: string): boolean {
  return line.trim() === ''
}

/** One list marker, removed from the item text. */
function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
}

/**
 * Collect one loose list: consecutive marker lines, allowing blank lines
 * between items as long as the next non-blank line is still the same marker
 * kind. A single <ol>/<ul> then numbers/bullets the whole list correctly.
 */
function collectList(lines: string[], start: number, markerTest: (line: string) => boolean): { items: string[]; next: number } {
  const items: string[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (markerTest(line)) {
      items.push(stripListMarker(line))
      i += 1
      continue
    }
    if (isBlank(line) && i + 1 < lines.length && markerTest(lines[i + 1] ?? '')) {
      i += 1
      continue
    }
    break
  }
  return { items, next: i }
}

/** Render a block sequence for one text body. */
export function renderMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    // Fenced code block.
    const fence = /^```([^`]*)$/.exec(line)
    if (fence !== null) {
      const language = (fence[1] ?? '').trim()
      i += 1
      const code: string[] = []
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        code.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1 // closing fence
      const langAttr = language.length > 0 ? ` data-lang="${escapeHtml(language)}"` : ''
      out.push(`<pre class="code"><code${langAttr}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // ATX heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      const level = heading[1]?.length ?? 0
      out.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`)
      i += 1
      continue
    }

    // Blockquote: gather consecutive quote lines (blank lines between them
    // stay inside the quote) and render the inner content recursively.
    if (/^\s*>\s?/.test(line)) {
      const inner: string[] = []
      out.push('<blockquote>')
      while (i < lines.length) {
        const quoteLine = lines[i] ?? ''
        if (/^\s*>\s?/.test(quoteLine)) {
          inner.push(quoteLine.replace(/^\s*>\s?/, ''))
          i += 1
        } else if (isBlank(quoteLine) && i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1] ?? '')) {
          inner.push('')
          i += 1
        } else {
          break
        }
      }
      out.push(renderMarkdown(inner.join('\n')))
      out.push('</blockquote>')
      continue
    }

    // Unordered list.
    if (isUlMarker(line)) {
      const { items, next } = collectList(lines, i, isUlMarker)
      i = next
      out.push('<ul>')
      for (const item of items) out.push(`<li>${renderInline(item)}</li>`)
      out.push('</ul>')
      continue
    }

    // Ordered list.
    if (isOlMarker(line)) {
      const { items, next } = collectList(lines, i, isOlMarker)
      i = next
      out.push('<ol>')
      for (const item of items) out.push(`<li>${renderInline(item)}</li>`)
      out.push('</ol>')
      continue
    }

    // Blank line.
    if (isBlank(line)) {
      i += 1
      continue
    }

    // Paragraph: collect until a blank line or the next block construct.
    const paragraph: string[] = []
    while (i < lines.length && !isBlockStart(lines[i] ?? '')) {
      paragraph.push(lines[i] ?? '')
      i += 1
    }
    out.push(`<p>${renderInline(paragraph.join('<br>'))}</p>`)
  }

  // Join without whitespace so the emitted block structure stays compact like
  // the harness's own renderer — whitespace text nodes between block elements
  // are only formatting noise, never content.
  return out.join('')
}

/** Render one assistant content block. */
function renderBlock(block: AssistantBlock, t: PinWindowText): string {
  switch (block.kind) {
    case 'text':
      return `<section class="block text">${renderMarkdown(block.text)}</section>`
    case 'reasoning':
      return `<details class="block reasoning"><summary>${escapeHtml(t('window.reasoning'))}</summary><div class="reasoning-body">${renderMarkdown(block.text)}</div></details>`
    case 'tool-call':
      return `<section class="block tool"><div class="tool-name">${escapeHtml(t('window.toolCall'))} · ${escapeHtml(block.name)}</div><pre class="tool-args">${escapeHtml(block.argsRaw)}</pre></section>`
    case 'image':
      return `<section class="block image">${escapeHtml(t('window.image'))}</section>`
    case 'other':
      return `<section class="block other"><pre>${escapeHtml(JSON.stringify(block.block, null, 2))}</pre></section>`
  }
}

/** The popup document stylesheet (theme follows the opener). */
const POPUP_CSS = `
:root {
  --pin-bg: #ffffff;
  --pin-fg: #1f2329;
  --pin-muted: #6b7280;
  --pin-border: #e5e7eb;
  --pin-code-bg: #f6f7f9;
  --pin-link: #2563eb;
}
:root[data-dark="true"] {
  --pin-bg: #17181a;
  --pin-fg: #e6e6e6;
  --pin-muted: #9ca3af;
  --pin-border: #2a2c30;
  --pin-code-bg: #202225;
  --pin-link: #7aa2f7;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--pin-bg);
  color: var(--pin-fg);
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
}
main { max-width: 860px; margin: 0 auto; padding: 28px 24px 48px; }
header {
  border-bottom: 1px solid var(--pin-border);
  padding-bottom: 14px;
  margin-bottom: 20px;
}
h1 { font-size: 18px; margin: 0 0 8px; }
.meta { color: var(--pin-muted); font-size: 13px; display: flex; gap: 16px; flex-wrap: wrap; }
.meta span { white-space: nowrap; }
.block { margin: 0 0 18px; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 10px; padding-left: 22px; }
ul { list-style-type: disc; }
ol { list-style-type: decimal; }
blockquote {
  margin: 0 0 10px;
  padding: 4px 14px;
  border-left: 3px solid var(--pin-border);
}
a { color: var(--pin-link); }
code {
  font-family: "Cascadia Code", Consolas, "Courier New", monospace;
  font-size: 13px;
  background: var(--pin-code-bg);
  border: 1px solid var(--pin-border);
  border-radius: 4px;
  padding: 1px 5px;
}
pre.code {
  background: var(--pin-code-bg);
  border: 1px solid var(--pin-border);
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
}
pre.code code { background: none; border: none; padding: 0; white-space: pre-wrap; word-break: break-word; }
code[data-lang]::before {
  content: attr(data-lang);
  display: block;
  color: var(--pin-muted);
  font-size: 11px;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.reasoning summary { cursor: pointer; color: var(--pin-muted); font-size: 13px; }
.reasoning-body { border-left: 2px solid var(--pin-border); margin: 8px 0 0; padding-left: 12px; }
.tool-name { color: var(--pin-muted); font-size: 13px; margin-bottom: 6px; }
.tool-args {
  margin: 0;
  padding: 10px 12px;
  background: var(--pin-code-bg);
  border: 1px solid var(--pin-border);
  border-radius: 8px;
  font: 12px/1.5 "Cascadia Code", Consolas, "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.image { color: var(--pin-muted); font-style: italic; }
.empty { color: var(--pin-muted); }
`

/** Build the full popup document for one assistant message. */
function buildDocument(node: AssistantMessageNode, t: PinWindowText): string {
  const dark = typeof document !== 'undefined' && document.body.hasAttribute('data-ds-dark-theme')
  const title = t('window.title')
  const model = node.provenance === undefined
    ? '—'
    : `${node.provenance.provider} / ${node.provenance.model}`
  const time = node.time > 0 ? new Date(node.time).toLocaleString() : '—'

  const body = node.blocks.length === 0
    ? `<p class="empty">${escapeHtml(t('window.empty'))}</p>`
    : node.blocks.map(block => renderBlock(block, t)).join('')

  return `<!doctype html>
<html lang="zh-CN" data-dark="${dark ? 'true' : 'false'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${POPUP_CSS}</style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        <span>${escapeHtml(t('window.assistant'))}</span>
        <span>${escapeHtml(t('window.model'))}: ${escapeHtml(model)}</span>
        <span>${escapeHtml(t('window.time'))}: ${escapeHtml(time)}</span>
      </div>
    </header>
    ${body}
  </main>
</body>
</html>`
}

/**
 * Open the display-only pin window for a selected assistant message.
 * @param node - the finalized assistant message to show.
 * @param t - dictionary access (namespace `pin`).
 */
export function openPinWindow(node: AssistantMessageNode, t: PinWindowText): void {
  const html = buildDocument(node, t)
  const win = window.open('', '_blank', 'width=760,height=900,menubar=no,toolbar=no,location=no,status=no')
  if (win === null) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  try {
    win.opener = null
  } catch {
    // Cross-origin/security edge case; the window still works without this.
  }
  win.focus()
}
