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
  /** Files produced by this turn, for inline file-mention resolution. */
  producedFiles: readonly string[]
  /** Chat-flow keys of the turn's rendered nodes, for DOM cloning. */
  nodeKeys: readonly string[]
  /** Collapsed-summary first lines for reasoning rows, in DOM order. */
  reasoningFirstLines: readonly string[]
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

/** Trailing path segment. */
function basename(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/** Resolve an inline-code token against the turn's produced files. */
function resolveFileMention(value: string, producedFiles: readonly string[]): string | undefined {
  if (producedFiles.includes(value)) return value
  const matches = producedFiles.filter(path => basename(path) === value)
  return matches.length === 1 ? matches[0] : undefined
}

/** Very small markdown renderer for the popup; output is always escaped first. */
function renderInline(raw: string, producedFiles: readonly string[]): string {
  const codeSpans: string[] = []
  let s = escapeHtml(raw)

  // Inline code first, parked in placeholders so later rules ignore it.
  // A token that resolves to a produced file renders as the original
  // file-mention chip instead of inert code.
  s = s.replace(/`([^`]+)`/g, (_match, code: string) => {
    const mention = resolveFileMention(code, producedFiles)
    if (mention !== undefined) {
      return `<code class="pin-inline-code"><button type="button" class="pin-file-mention" title="${escapeHtml(mention)}" aria-label="${escapeHtml(mention)}">${code}</button></code>`
    }
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
export function renderMarkdown(text: string, producedFiles: readonly string[] = []): string {
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
      out.push(`<h${level}>${renderInline(heading[2] ?? '', producedFiles)}</h${level}>`)
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
      out.push(renderMarkdown(inner.join('\n'), producedFiles))
      out.push('</blockquote>')
      continue
    }

    // Unordered list.
    if (isUlMarker(line)) {
      const { items, next } = collectList(lines, i, isUlMarker)
      i = next
      out.push('<ul>')
      for (const item of items) out.push(`<li>${renderInline(item, producedFiles)}</li>`)
      out.push('</ul>')
      continue
    }

    // Ordered list.
    if (isOlMarker(line)) {
      const { items, next } = collectList(lines, i, isOlMarker)
      i = next
      out.push('<ol>')
      for (const item of items) out.push(`<li>${renderInline(item, producedFiles)}</li>`)
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
    out.push(`<p>${renderInline(paragraph.join('<br>'), producedFiles)}</p>`)
  }

  // Join without whitespace so the emitted block structure stays compact like
  // the harness's own renderer — whitespace text nodes between block elements
  // are only formatting noise, never content.
  return out.join('')
}

/** Wrap rendered markdown in the class the popup stylesheet targets. */
function markdownSection(text: string, producedFiles: readonly string[]): string {
  return `<div class="pin-markdown">${renderMarkdown(text, producedFiles)}</div>`
}

/** First line of reasoning text, mirroring ReasoningRow's collapsed summary. */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

/** Inline Think icon (same path as IconThinkOutline14). */
const THINK_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233C8.19322 7.68573 7.68772 8.19123 7.06431 8.19123C6.44099 8.19113 5.9354 7.68567 5.9354 7.06233C5.93555 6.43911 6.44108 5.93353 7.06431 5.93342Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8.6815 0.963693C10.1169 0.447019 11.6266 0.374829 12.5633 1.31135C13.5 2.24805 13.4277 3.75776 12.911 5.19319C12.7126 5.74431 12.4386 6.31796 12.0965 6.89729C12.4969 7.54638 12.8141 8.19018 13.036 8.80647C13.5527 10.2419 13.6251 11.7516 12.6883 12.6883C11.7516 13.625 10.242 13.5527 8.8065 13.036C8.19022 12.8141 7.54641 12.4969 6.89732 12.0965C6.31797 12.4386 5.74435 12.7125 5.19322 12.911C3.75777 13.4276 2.2481 13.5 1.31138 12.5633C0.374859 11.6266 0.447049 10.1168 0.963724 8.68147C1.17185 8.10338 1.46321 7.50063 1.82896 6.8924C1.52182 6.35711 1.27235 5.82825 1.08872 5.31819C0.572068 3.88278 0.499714 2.37306 1.43638 1.43635C2.37308 0.499655 3.8828 0.572044 5.31822 1.08869C5.82828 1.27232 6.35715 1.5218 6.89243 1.82893C7.50066 1.46318 8.10341 1.17181 8.6815 0.963693ZM11.3573 8.01154C10.9083 8.62253 10.3901 9.22873 9.80943 9.8094C9.22877 10.3901 8.62255 10.9083 8.01158 11.3572C8.4257 11.5841 8.8287 11.7688 9.21275 11.9071C10.5456 12.3868 11.4246 12.2547 11.8397 11.8397C12.2548 11.4246 12.3869 10.5456 11.9071 9.21272C11.7688 8.82866 11.5841 8.42568 11.3573 8.01154ZM2.56529 8.02912C2.37344 8.39322 2.21495 8.74796 2.09263 9.08772C1.61291 10.4204 1.74512 11.2995 2.16001 11.7147C2.57505 12.1297 3.45415 12.2618 4.78697 11.7821C5.11057 11.6656 5.44786 11.5164 5.7938 11.3367C5.249 10.9223 4.70922 10.4533 4.19029 9.9344C3.57578 9.31987 3.03169 8.67633 2.56529 8.02912ZM6.90708 3.2469C6.24065 3.70479 5.5646 4.26321 4.91392 4.91389C4.26325 5.56456 3.70482 6.24063 3.24693 6.90705C3.72674 7.63325 4.32777 8.37459 5.03892 9.08576C5.64943 9.69627 6.28183 10.2265 6.90806 10.6678C7.59368 10.2025 8.2908 9.63076 8.96079 8.96076C9.6308 8.29075 10.2025 7.59366 10.6678 6.90803C10.2265 6.2818 9.69631 5.6494 9.08579 5.03889C8.37462 4.32773 7.63328 3.72672 6.90708 3.2469ZM11.7147 2.15998C11.2996 1.74509 10.4204 1.61288 9.08775 2.0926C8.74835 2.21479 8.39382 2.37271 8.03013 2.56428C8.67728 3.03065 9.31995 3.5758 9.93443 4.19026C10.4534 4.7092 10.9223 5.24896 11.3368 5.79377C11.5164 5.4 11.6657 5.11056 11.7821 4.78694C12.2618 3.45412 12.1297 2.57502 11.7147 2.15998Z" fill="currentColor"/></svg>`

/** Inline chevron icon (same path as IconChevronDownOutline14). */
const CHEVRON_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor"/></svg>`

/** Render one assistant content block. */
function renderBlock(block: AssistantBlock, t: PinWindowText, producedFiles: readonly string[]): string {
  switch (block.kind) {
    case 'text':
      return markdownSection(block.text, producedFiles)
    case 'reasoning':
      return `<details class="pin-reasoning"><summary class="pin-reasoning-summary"><span class="pin-reasoning-leading">${CHEVRON_ICON}${THINK_ICON}</span><span class="pin-reasoning-title">${escapeHtml(t('window.reasoning'))}</span><span class="pin-reasoning-sep" aria-hidden="true"></span><span class="pin-reasoning-text">${escapeHtml(firstLine(block.text))}</span></summary><div class="pin-reasoning-body">${escapeHtml(block.text)}</div></details>`
    case 'tool-call':
      return `<details class="pin-tool"><summary class="pin-tool-summary"><span class="pin-tool-title">${escapeHtml(t('window.toolCall'))} · ${escapeHtml(block.name)}</span></summary><pre class="pin-tool-args">${escapeHtml(block.argsRaw)}</pre></details>`
    case 'image':
      return `<div class="pin-image">${escapeHtml(t('window.image'))}</div>`
    case 'other':
      return `<details class="pin-other"><summary class="pin-other-summary">${escapeHtml(t('window.other'))}</summary><pre>${escapeHtml(JSON.stringify(block.block, null, 2))}</pre></details>`
  }
}

/** Render one assistant step's visible blocks (tool-call heads are tool rows). */
function renderAssistantItem(blocks: readonly AssistantBlock[], t: PinWindowText, producedFiles: readonly string[]): string {
  return blocks
    .filter(block => block.kind !== 'tool-call')
    .map(block => renderBlock(block, t, producedFiles))
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

/* Cloned chat-flow column: same width/rhythm as the original message column. */
.pin-flow {
  --dsh-chat-content-width: 748px;
  --dsh-composer-side-clearance: 16px;
  max-width: var(--dsh-chat-content-width);
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.pin-flow [hidden] { display: none !important; }

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

/* Inline code wrapping a file mention, mirroring render.tsx fileMention */
.pin-inline-code { padding: 0; }
.pin-inline-code .pin-file-mention {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: var(--dsw-alias-state-business-primary);
  text-decoration: none;
  cursor: pointer;
}
.pin-inline-code .pin-file-mention:hover {
  outline: none;
  text-decoration: underline var(--dsw-alias-state-business-primary);
  text-underline-offset: 3px;
}

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

/* Reasoning row, mirroring ReasoningRow.module.css + DisclosureRow */
.pin-reasoning { margin: 0 0 16px; }
.pin-reasoning-summary {
  display: flex;
  align-items: center;
  height: 24px;
  cursor: pointer;
  list-style: none;
  font-size: 14px;
  line-height: 24px;
}
.pin-reasoning-summary::-webkit-details-marker { display: none; }
.pin-reasoning-leading {
  position: relative;
  flex: none;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: var(--dsw-alias-label-tertiary);
}
.pin-reasoning-leading svg { position: absolute; inset: 0; margin: auto; }
.pin-reasoning-leading .pin-chevron { opacity: 0; transition: opacity 100ms ease; }
.pin-reasoning-summary:hover .pin-reasoning-leading .pin-chevron { opacity: 1; }
.pin-reasoning-summary:hover .pin-reasoning-leading .pin-think { opacity: 0; }
.pin-reasoning[open] .pin-reasoning-leading .pin-chevron { opacity: 1; }
.pin-reasoning[open] .pin-reasoning-leading .pin-think { opacity: 0; }
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
.pin-reasoning[open] .pin-reasoning-sep,
.pin-reasoning[open] .pin-reasoning-text { display: none; }
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

/** Build the popup script: collapse bodies by default, restore reasoning
 *  summaries, and wire disclosure-row toggling for the cloned DOM. */
function buildToggleScript(firstLines: readonly string[], leadings: readonly string[]): string {
  return `<script>(function () {
  var firstLines = ${JSON.stringify(firstLines)}
  var leadings = ${JSON.stringify(leadings)}
  var rows = document.querySelectorAll('[data-disclosure-row]')
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var root = row.parentElement
    if (root === null) continue
    var body = null
    for (var j = 0; j < root.children.length; j++) {
      if (root.children[j] !== row) { body = root.children[j]; break }
    }
    if (body !== null) {
      body.setAttribute('hidden', '')
      root.removeAttribute('data-open')
    }
    var leading = row.firstElementChild
    if (leading !== null && leadings[i] !== undefined) {
      leading.innerHTML = leadings[i]
    }
  }
  var thinkRows = document.querySelectorAll('[data-variant="think"] [data-disclosure-row]')
  for (var k = 0; k < thinkRows.length; k++) {
    var thinkRow = thinkRows[k]
    var text = firstLines[k] !== undefined ? firstLines[k] : ''
    var sep = document.createElement('span')
    sep.className = 'pin-reasoning-sep'
    sep.setAttribute('aria-hidden', 'true')
    var summary = document.createElement('span')
    summary.className = 'pin-reasoning-text'
    summary.textContent = text
    thinkRow.appendChild(sep)
    thinkRow.appendChild(summary)
  }
  function localCopyText(button) {
    var codeBlock = button.closest ? button.closest('.md-code-block') : null
    if (codeBlock !== null) {
      var pre = codeBlock.querySelector('pre')
      if (pre !== null) return pre.textContent || ''
    }
    var container = button.parentElement
    while (container !== null && container !== document.body) {
      var candidate = container.querySelector('pre')
      if (candidate !== null) return candidate.textContent || ''
      container = container.parentElement
    }
    return null
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch (err) { /* noop */ }
    document.body.removeChild(ta)
  }

  function showCopied(button) {
    var old = button.textContent
    button.textContent = '复制成功'
    window.setTimeout(function () { button.textContent = old }, 1000)
  }

  function localCopy(button, text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showCopied(button) }, function () {
        fallbackCopy(text)
        showCopied(button)
      })
    } else {
      fallbackCopy(text)
      showCopied(button)
    }
  }

  function forward(button) {
    if (window.opener === null || !window.opener.postMessage) return
    var seat = button.closest ? button.closest('[data-chat-flow-key]') : null
    var seatKey = seat === null ? '' : seat.getAttribute('data-chat-flow-key')
    var btnId = button.getAttribute('data-pin-btn')
    if (seatKey === null || btnId === null) return
    window.opener.postMessage({ dshPinWindow: true, seatKey: seatKey, btnId: btnId }, '*')
  }

  document.addEventListener('click', function (event) {
    var target = event.target
    var button = target && target.closest ? target.closest('button') : null
    if (button !== null && button.hasAttribute('data-pin-btn')) {
      event.stopPropagation()
      var label = (button.textContent || '').trim()
      if (label === '复制' || label === '复制成功' || label === 'Copy' || label === 'Copied') {
        var text = localCopyText(button)
        if (text !== null) {
          localCopy(button, text)
          return
        }
      }
      forward(button)
      return
    }
    var row = target && target.closest ? target.closest('[data-disclosure-row]') : null
    if (row === null) return
    var root = row.parentElement
    if (root === null) return
    var body = null
    for (var j = 0; j < root.children.length; j++) {
      if (root.children[j] !== row) { body = root.children[j]; break }
    }
    if (body === null) return
    if (body.hasAttribute('hidden')) {
      body.removeAttribute('hidden')
      root.setAttribute('data-open', '')
    } else {
      body.setAttribute('hidden', '')
      root.removeAttribute('data-open')
    }
  })
})()</script>`
}

/** Find the live chat-flow seats for the pinned turn's node keys, in DOM order. */
function findTurnSeats(nodeKeys: readonly string[]): HTMLElement[] {
  const wanted = new Set(nodeKeys)
  const seats: HTMLElement[] = []
  for (const seat of Array.from(document.querySelectorAll<HTMLElement>('[data-chat-flow-key]'))) {
    const key = seat.getAttribute('data-chat-flow-key')
    if (key !== null && wanted.has(key)) seats.push(seat)
  }
  return seats
}

/**
 * Clone the live page's already-rendered DOM for the pinned turn. This is
 * what makes the popup pixel-identical to the original: we copy the same
 * React-rendered nodes and link the same stylesheets, instead of re-rendering
 * from data with an approximation.
 * @param seats - the live chat-flow seat elements to clone.
 * @returns concatenated outerHTML of the cloned seats, or '' when none found.
 */
function cloneSeats(seats: readonly HTMLElement[]): string {
  const parts: string[] = []
  for (const seat of seats) {
    // Stamp source buttons with stable ids so the popup can forward clicks
    // back to the opener's real React handlers.
    const buttons = Array.from(seat.querySelectorAll<HTMLButtonElement>('button'))
    buttons.forEach((button, index) => {
      button.setAttribute('data-pin-btn', `b${index}`)
    })
    const clone = seat.cloneNode(true) as HTMLElement
    // The turn-tail keeps its produced-files row; only the interactive action
    // strip (copy / branch / feedback / pin) is removed.
    for (const actions of Array.from(clone.querySelectorAll<HTMLElement>('[class*="actions"]'))) {
      actions.remove()
    }
    parts.push(clone.outerHTML)
  }
  return parts.join('')
}

/** All disclosure rows inside the selected seats, in DOM order. */
function disclosureRows(seats: readonly HTMLElement[]): HTMLElement[] {
  return seats.flatMap(seat =>
    Array.from(seat.querySelectorAll<HTMLElement>('[data-disclosure-row]')))
}

/** Whether a disclosure row's root is currently open. */
function rowIsOpen(row: HTMLElement): boolean {
  return row.parentElement?.hasAttribute('data-open') === true
}

/** The collapsed leading markup (idle tool icon + hover chevron). */
function leadingHtml(row: HTMLElement): string {
  const leading = row.firstElementChild as HTMLElement | null
  return leading?.innerHTML ?? ''
}

/** Wait for React to re-render after programmatic clicks. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Build the full popup document for one pinned turn. */
function buildDocument(
  pin: PinTurnView,
  t: PinWindowText,
  stylesheets: readonly string[],
  cloneHtml: string,
  pluginCss: string,
  leadings: readonly string[],
): string {
  const dark = typeof document !== 'undefined' && document.body.hasAttribute('data-ds-dark-theme')
  const title = t('window.title')
  const model = pin.model
  const time = pin.time > 0 ? new Date(pin.time).toLocaleString() : '—'

  const fallbackBody = pin.items.length === 0
    ? `<p class="empty">${escapeHtml(t('window.empty'))}</p>`
    : pin.items.map((item) => {
      if (item.kind === 'assistant') return renderAssistantItem(item.blocks, t, pin.producedFiles)
      return renderToolRoot(item.root, t)
    }).join('')

  // Primary path: the live page's own rendered DOM. Fallback only when the
  // live DOM is unavailable (e.g. the flow has been virtualized or detached).
  const body = cloneHtml.length > 0
    ? `<div class="pin-flow">${cloneHtml}</div>`
    : fallbackBody

  const styleLinks = stylesheets
    .map(href => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('')

  return `<!doctype html>
<html lang="zh-CN" style="color-scheme: ${dark ? 'dark' : 'light'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${styleLinks}
  <style data-pin-copy>${pluginCss}</style>
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
  ${buildToggleScript(pin.reasoningFirstLines, leadings)}
</body>
</html>`
}

/**
 * Open the display-only pin window for a selected assistant message turn.
 * @param pin - the pinned turn content.
 * @param t - dictionary access (namespace `pin`).
 */
export async function openPinWindow(pin: PinTurnView, t: PinWindowText): Promise<void> {
  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(link => link.getAttribute('href'))
    .filter((href): href is string => typeof href === 'string')
  // Plugin bundles inject their CSS Modules as <style> tags (not <link>);
  // copying them is what makes the cloned component DOM look like the original.
  const pluginCss = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent ?? '')
    .join('\n')

  // Collapsed rows have no body in the DOM (React only renders children when
  // open). Expand them first, let React materialize the bodies, then clone;
  // finally restore the live page to its previous collapsed state. While all
  // rows are collapsed, also capture each row's idle leading (tool icon +
  // hover chevron) so the popup can restore the collapsed icons too.
  const seats = findTurnSeats(pin.nodeKeys)
  const rows = disclosureRows(seats)

  // Phase A: collapse any currently-open rows so every row exposes its
  // collapsed leading.
  const originallyOpen = new Set<HTMLElement>()
  for (const row of rows) {
    if (rowIsOpen(row)) {
      originallyOpen.add(row)
      row.click()
    }
  }
  if (originallyOpen.size > 0) await delay(200)

  // Phase B: capture collapsed leading markup for every row, in DOM order.
  const leadings = rows.map(leadingHtml)

  // Phase C: expand every expandable row so React materializes the bodies.
  for (const row of rows) {
    if (row.hasAttribute('data-expandable') && !rowIsOpen(row)) {
      row.click()
    }
  }
  if (rows.some(row => row.hasAttribute('data-expandable'))) await delay(250)

  const cloneHtml = cloneSeats(seats)

  // Phase D: restore the live page to its previous state.
  for (const row of rows) {
    if (!row.isConnected) continue
    if (originallyOpen.has(row)) continue // already back to open after phase C
    if (row.hasAttribute('data-expandable') && rowIsOpen(row)) row.click()
  }

  const html = buildDocument(pin, t, stylesheets, cloneHtml, pluginCss, leadings)
  const win = window.open('', '_blank', 'width=760,height=900,menubar=no,toolbar=no,location=no,status=no')
  if (win === null) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  // Keep window.opener so the popup can forward file-open / Inspect / other
  // button clicks back to the opener's real React handlers.
  win.focus()
}
