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
		/** Very small markdown renderer for the popup; output is always escaped first. */
		function renderInline(raw) {
			const codeSpans = [];
			let s = escapeHtml(raw);
			s = s.replace(/`([^`]+)`/g, (_match, code) => {
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
		/** Render a block sequence for one text body. */
		function renderMarkdown(text) {
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
					out.push(`<pre class="code"><code${langAttr}>${escapeHtml(code.join("\n"))}</code></pre>`);
					continue;
				}
				const heading = /^(#{1,6})\s+(.*)$/.exec(line);
				if (heading !== null) {
					const level = heading[1]?.length ?? 0;
					out.push(`<h${level}>${renderInline(heading[2] ?? "")}</h${level}>`);
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
					out.push(renderMarkdown(inner.join("\n")));
					out.push("</blockquote>");
					continue;
				}
				if (isUlMarker(line)) {
					const { items, next } = collectList(lines, i, isUlMarker);
					i = next;
					out.push("<ul>");
					for (const item of items) out.push(`<li>${renderInline(item)}</li>`);
					out.push("</ul>");
					continue;
				}
				if (isOlMarker(line)) {
					const { items, next } = collectList(lines, i, isOlMarker);
					i = next;
					out.push("<ol>");
					for (const item of items) out.push(`<li>${renderInline(item)}</li>`);
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
				out.push(`<p>${renderInline(paragraph.join("<br>"))}</p>`);
			}
			return out.join("");
		}
		/** Render one assistant content block. */
		function renderBlock(block, t) {
			switch (block.kind) {
				case "text": return `<section class="block text">${renderMarkdown(block.text)}</section>`;
				case "reasoning": return `<details class="block reasoning"><summary>${escapeHtml(t("window.reasoning"))}</summary><div class="reasoning-body">${renderMarkdown(block.text)}</div></details>`;
				case "tool-call": return `<section class="block tool"><div class="tool-name">${escapeHtml(t("window.toolCall"))} · ${escapeHtml(block.name)}</div><pre class="tool-args">${escapeHtml(block.argsRaw)}</pre></section>`;
				case "image": return `<section class="block image">${escapeHtml(t("window.image"))}</section>`;
				case "other": return `<section class="block other"><pre>${escapeHtml(JSON.stringify(block.block, null, 2))}</pre></section>`;
			}
		}
		/** Render one assistant step's visible blocks (tool-call heads are tool rows). */
		function renderAssistantItem(blocks, t) {
			return blocks.filter((block) => block.kind !== "tool-call").map((block) => renderBlock(block, t)).join("");
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
		/** Render one tool call root: running call head or settled call + result. */
		function renderToolRoot(root, t) {
			if ("kind" in root && root.kind === "tool-result") {
				const settled = root;
				const name = settled.call?.name ?? settled.callId;
				const args = settled.call?.argsRaw ?? "";
				const content = toolContentText(settled.content);
				const errorClass = settled.isError ? " error" : "";
				const errorLine = settled.isError && settled.error !== void 0 ? `<div class="tool-error">${escapeHtml(`${settled.error.name}: ${settled.error.code}`)}</div>` : "";
				return `<section class="block tool"><div class="tool-name">${escapeHtml(t("window.toolCall"))} · ${escapeHtml(name)}</div>${args.length > 0 ? `<pre class="tool-args">${escapeHtml(args)}</pre>` : ""}${content.length > 0 ? `<pre class="tool-result${errorClass}">${escapeHtml(content)}</pre>` : ""}${errorLine}</section>`;
			}
			const running = root;
			return `<section class="block tool running"><div class="tool-name">${escapeHtml(t("window.toolCall"))} · ${escapeHtml(running.name)}</div><pre class="tool-args">${escapeHtml(running.argsRaw)}</pre></section>`;
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
  --pin-error: #c62828;
}
:root[data-dark="true"] {
  --pin-bg: #17181a;
  --pin-fg: #e6e6e6;
  --pin-muted: #9ca3af;
  --pin-border: #2a2c30;
  --pin-code-bg: #202225;
  --pin-link: #7aa2f7;
  --pin-error: #ff6b6b;
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
.tool-args,
.tool-result {
  margin: 0 0 8px;
  padding: 10px 12px;
  background: var(--pin-code-bg);
  border: 1px solid var(--pin-border);
  border-radius: 8px;
  font: 12px/1.5 "Cascadia Code", Consolas, "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.tool-result.error { border-color: var(--pin-error); }
.tool-error { color: var(--pin-error); font-size: 12px; margin-top: 6px; }
.image { color: var(--pin-muted); font-style: italic; }
.empty { color: var(--pin-muted); }
`;
		/** Build the full popup document for one pinned turn. */
		function buildDocument(pin, t) {
			const dark = typeof document !== "undefined" && document.body.hasAttribute("data-ds-dark-theme");
			const title = t("window.title");
			const model = pin.model;
			const time = pin.time > 0 ? new Date(pin.time).toLocaleString() : "—";
			const body = pin.items.length === 0 ? `<p class="empty">${escapeHtml(t("window.empty"))}</p>` : pin.items.map((item) => {
				if (item.kind === "assistant") return renderAssistantItem(item.blocks, t);
				return renderToolRoot(item.root, t);
			}).join("");
			return `<!doctype html>
<html lang="zh-CN" data-dark="${dark ? "true" : "false"}">
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
        <span>${escapeHtml(t("window.assistant"))}</span>
        <span>${escapeHtml(t("window.model"))}: ${escapeHtml(model)}</span>
        <span>${escapeHtml(t("window.time"))}: ${escapeHtml(time)}</span>
      </div>
    </header>
    ${body}
  </main>
</body>
</html>`;
		}
		/**
		* Open the display-only pin window for a selected assistant message turn.
		* @param pin - the pinned turn content.
		* @param t - dictionary access (namespace `pin`).
		*/
		function openPinWindow(pin, t) {
			const html = buildDocument(pin, t);
			const win = window.open("", "_blank", "width=760,height=900,menubar=no,toolbar=no,location=no,status=no");
			if (win === null) return;
			win.document.open();
			win.document.write(html);
			win.document.close();
			try {
				win.opener = null;
			} catch {}
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
		/**
		* Build the pinned-turn view from the conversation snapshot.
		* @param snapshot - the live session snapshot.
		* @param messageId - the selected assistant message id.
		* @returns the turn content to render, or undefined when the message is gone.
		*/
		function buildPinView(snapshot, messageId) {
			const target = snapshot.nodes.find((candidate) => candidate.kind === "assistant" && candidate.messageId === messageId);
			if (target?.kind !== "assistant") return void 0;
			const items = [];
			const keys = snapshot.chat.locations.getTurn(target.turn);
			for (const key of keys) {
				const viewNode = snapshot.chat.nodes.get(key);
				if (viewNode === void 0) continue;
				if (viewNode.kind === "assistant-step") {
					const data = viewNode.data;
					if (data.blocks !== void 0 && data.blocks.length > 0) items.push({
						kind: "assistant",
						blocks: data.blocks
					});
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
				turn: target.turn,
				model: target.provenance === void 0 ? "—" : `${target.provenance.provider} / ${target.provenance.model}`,
				time: target.time,
				items
			};
		}
		/**
		* One message's pin control.
		* @param props - the owner's message identity, the framework session hook, and
		* the namespace-bound translation seat.
		* @returns the pin button.
		*/
		function PinMessageAction({ messageId, useSession, t }) {
			const pin = useSession((snapshot) => buildPinView(snapshot, messageId));
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
		/** Required services: the slot registry and the copy. */
		const inject = ["slots", "locale"];
		/**
		* Client plugin body: the per-message pin entry in the assistant action strip.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-message-pin: dictionaries");
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

