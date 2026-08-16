/**
 * The pin entry's props. The target 'conversation.chat.assistant-actions'
 * slot is declared and typed by ui-conversation; this package only contributes
 * the entry, so no SlotMap merge lives here.
 * @module dsh-plugin-pin-window/client/slots
 */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls this package's LocaleNamespaceMap merge (the 'pin' seat).
import type {} from './locales.ts'

/** Full props of one assistant-message pin entry. */
export type PinMessageActionProps =
  PropsRuntime<'conversation.chat.assistant-actions'>
  & PropsLocale<'pin'>
