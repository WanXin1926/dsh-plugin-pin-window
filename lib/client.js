window.__ModuleLoader__.load({
	id: "dsh-plugin-pin-window",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/pin-window.ts
		/** Escape text for safe HTML insertion. */
		function escapeHtml(value) {
			return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		}
		/** Permit only safe link targets for anchor href / image src. */
		function safeUrl(url) {
			return /^(https?:\/\/|mailto:)/i.test(url);
		}
		/** Trailing path segment. */
		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/** Resolve an inline-code token against the turn's produced files. */
		function resolveFileMention(value, producedFiles) {
			if (producedFiles.includes(value)) return value;
			const matches = producedFiles.filter((path) => basename(path) === value);
			return matches.length === 1 ? matches[0] : void 0;
		}
		/** Very small markdown renderer for the popup; output is always escaped first. */
		function renderInline(raw, producedFiles) {
			const codeSpans = [];
			let s = escapeHtml(raw);
			s = s.replace(/`([^`]+)`/g, (_match, code) => {
				const mention = resolveFileMention(code, producedFiles);
				if (mention !== void 0) return `<code class="pin-inline-code"><button type="button" class="pin-file-mention" title="${escapeHtml(mention)}" aria-label="${escapeHtml(mention)}">${code}</button></code>`;
				codeSpans.push(`<code>${code}</code>`);
				return `\u0000${codeSpans.length - 1}\u0000`;
			});
			s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt, url) => safeUrl(url) ? `<img src="${url}" alt="${alt}" loading="lazy" />` : alt);
			s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, url) => safeUrl(url) ? `<a href="${url}" target="_blank" rel="noreferrer">${label}</a>` : label);
			s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
			s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
			s = s.replace(/\u0000(\d+)\u0000/g, (_m, index) => codeSpans[Number(index)] ?? "");
			return s;
		}
		/** Whether the line starts a block construct that terminates a paragraph. */
		function isBlockStart(line) {
			return /^```/.test(line) || /^#{1,6}\s+/.test(line) || /^\s*>\s?/.test(line) || /^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line) || /^\s*$/.test(line);
		}
		function isUlMarker(line) {
			return /^\s*[-*+]\s+/.test(line);
		}
		function isOlMarker(line) {
			return /^\s*\d+[.)]\s+/.test(line);
		}
		function isBlank(line) {
			return line.trim() === "";
		}
		/** One list marker, removed from the item text. */
		function stripListMarker(line) {
			return line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "");
		}
		/**
		* Collect one loose list: consecutive marker lines, allowing blank lines
		* between items as long as the next non-blank line is still the same marker
		* kind. A single <ol>/<ul> then numbers/bullets the whole list correctly.
		*/
		function collectList(lines, start, markerTest) {
			const items = [];
			let i = start;
			while (i < lines.length) {
				const line = lines[i] ?? "";
				if (markerTest(line)) {
					items.push(stripListMarker(line));
					i += 1;
					continue;
				}
				if (isBlank(line) && i + 1 < lines.length && markerTest(lines[i + 1] ?? "")) {
					i += 1;
					continue;
				}
				break;
			}
			return {
				items,
				next: i
			};
		}
		/** Render a markdown block sequence for one text body. */
		function renderMarkdown(text, producedFiles = []) {
			const lines = text.replace(/\r\n?/g, "\n").split("\n");
			const out = [];
			let i = 0;
			while (i < lines.length) {
				const line = lines[i] ?? "";
				const fence = /^```([^`]*)$/.exec(line);
				if (fence !== null) {
					const language = (fence[1] ?? "").trim();
					i += 1;
					const code = [];
					while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
						code.push(lines[i] ?? "");
						i += 1;
					}
					if (i < lines.length) i += 1;
					const langAttr = language.length > 0 ? ` data-lang="${escapeHtml(language)}"` : "";
					out.push(`<pre class="pin-code-block"><code${langAttr}>${escapeHtml(code.join("\n"))}</code></pre>`);
					continue;
				}
				const heading = /^(#{1,6})\s+(.*)$/.exec(line);
				if (heading !== null) {
					const level = heading[1]?.length ?? 0;
					out.push(`<h${level}>${renderInline(heading[2] ?? "", producedFiles)}</h${level}>`);
					i += 1;
					continue;
				}
				if (/^\s*>\s?/.test(line)) {
					const inner = [];
					out.push("<blockquote>");
					while (i < lines.length) {
						const quoteLine = lines[i] ?? "";
						if (/^\s*>\s?/.test(quoteLine)) {
							inner.push(quoteLine.replace(/^\s*>\s?/, ""));
							i += 1;
						} else if (isBlank(quoteLine) && i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1] ?? "")) {
							inner.push("");
							i += 1;
						} else break;
					}
					out.push(renderMarkdown(inner.join("\n"), producedFiles));
					out.push("</blockquote>");
					continue;
				}
				if (isUlMarker(line)) {
					const { items, next } = collectList(lines, i, isUlMarker);
					i = next;
					out.push("<ul>");
					for (const item of items) out.push(`<li>${renderInline(item, producedFiles)}</li>`);
					out.push("</ul>");
					continue;
				}
				if (isOlMarker(line)) {
					const { items, next } = collectList(lines, i, isOlMarker);
					i = next;
					out.push("<ol>");
					for (const item of items) out.push(`<li>${renderInline(item, producedFiles)}</li>`);
					out.push("</ol>");
					continue;
				}
				if (isBlank(line)) {
					i += 1;
					continue;
				}
				const paragraph = [];
				while (i < lines.length && !isBlockStart(lines[i] ?? "")) {
					paragraph.push(lines[i] ?? "");
					i += 1;
				}
				out.push(`<p>${renderInline(paragraph.join("<br>"), producedFiles)}</p>`);
			}
			return out.join("");
		}
		/** Wrap rendered markdown in the class the popup stylesheet targets. */
		function markdownSection(text, producedFiles) {
			return `<div class="pin-markdown">${renderMarkdown(text, producedFiles)}</div>`;
		}
		/** First line of reasoning text, mirroring ReasoningRow's collapsed summary. */
		function firstLine$1(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		/** Inline Think icon (same path as IconThinkOutline14). */
		const THINK_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7.06431 5.93342C7.68763 5.93342 8.19307 6.43904 8.19322 7.06233C8.19322 7.68573 7.68772 8.19123 7.06431 8.19123C6.44099 8.19113 5.9354 7.68567 5.9354 7.06233C5.93555 6.43911 6.44108 5.93353 7.06431 5.93342Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8.6815 0.963693C10.1169 0.447019 11.6266 0.374829 12.5633 1.31135C13.5 2.24805 13.4277 3.75776 12.911 5.19319C12.7126 5.74431 12.4386 6.31796 12.0965 6.89729C12.4969 7.54638 12.8141 8.19018 13.036 8.80647C13.5527 10.2419 13.6251 11.7516 12.6883 12.6883C11.7516 13.625 10.242 13.5527 8.8065 13.036C8.19022 12.8141 7.54641 12.4969 6.89732 12.0965C6.31797 12.4386 5.74435 12.7125 5.19322 12.911C3.75777 13.4276 2.2481 13.5 1.31138 12.5633C0.374859 11.6266 0.447049 10.1168 0.963724 8.68147C1.17185 8.10338 1.46321 7.50063 1.82896 6.8924C1.52182 6.35711 1.27235 5.82825 1.08872 5.31819C0.572068 3.88278 0.499714 2.37306 1.43638 1.43635C2.37308 0.499655 3.8828 0.572044 5.31822 1.08869C5.82828 1.27232 6.35715 1.5218 6.89243 1.82893C7.50066 1.46318 8.10341 1.17181 8.6815 0.963693ZM11.3573 8.01154C10.9083 8.62253 10.3901 9.22873 9.80943 9.8094C9.22877 10.3901 8.62255 10.9083 8.01158 11.3572C8.4257 11.5841 8.8287 11.7688 9.21275 11.9071C10.5456 12.3868 11.4246 12.2547 11.8397 11.8397C12.2548 11.4246 12.3869 10.5456 11.9071 9.21272C11.7688 8.82866 11.5841 8.42568 11.3573 8.01154ZM2.56529 8.02912C2.37344 8.39322 2.21495 8.74796 2.09263 9.08772C1.61291 10.4204 1.74512 11.2995 2.16001 11.7147C2.57505 12.1297 3.45415 12.2618 4.78697 11.7821C5.11057 11.6656 5.44786 11.5164 5.7938 11.3367C5.249 10.9223 4.70922 10.4533 4.19029 9.9344C3.57578 9.31987 3.03169 8.67633 2.56529 8.02912ZM6.90708 3.2469C6.24065 3.70479 5.5646 4.26321 4.91392 4.91389C4.26325 5.56456 3.70482 6.24063 3.24693 6.90705C3.72674 7.63325 4.32777 8.37459 5.03892 9.08576C5.64943 9.69627 6.28183 10.2265 6.90806 10.6678C7.59368 10.2025 8.2908 9.63076 8.96079 8.96076C9.6308 8.29075 10.2025 7.59366 10.6678 6.90803C10.2265 6.2818 9.69631 5.6494 9.08579 5.03889C8.37462 4.32773 7.63328 3.72672 6.90708 3.2469ZM11.7147 2.15998C11.2996 1.74509 10.4204 1.61288 9.08775 2.0926C8.74835 2.21479 8.39382 2.37271 8.03013 2.56428C8.67728 3.03065 9.31995 3.5758 9.93443 4.19026C10.4534 4.7092 10.9223 5.24896 11.3368 5.79377C11.5164 5.4 11.6657 5.11056 11.7821 4.78694C12.2618 3.45412 12.1297 2.57502 11.7147 2.15998Z" fill="currentColor"/></svg>`;
		/** Inline chevron icon (same path as IconChevronDownOutline14). */
		const CHEVRON_ICON = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z" fill="currentColor"/></svg>`;
		/** Render one assistant content block. */
		function renderBlock(block, t, producedFiles) {
			switch (block.kind) {
				case "text": return markdownSection(block.text, producedFiles);
				case "reasoning": return `<details class="pin-reasoning"><summary class="pin-reasoning-summary"><span class="pin-reasoning-leading">${CHEVRON_ICON}${THINK_ICON}</span><span class="pin-reasoning-title">${escapeHtml(t("window.reasoning"))}</span><span class="pin-reasoning-sep" aria-hidden="true"></span><span class="pin-reasoning-text">${escapeHtml(firstLine$1(block.text))}</span></summary><div class="pin-reasoning-body">${escapeHtml(block.text)}</div></details>`;
				case "tool-call": return `<details class="pin-tool"><summary class="pin-tool-summary"><span class="pin-tool-title">${escapeHtml(t("window.toolCall"))} · ${escapeHtml(block.name)}</span></summary><pre class="pin-tool-args">${escapeHtml(block.argsRaw)}</pre></details>`;
				case "image": return `<div class="pin-image">${escapeHtml(t("window.image"))}</div>`;
				case "other": return `<details class="pin-other"><summary class="pin-other-summary">${escapeHtml(t("window.other"))}</summary><pre>${escapeHtml(JSON.stringify(block.block, null, 2))}</pre></details>`;
			}
		}
		/** Render one assistant step's visible blocks (tool-call heads are tool rows). */
		function renderAssistantItem(blocks, t, producedFiles) {
			return blocks.filter((block) => block.kind !== "tool-call").map((block) => renderBlock(block, t, producedFiles)).join("");
		}
		/** Extract readable text from a tool result's content blocks. */
		function toolContentText(content) {
			return content.map((block) => {
				if (typeof block !== "object" || block === null) return JSON.stringify(block);
				const record = block;
				if (record.type === "text" && typeof record.text === "string") return record.text;
				return JSON.stringify(block);
			}).join("\n");
		}
		/** Render one tool call root: collapsible call head + args + result. */
		function renderToolRoot(root, t) {
			if ("kind" in root && root.kind === "tool-result") {
				const settled = root;
				const name = settled.call?.name ?? settled.callId;
				const args = settled.call?.argsRaw ?? "";
				const content = toolContentText(settled.content);
				const errorClass = settled.isError ? " error" : "";
				const errorLine = settled.isError && settled.error !== void 0 ? `<div class="pin-tool-error">${escapeHtml(`${settled.error.name}: ${settled.error.code}`)}</div>` : "";
				return `<details class="pin-tool"><summary class="pin-tool-summary${errorClass}"><span class="pin-tool-title">${escapeHtml(t("window.toolCall"))} · ${escapeHtml(name)}</span></summary>${args.length > 0 ? `<pre class="pin-tool-args">${escapeHtml(args)}</pre>` : ""}${content.length > 0 ? `<pre class="pin-tool-result${errorClass}">${escapeHtml(content)}</pre>` : ""}${errorLine}</details>`;
			}
			const running = root;
			return `<details class="pin-tool running"><summary class="pin-tool-summary"><span class="pin-tool-title">${escapeHtml(t("window.toolCall"))} · ${escapeHtml(running.name)}</span></summary><pre class="pin-tool-args">${escapeHtml(running.argsRaw)}</pre></details>`;
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
`;
		/** Build the popup script: collapse bodies by default, restore reasoning
		*  summaries, and wire disclosure-row toggling for the cloned DOM. */
		function buildToggleScript(firstLines, leadings, sessionId) {
			return `<script>(function () {
  var firstLines = ${JSON.stringify(firstLines)}
  var leadings = ${JSON.stringify(leadings)}
  var sessionId = ${JSON.stringify(sessionId)}
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
    window.opener.postMessage({ dshPinWindow: true, sessionId: sessionId, seatKey: seatKey, btnId: btnId }, '*')
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
})()<\/script>`;
		}
		/** Find the live chat-flow seats for the pinned turn's node keys, in DOM order. */
		function findTurnSeats(nodeKeys) {
			const wanted = new Set(nodeKeys);
			const seats = [];
			for (const seat of Array.from(document.querySelectorAll("[data-chat-flow-key]"))) {
				const key = seat.getAttribute("data-chat-flow-key");
				if (key !== null && wanted.has(key)) seats.push(seat);
			}
			return seats;
		}
		/**
		* Clone the live page's already-rendered DOM for the pinned turn. This is
		* what makes the popup pixel-identical to the original: we copy the same
		* React-rendered nodes and link the same stylesheets, instead of re-rendering
		* from data with an approximation.
		* @param seats - the live chat-flow seat elements to clone.
		* @returns concatenated outerHTML of the cloned seats, or '' when none found.
		*/
		function cloneSeats(seats) {
			const parts = [];
			for (const seat of seats) {
				const clone = seat.cloneNode(true);
				Array.from(clone.querySelectorAll("button")).forEach((button, index) => {
					button.setAttribute("data-pin-btn", `b${index}`);
				});
				for (const actions of Array.from(clone.querySelectorAll("[class*=\"actions\"]"))) actions.remove();
				parts.push(clone.outerHTML);
			}
			return parts.join("");
		}
		/** All disclosure rows inside the selected seats, in DOM order. */
		function disclosureRows(seats) {
			return seats.flatMap((seat) => Array.from(seat.querySelectorAll("[data-disclosure-row]")));
		}
		/** Whether a disclosure row's root is currently open. */
		function rowIsOpen(row) {
			return row.parentElement?.hasAttribute("data-open") === true;
		}
		/** The collapsed leading markup (idle tool icon + hover chevron). */
		function leadingHtml(row) {
			return row.firstElementChild?.innerHTML ?? "";
		}
		/** Wait for React to re-render after programmatic clicks. */
		function delay$1(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}
		/** Build the full popup document for one pinned turn. */
		function buildDocument(pin, t, stylesheets, cloneHtml, pluginCss, leadings) {
			const dark = typeof document !== "undefined" && document.body.hasAttribute("data-ds-dark-theme");
			const title = t("window.title");
			const model = pin.model;
			const time = pin.time > 0 ? new Date(pin.time).toLocaleString() : "—";
			const fallbackBody = pin.items.length === 0 ? `<p class="empty">${escapeHtml(t("window.empty"))}</p>` : pin.items.map((item) => {
				if (item.kind === "assistant") return renderAssistantItem(item.blocks, t, pin.producedFiles);
				return renderToolRoot(item.root, t);
			}).join("");
			const body = cloneHtml.length > 0 ? `<div class="pin-flow">${cloneHtml}</div>` : fallbackBody;
			const styleLinks = stylesheets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`).join("");
			return `<!doctype html>
<html lang="zh-CN" style="color-scheme: ${dark ? "dark" : "light"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  ${styleLinks}
  <style data-pin-copy>${pluginCss}</style>
  <style>${POPUP_CSS}</style>
</head>
<body${dark ? " data-ds-dark-theme" : ""}>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        <span>${escapeHtml(t("window.assistant"))}</span>
        <span>${escapeHtml(t("window.model"))}: ${escapeHtml(model)}</span>
        <span>${escapeHtml(t("window.time"))}: ${escapeHtml(time)}</span>
      </div>
    </header>
    ${body}
  </main>
  ${buildToggleScript(pin.reasoningFirstLines, leadings, pin.sessionId)}
</body>
</html>`;
		}
		/**
		* Open the display-only pin window for a selected assistant message turn.
		* @param pin - the pinned turn content.
		* @param t - dictionary access (namespace `pin`).
		*/
		async function openPinWindow(pin, t) {
			const stylesheets = Array.from(document.querySelectorAll("link[rel=\"stylesheet\"]")).map((link) => link.getAttribute("href")).filter((href) => typeof href === "string");
			const pluginCss = Array.from(document.querySelectorAll("style")).map((style) => style.textContent ?? "").join("\n");
			const seats = findTurnSeats(pin.nodeKeys);
			const rows = disclosureRows(seats);
			const originallyOpen = /* @__PURE__ */ new Set();
			for (const row of rows) if (rowIsOpen(row)) {
				originallyOpen.add(row);
				row.click();
			}
			if (originallyOpen.size > 0) await delay$1(200);
			const leadings = rows.map(leadingHtml);
			for (const row of rows) if (row.hasAttribute("data-expandable") && !rowIsOpen(row)) row.click();
			if (rows.some((row) => row.hasAttribute("data-expandable"))) await delay$1(250);
			const cloneHtml = cloneSeats(seats);
			for (const row of rows) {
				if (!row.isConnected) continue;
				if (originallyOpen.has(row)) continue;
				if (row.hasAttribute("data-expandable") && rowIsOpen(row)) row.click();
			}
			const html = buildDocument(pin, t, stylesheets, cloneHtml, pluginCss, leadings);
			const win = window.open("", "_blank", "width=760,height=900,menubar=no,toolbar=no,location=no,status=no");
			if (win === null) return;
			win.document.open();
			win.document.write(html);
			win.document.close();
			win.focus();
		}
		//#endregion
		//#region \0dsh-css:D:\claw\temp\deepseek-harness\packages\client\ui-message-pin\src\client\PinMessageAction.module.css.mjs
		const css = ".lY1era_action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.lY1era_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}";
		const tagId = "dsh-plugin-pin-window/PinMessageAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-pin-window";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PinMessageAction_module_css_default = { "action": "lY1era_action" };
		//#endregion
		//#region src/client/PinMessageAction.tsx
		/**
		* Per-message pin control: one button in the assistant message's IconActions
		* row. Opens a display-only popup window with that message's whole turn.
		* @module dsh-plugin-pin-window/client/PinMessageAction
		*/
		/** File paths one tool result reports having created or changed. */
		function producedPathsOf(root) {
			if (!("kind" in root) || root.kind !== "tool-result") return [];
			const view = root.callView;
			if (view == null) return [];
			if (view.card !== "diff" && !(view.card === "generic" && view.kind === "edit")) return [];
			const paths = [];
			for (const location of view.locations ?? []) {
				const path = location?.path;
				if (typeof path === "string") paths.push(path);
			}
			return paths;
		}
		/** First line of reasoning text, for the collapsed summary. */
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		/** Deduplicate produced paths in first-seen order. */
		function collectProducedFiles(items) {
			const seen = /* @__PURE__ */ new Set();
			const produced = [];
			for (const item of items) {
				if (item.kind !== "tool") continue;
				for (const path of producedPathsOf(item.root)) {
					if (seen.has(path)) continue;
					seen.add(path);
					produced.push(path);
				}
			}
			return produced;
		}
		/**
		* Build the pinned-turn view from the conversation snapshot.
		* @param snapshot - the live session snapshot.
		* @param messageId - the selected assistant message id.
		* @returns the turn content to render, or undefined when the message is gone.
		*/
		function buildPinView(snapshot, messageId, sessionId) {
			const target = snapshot.nodes.find((candidate) => candidate.kind === "assistant" && candidate.messageId === messageId);
			if (target?.kind !== "assistant") return void 0;
			const items = [];
			const nodeKeys = [];
			const reasoningFirstLines = [];
			const keys = snapshot.chat.locations.getTurn(target.turn);
			for (const key of keys) {
				const viewNode = snapshot.chat.nodes.get(key);
				if (viewNode === void 0) continue;
				if (viewNode.kind !== "user" && viewNode.kind !== "steering") nodeKeys.push(key);
				if (viewNode.kind === "assistant-step") {
					const data = viewNode.data;
					if (data.blocks !== void 0 && data.blocks.length > 0) {
						items.push({
							kind: "assistant",
							blocks: data.blocks
						});
						for (const block of data.blocks) if (block.kind === "reasoning") reasoningFirstLines.push(firstLine(block.text));
					}
				} else if (viewNode.kind === "tool-call") {
					const data = viewNode.data;
					if (data.root !== void 0) items.push({
						kind: "tool",
						root: data.root
					});
				}
			}
			if (items.length === 0) items.push({
				kind: "assistant",
				blocks: target.blocks
			});
			return {
				sessionId,
				turn: target.turn,
				model: target.provenance === void 0 ? "—" : `${target.provenance.provider} / ${target.provenance.model}`,
				time: target.time,
				items,
				producedFiles: collectProducedFiles(items),
				nodeKeys,
				reasoningFirstLines
			};
		}
		/**
		* One message's pin control.
		* @param props - the owner's message identity, the framework session hook, and
		* the namespace-bound translation seat.
		* @returns the pin button.
		*/
		function PinMessageAction({ messageId, useSession, sessionId, t }) {
			const pin = useSession((snapshot) => buildPinView(snapshot, messageId, sessionId));
			const label = t("action.pin");
			const open = (0, react.useCallback)(() => {
				if (pin === void 0) return;
				openPinWindow(pin, t);
			}, [pin, t]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label,
				side: "bottom",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: PinMessageAction_module_css_default.action,
					"aria-label": label,
					onClick: open,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, {})
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `pin` namespace dictionaries. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"action.pin": "固定消息",
			"window.title": "已固定消息",
			"window.assistant": "助手消息",
			"window.model": "模型",
			"window.time": "时间",
			"window.reasoning": "思考过程",
			"window.toolCall": "工具调用",
			"window.image": "图片内容（无法在新窗口显示）",
			"window.empty": "这条消息没有可显示的文本内容",
			"window.other": "其他内容"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"action.pin": "Pin message",
			"window.title": "Pinned message",
			"window.assistant": "Assistant message",
			"window.model": "Model",
			"window.time": "Time",
			"window.reasoning": "Reasoning",
			"window.toolCall": "Tool call",
			"window.image": "Image content (cannot display in this window)",
			"window.empty": "This message has no displayable text",
			"window.other": "Other content"
		};
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "pin";
		/** Required services: the slot registry, the copy, and session navigation. */
		const inject = [
			"slots",
			"locale",
			"sessions"
		];
		/** Escape a value for safe use inside a CSS attribute selector string. */
		function escapeAttr(value) {
			return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
		}
		/** Find a chat-flow seat by its key. */
		function findSeat(seatKey) {
			return document.querySelector(`[data-chat-flow-key="${escapeAttr(seatKey)}"]`);
		}
		/** Map a forwarded `b<n>` button id back to the nth button in the seat. */
		function findButtonByIndex(seat, btnId) {
			const match = /^b(\d+)$/.exec(btnId);
			if (match === null) return null;
			const index = Number(match[1]);
			return Array.from(seat.querySelectorAll("button"))[index] ?? null;
		}
		/** Small promise delay. */
		function delay(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms));
		}
		/**
		* Expand the seat's collapsed rows so the DOM matches the popup clone's
		* all-expanded state, click the button at the forwarded index, then restore
		* the rows that were collapsed before.
		*/
		async function clickForwardedButton(seat, btnId) {
			const originallyCollapsed = Array.from(seat.querySelectorAll("[data-disclosure-row][data-expandable]")).filter((row) => !(row.parentElement?.hasAttribute("data-open") ?? false));
			for (const row of originallyCollapsed) row.click();
			if (originallyCollapsed.length > 0) await delay(200);
			const button = findButtonByIndex(seat, btnId);
			if (button === null) return false;
			button.click();
			if (originallyCollapsed.length > 0) {
				await delay(160);
				for (const row of originallyCollapsed) if (row.isConnected && (row.parentElement?.hasAttribute("data-open") ?? false)) row.click();
			}
			return true;
		}
		/** Handle a forwarded button click from a pin popup. */
		async function handlePinWindowMessage(ctx, event) {
			const data = event.data;
			if (data === null || data.dshPinWindow !== true) return;
			if (typeof data.sessionId !== "string" || typeof data.seatKey !== "string" || typeof data.btnId !== "string") return;
			if (event.origin !== window.location.origin) return;
			const open = ctx.sessions.open;
			const sessionDeadline = Date.now() + 3e3;
			while (ctx.sessions.list.getSnapshot().current !== data.sessionId) {
				if (Date.now() > sessionDeadline) return;
				try {
					open(data.sessionId);
				} catch {}
				await delay(150);
			}
			let seat = findSeat(data.seatKey);
			const seatDeadline = Date.now() + 3e3;
			while (seat === null && Date.now() < seatDeadline) {
				await delay(150);
				seat = findSeat(data.seatKey);
			}
			if (seat === null) return;
			await clickForwardedButton(seat, data.btnId);
		}
		/**
		* Client plugin body: the per-message pin entry in the assistant action strip,
		* plus the message listener that services forwarded clicks from pin popups.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-message-pin: dictionaries");
			ctx.effect(() => {
				const listener = (event) => {
					handlePinWindowMessage(ctx, event);
				};
				window.addEventListener("message", listener);
				return () => {
					window.removeEventListener("message", listener);
				};
			}, "ui-message-pin: popup click forwarder");
			ctx.slots.inject("conversation.chat.assistant-actions", () => {
				const dispose = ctx.slots.register({
					name: "conversation.chat.assistant-actions",
					id: "pin",
					order: 20,
					locale: NS
				}, PinMessageAction);
				return () => {
					dispose();
				};
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

