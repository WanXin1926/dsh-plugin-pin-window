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

/** Required services: the slot registry and the copy. */
export const inject = ['slots', 'locale']

/** Escape a value for safe use inside a CSS attribute selector string. */
function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** Find a stamped button in a seat, expanding collapsed rows if needed. */
function findStampedButton(seat: Element, btnId: string): HTMLButtonElement | null {
  return seat.querySelector<HTMLButtonElement>(`[data-pin-btn="${escapeAttr(btnId)}"]`)
}

/** Handle a forwarded button click from a pin popup. */
function handlePinWindowMessage(event: MessageEvent): void {
  const data = event.data as { dshPinWindow?: boolean; seatKey?: string; btnId?: string } | null
  if (data === null || data.dshPinWindow !== true) return
  if (typeof data.seatKey !== 'string' || typeof data.btnId !== 'string') return
  if (event.origin !== window.location.origin) return

  const seat = document.querySelector<HTMLElement>(`[data-chat-flow-key="${escapeAttr(data.seatKey)}"]`)
  if (seat === null) return

  const direct = findStampedButton(seat, data.btnId)
  if (direct !== null) {
    direct.click()
    return
  }

  // The button lives in a collapsed disclosure body (e.g. Inspect). Expand
  // the seat's collapsed rows, let React materialize the button, click it,
  // then restore the rows that were collapsed before.
  const rows = Array.from(seat.querySelectorAll<HTMLElement>('[data-disclosure-row][data-expandable]'))
  const originallyCollapsed = rows.filter(row =>
    !(row.parentElement?.hasAttribute('data-open') ?? false))
  for (const row of originallyCollapsed) row.click()

  window.setTimeout(() => {
    const button = findStampedButton(seat, data.btnId)
    if (button !== null) {
      button.click()
      window.setTimeout(() => {
        for (const row of originallyCollapsed) {
          if (row.isConnected && (row.parentElement?.hasAttribute('data-open') ?? false)) {
            row.click()
          }
        }
      }, 160)
    }
  }, 200)
}

/**
 * Client plugin body: the per-message pin entry in the assistant action strip,
 * plus the message listener that services forwarded clicks from pin popups.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-pin: dictionaries')

  ctx.effect(() => {
    window.addEventListener('message', handlePinWindowMessage)
    return () => { window.removeEventListener('message', handlePinWindowMessage) }
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
