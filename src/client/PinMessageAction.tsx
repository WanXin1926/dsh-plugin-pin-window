/**
 * Per-message pin control: one button in the assistant message's IconActions
 * row. Opens a display-only popup window with that message's whole turn.
 * @module dsh-plugin-pin-window/client/PinMessageAction
 */

import { useCallback } from 'react'
import { IconRightUpOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  AssistantBlock, ConversationSnapshot, ToolCallBlock,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { PinMessageActionProps } from './slots.ts'
import { openPinWindow, type PinTurnItem, type PinTurnView } from './pin-window.ts'
import css from './PinMessageAction.module.css'

/**
 * Build the pinned-turn view from the conversation snapshot.
 * @param snapshot - the live session snapshot.
 * @param messageId - the selected assistant message id.
 * @returns the turn content to render, or undefined when the message is gone.
 */
function buildPinView(snapshot: ConversationSnapshot, messageId: string): PinTurnView | undefined {
  const target = snapshot.nodes.find(candidate =>
    candidate.kind === 'assistant' && candidate.messageId === messageId)
  if (target?.kind !== 'assistant') return undefined

  const items: PinTurnItem[] = []
  const keys = snapshot.chat.locations.getTurn(target.turn)
  for (const key of keys) {
    const viewNode = snapshot.chat.nodes.get(key)
    if (viewNode === undefined) continue
    if (viewNode.kind === 'assistant-step') {
      const data = viewNode.data as { blocks?: readonly AssistantBlock[] }
      if (data.blocks !== undefined && data.blocks.length > 0) {
        items.push({ kind: 'assistant', blocks: data.blocks })
      }
    } else if (viewNode.kind === 'tool-call') {
      const data = viewNode.data as { root?: ToolCallBlock }
      if (data.root !== undefined) items.push({ kind: 'tool', root: data.root })
    }
  }

  // Fallback: if the turn locations yield nothing (e.g. an older projection),
  // render the selected message's own blocks alone.
  if (items.length === 0) {
    items.push({ kind: 'assistant', blocks: target.blocks })
  }

  return {
    turn: target.turn,
    model: target.provenance === undefined
      ? '—'
      : `${target.provenance.provider} / ${target.provenance.model}`,
    time: target.time,
    items,
  }
}

/**
 * One message's pin control.
 * @param props - the owner's message identity, the framework session hook, and
 * the namespace-bound translation seat.
 * @returns the pin button.
 */
export function PinMessageAction({ messageId, useSession, t }: PinMessageActionProps) {
  const pin = useSession(snapshot => buildPinView(snapshot, messageId))

  const label = t('action.pin')
  const open = useCallback(() => {
    if (pin === undefined) return
    openPinWindow(pin, t)
  }, [pin, t])

  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        className={css.action}
        aria-label={label}
        onClick={open}
      >
        <IconRightUpOutline16 />
      </button>
    </Tooltip>
  )
}
