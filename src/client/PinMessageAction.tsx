/**
 * Per-message pin control: one button in the assistant message's IconActions
 * row. Opens a display-only popup window with just that message.
 * @module dsh-plugin-pin-window/client/PinMessageAction
 */

import { useCallback } from 'react'
import { IconRightUpOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PinMessageActionProps } from './slots.ts'
import { openPinWindow } from './pin-window.ts'
import css from './PinMessageAction.module.css'

/**
 * One message's pin control.
 * @param props - the owner's message identity, the framework session hook, and
 * the namespace-bound translation seat.
 * @returns the pin button.
 */
export function PinMessageAction({ messageId, useSession, t }: PinMessageActionProps) {
  const node = useSession((snapshot) => {
    const match = snapshot.nodes.find(candidate =>
      candidate.kind === 'assistant' && candidate.messageId === messageId)
    return match?.kind === 'assistant' ? match : undefined
  })

  const label = t('action.pin')
  const open = useCallback(() => {
    if (node === undefined) return
    openPinWindow(node, t)
  }, [node, t])

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
