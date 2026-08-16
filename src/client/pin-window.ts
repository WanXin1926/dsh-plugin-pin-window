/**
 * Display-only pin window: builds a self-contained HTML document for one
 * finalized assistant message turn and opens it in a separate popup window.
 * The window loads the harness's own stylesheets (for theme tokens and fonts)
 * and then renders the same turn content the chat card shows — every
 * assistant step (text/reasoning/images) and every tool call with its result.
 * No framework, no controls, no storage — just the selected message turn.
 * @module dsh-plugin-pin-window/client/pin-window
 */

import type {
  AssistantBlock, ToolCallBlock, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { MessagePinKey } from './locales.ts'

/** Dictionary access shape: only the keys this module needs. */
export interface PinWindowText {
  (key: MessagePinKey): string
}

/** One assistant step of the pinned turn. */
export interface PinAssistantItem {
  kind: 'assistant'
  blocks: readonly AssistantBlock[]
}

/** One tool call root (running or settled) of the pinned turn. */
export interface PinToolItem {
  kind: 'tool'
  root: ToolCallBlock
}

export type PinTurnItem = PinAssistantItem | PinToolItem

/** Everything the popup needs to render one pinned turn. */
export interface PinTurnView {
  turn: number
  model: string
  time: number
  items: readonly PinTurnItem[]
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

/** Render a markdown block sequence for one text body. */
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
      out.push(`<pre class="pin-code-block"><code${langAttr}>${escapeHtml(code.join('\n'))}</code></pre>`)
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

/** Wrap rendered markdown in the class the popup stylesheet targets. */
function markdownSection(text: string): string {
  return `<div class="pin-markdown">${renderMarkdown(text)}</div>`
}

/** First line of reasoning text, mirroring ReasoningRow's collapsed summary. */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Render one assistant content block. */
function renderBlock(block: AssistantBlock, t: PinWindowText): string {
  switch (block.kind) {
    case 'text':
      return markdownSection(block.text)
    case 'reasoning':
      return `<details class="pin-reasoning"><summary class="pin-reasoning-summary"><span class="pin-reasoning-title">${escapeHtml(t('window.reasoning'))}</span><span class="pin-reasoning-sep" aria-hidden="true"></span><span class="pin-reasoning-text">${escapeHtml(firstLine(block.text))}</span></summary><div class="pin-reasoning-body">${escapeHtml(block.text)}</div></details>`
    case 'tool-call':
      return `<details class="pin-tool"><summary class="pin-tool-summary"><span class="pin-tool-title">${escapeHtml(t('window.toolCall'))} · ${escapeHtml(block.name)}</span></summary><pre class="pin-tool-args">${escapeHtml(block.argsRaw)}</pre></details>`
    case 'image':
      return `<div class="pin-image">${escapeHtml(t('window.image'))}</div>`
    case 'other':
      return `<details class="pin-other"><summary class="pin-other-summary">${escapeHtml(t('window.other'))}</summary><pre>${escapeHtml(JSON.stringify(block.block, null, 2))}</pre></details>`
  }
}

/** Render one assistant step's visible blocks (tool-call heads are tool rows). */
function renderAssistantItem(blocks: readonly AssistantBlock[], t: PinWindowText): string {
  return blocks
    .filter(block => block.kind !== 'tool-call')
    .map(block => renderBlock(block, t))
    .join('')
}

/** Extract readable text from a tool result's content blocks. */
function toolContentText(content: readonly unknown[]): string {
  return content.map((block) => {
    if (typeof block !== 'object' || block === null) return JSON.stringify(block)
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') return record.text
    return JSON.stringify(block)
  }).join('\n')
}

/** Render one tool call root: collapsible call head + args + result. */
function renderToolRoot(root: ToolCallBlock, t: PinWindowText): string {
  if ('kind' in root && root.kind === 'tool-result') {
    const settled = root as ToolResultNode
    const name = settled.call?.name ?? settled.callId
    const args = settled.call?.argsRaw ?? ''
    const content = toolContentText(settled.content)
    const errorClass = settled.isError ? ' error' : ''
    const errorLine = settled.isError && settled.error !== undefined
      ? `<div class="pin-tool-error">${escapeHtml(`${settled.error.name}: ${settled.error.code}`)}</div>`
      : ''
    return `<details class="pin-tool"><summary class="pin-tool-summary${errorClass}"><span class="pin-tool-title">${escapeHtml(t('window.toolCall'))} · ${escapeHtml(name)}</span></summary>${args.length > 0 ? `<pre class="pin-tool-args">${escapeHtml(args)}</pre>` : ''}${content.length > 0 ? `<pre class="pin-tool-result${errorClass}">${escapeHtml(content)}</pre>` : ''}${errorLine}</details>`
  }
  const running = root as { name: string; argsRaw: string }
  return `<details class="pin-tool running"><summary class="pin-tool-summary"><span class="pin-tool-title">${escapeHtml(t('window.toolCall'))} · ${escapeHtml(running.name)}</span></summary><pre class="pin-tool-args">${escapeHtml(running.argsRaw)}</pre></details>`
}

/** The popup's own layout, reusing the harness theme tokens from the linked stylesheets. */
const POPUP_CSS = `
body {
  margin: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-markdown-base);
}
main { max-width: 860px; margin: 0 auto; padding: 28px 24px 48px; }
header {
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding-bottom: 14px;
  margin-bottom: 20px;
}
h1 { font: var(--dsw-font-markdown-h1); margin: 0 0 8px; }
.meta { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xs-13); display: flex; gap: 16px; flex-wrap: wrap; }
.meta span { white-space: nowrap; }

/* Markdown body, mirroring MarkdownText.module.css */
.pin-markdown { min-width: 0; overflow-wrap: anywhere; font: var(--dsw-font-markdown-base); color: var(--dsw-alias-label-primary); }
.pin-markdown strong { font-weight: 600; }
.pin-markdown h1 { font: var(--dsw-font-markdown-h1); margin: 32px 0 16px; }
.pin-markdown h2 { font: var(--dsw-font-markdown-h2); margin: 32px 0 16px; }
.pin-markdown h3 { font: var(--dsw-font-markdown-h3); margin: 32px 0 16px; }
.pin-markdown h4 { font: var(--dsw-font-markdown-h4); margin: 16px 0; }
.pin-markdown :where(h5, h6) { font: var(--dsw-font-markdown-base-strong); margin: 16px 0; }
.pin-markdown :where(h1, h2, h3, h4, h5, h6) strong { font-weight: inherit; }
.pin-markdown p { margin: 16px 0; }
.pin-markdown :where(h4, h5, h6) + :where(ul, ol) { margin-top: 8px; }
.pin-markdown :where(h4, h5, h6):has(+ :where(ul, ol)) { margin-bottom: 8px; }
.pin-markdown a {
  color: var(--dsw-alias-state-business-primary);
  text-decoration: none;
  border-left: 3px solid rgb(255 255 255 / 0);
  border-right: 3px solid rgb(255 255 255 / 0);
  border-top: 2px solid rgb(255 255 255 / 0);
  border-bottom: 2px solid rgb(255 255 255 / 0);
  margin-left: -3px;
  margin-right: -3px;
}
.pin-markdown a:hover, .pin-markdown a:focus {
  outline: none;
  text-decoration: underline var(--dsw-alias-state-business-primary);
}
.pin-markdown :where(ul, ol) { margin: 16px 0; padding-left: 18px; }
.pin-markdown li:not(:first-child) { margin-top: 6px; }
.pin-markdown li > :where(ul, ol) { margin-top: 4px; }
.pin-markdown li::marker { line-height: 28px; color: var(--dsw-alias-label-secondary); }
.pin-markdown :where(ul, ol) ol { list-style-position: inside; padding-left: 0; }
.pin-markdown :where(ul, ol) ol li p { display: inline; }
.pin-markdown li > p { margin: 8px 0; }
.pin-markdown li > *:first-child { margin-top: 0; }
.pin-markdown hr { display: block; border: none; height: 1px; margin: 32px 0; background: var(--dsw-alias-border-l2); }
.pin-markdown blockquote {
  border-left: 2px solid var(--dsw-alias-label-caption);
  margin: 16px 0 0;
  padding-left: 14px;
}
.pin-markdown pre { margin: 16px 0; font-family: var(--ds-font-family-code); overflow: auto; }
.pin-markdown :not(pre) > code {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  font: var(--dsw-font-markdown-code);
  font-family: var(--ds-font-family-code);
  font-size: 0.875em !important;
  background-color: var(--dsw-alias-markdown-inline-code);
  border-radius: 6px;
  padding: 0 5px;
}
.pin-markdown :where(h1, h2, h3, h4, h5, h6) code { font: inherit; font-family: var(--ds-font-family-code); }
.pin-markdown > *:first-child, .pin-markdown p:first-child { margin-top: 0 !important; }
.pin-markdown > *:last-child, .pin-markdown p:last-child { margin-bottom: 0 !important; }

/* Fenced code block, mirroring CodeBlock surface */
.pin-code-block {
  margin: 16px 0;
  padding: 12px 14px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-markdown-code-block);
  font: var(--dsw-font-markdown-code-block);
  overflow: auto;
}
.pin-code-block code { background: none; border: none; padding: 0; font: inherit; white-space: pre-wrap; word-break: break-word; }
.pin-code-block[data-lang] code::before {
  content: attr(data-lang);
  display: block;
  color: var(--dsw-alias-label-caption);
  font: var(--dsw-font-xxs-strong-12);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: .04em;
}

/* Reasoning row, mirroring ReasoningRow.module.css */
.pin-reasoning { margin: 0 0 16px; }
.pin-reasoning-summary {
  display: flex;
  align-items: center;
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  line-height: 24px;
}
.pin-reasoning-summary::-webkit-details-marker { display: none; }
.pin-reasoning-title { flex: none; color: var(--dsw-alias-label-secondary); font-weight: 400; }
.pin-reasoning-sep { flex: none; width: 2px; height: 2px; margin: 0 8px; border-radius: 1px; background: var(--dsw-alias-label-caption); }
.pin-reasoning-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pin-reasoning-body {
  padding: 4px 0 4px 22px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  line-height: 24px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Tool row, mirroring ToolRow.module.css summary row */
.pin-tool { margin: 0 0 16px; }
.pin-tool-summary {
  display: flex;
  align-items: center;
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  line-height: 24px;
  color: var(--dsw-alias-label-secondary);
}
.pin-tool-summary::-webkit-details-marker { display: none; }
.pin-tool-summary.error { color: var(--dsw-alias-state-error-primary); }
.pin-tool-title { font-weight: 400; }
.pin-tool-args,
.pin-tool-result,
.pin-other pre {
  margin: 4px 0 4px 4px;
  padding: 12px 16px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-markdown-code-block);
  font: var(--dsw-font-markdown-code-block-small);
  color: var(--dsw-alias-label-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.pin-tool-result.error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.pin-tool-error { color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xs-13); margin: 6px 0 0 4px; }

.pin-other { margin: 0 0 16px; }
.pin-other-summary {
  cursor: pointer;
  list-style: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  line-height: 20px;
  margin-bottom: 6px;
}
.pin-other-summary::-webkit-details-marker { display: none; }

.pin-image { color: var(--dsw-alias-label-tertiary); font-style: italic; }
.empty { color: var(--dsw-alias-label-tertiary); }
`

/** Build the full popup document for one pinned turn. */
function buildDocument(pin: PinTurnView, t: PinWindowText, stylesheets: readonly string[]): string {
  const dark = typeof document !== 'undefined' && document.body.hasAttribute('data-ds-dark-theme')
  const title = t('window.title')
  const model = pin.model
  const time = pin.time > 0 ? new Date(pin.time).toLocaleString() : '—'

  const body = pin.items.length === 0
    ? `<p class="empty">${escapeHtml(t('window.empty'))}</p>`
    : pin.items.map((item) => {
      if (item.kind === 'assistant') return renderAssistantItem(item.blocks, t)
      return renderToolRoot(item.root, t)
    }).join('')

  const styleLinks = stylesheets
    .map(href => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${styleLinks}
  <style>${POPUP_CSS}</style>
</head>
<body${dark ? ' data-ds-dark-theme' : ''}>
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
 * Open the display-only pin window for a selected assistant message turn.
 * @param pin - the pinned turn content.
 * @param t - dictionary access (namespace `pin`).
 */
export function openPinWindow(pin: PinTurnView, t: PinWindowText): void {
  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => link.getAttribute('href'))
    .filter((href): href is string => typeof href === 'string')
  const html = buildDocument(pin, t, stylesheets)
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
