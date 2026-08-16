/**
 * Message pin plugin, browser half: the Pin entry in the
 * conversation.chat.assistant-actions strip. Clicking it opens a display-only
 * popup window that renders only the selected assistant message.
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

/**
 * Client plugin body: the per-message pin entry in the assistant action strip.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-message-pin: dictionaries')

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
