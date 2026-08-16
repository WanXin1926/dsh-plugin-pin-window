/**
 * Message pin plugin, browser half: the Pin entry in the
 * conversation.chat.assistant-actions strip. Clicking it opens a popup window
 * that clones the live-rendered turn DOM. The popup stays display-only except
 * for two affordances: code-block copy runs locally in the popup, and every
 * other cloned button forwards its click back here so the original React
 * handler performs the real action (open file, Inspect, etc.).
 * @module dsh-plugin-pin-window/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the ui-conversation SlotMap merge (the assistant-actions entry).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { PinMessageAction } from './PinMessageAction.tsx'
import { en, zh } from './locales.ts'

export type { PinMessageActionProps } from './slots.ts'
export type { MessagePinKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'pin'

/** Required services: the slot registry, the copy, and session navigation. */
export const inject = ['slots', 'locale', 'sessions']

/** Escape a value for safe use inside a CSS attribute selector string. */
function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Find a chat-flow seat by its key. */
function findSeat(seatKey: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-chat-flow-key="${escapeAttr(seatKey)}"]`)
}

/** Map a forwarded `b<n>` button id back to the nth button in the seat. */
function findButtonByIndex(seat: Element, btnId: string): HTMLButtonElement | null {
  const match = /^b(\d+)$/.exec(btnId)
  if (match === null) return null
  const index = Number(match[1])
  return Array.from(seat.querySelectorAll<HTMLButtonElement>('button'))[index] ?? null
}

/** Small promise delay. */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Expand the seat's collapsed rows so the DOM matches the popup clone's
 * all-expanded state, click the button at the forwarded index, then restore
 * the rows that were collapsed before.
 */
async function clickForwardedButton(seat: HTMLElement, btnId: string): Promise<boolean> {
  const rows = Array.from(seat.querySelectorAll<HTMLElement>('[data-disclosure-row][data-expandable]'))
  const originallyCollapsed = rows.filter(row =>
    !(row.parentElement?.hasAttribute('data-open') ?? false))
  for (const row of originallyCollapsed) row.click()
  if (originallyCollapsed.length > 0) await delay(200)

  const button = findButtonByIndex(seat, btnId)
  if (button === null) return false
  button.click()

  if (originallyCollapsed.length > 0) {
    await delay(160)
    for (const row of originallyCollapsed) {
      if (row.isConnected && (row.parentElement?.hasAttribute('data-open') ?? false)) {
        row.click()
      }
    }
  }
  return true
}

/** Handle a forwarded button click from a pin popup. */
async function handlePinWindowMessage(ctx: ClientContext, event: MessageEvent): Promise<void> {
  const data = event.data as {
    dshPinWindow?: boolean
    sessionId?: string
    seatKey?: string
    btnId?: string
  } | null
  if (data === null || data.dshPinWindow !== true) return
  if (typeof data.sessionId !== 'string' || typeof data.seatKey !== 'string' || typeof data.btnId !== 'string') return
  if (event.origin !== window.location.origin) return

  // The opener may have refreshed or switched sessions. Navigate back to the
  // session that owns the pinned message before resolving its seat.
  const open = ctx.sessions.open as unknown as (id: string) => void
  const sessionDeadline = Date.now() + 3000
  while (ctx.sessions.list.getSnapshot().current !== data.sessionId) {
    if (Date.now() > sessionDeadline) return
    try { open(data.sessionId) } catch { /* session not in the list yet; retry */ }
    await delay(150)
  }

  let seat = findSeat(data.seatKey)
  const seatDeadline = Date.now() + 3000
  while (seat === null && Date.now() < seatDeadline) {
    await delay(150)
    seat = findSeat(data.seatKey)
  }
  if (seat === null) return

  await clickForwardedButton(seat, data.btnId)
}

/**
 * Client plugin body: the per-message pin entry in the assistant action strip,
 * plus the message listener that services forwarded clicks from pin popups.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-pin: dictionaries')

  ctx.effect(() => {
    const listener = (event: MessageEvent): void => { void handlePinWindowMessage(ctx, event) }
    window.addEventListener('message', listener)
    return () => { window.removeEventListener('message', listener) }
  }, 'ui-message-pin: popup click forwarder')

  ctx.slots.inject('conversation.chat.assistant-actions', () => {
    const dispose = ctx.slots.register({
      name: 'conversation.chat.assistant-actions',
      id: 'pin',
      order: 20,
      locale: NS,
    }, PinMessageAction)
    return () => { dispose() }
  })
}
