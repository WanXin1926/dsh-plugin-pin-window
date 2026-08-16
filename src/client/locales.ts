/** `pin` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.pin': '固定消息',
  'window.title': '已固定消息',
  'window.assistant': '助手消息',
  'window.model': '模型',
  'window.time': '时间',
  'window.reasoning': '思考过程',
  'window.toolCall': '工具调用',
  'window.image': '图片内容（无法在新窗口显示）',
  'window.empty': '这条消息没有可显示的文本内容',
  'window.other': '其他内容',
} satisfies Record<string, string>

/** The pin namespace key union. */
export type MessagePinKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The per-message pin control's copy. */
    pin: MessagePinKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.pin': 'Pin message',
  'window.title': 'Pinned message',
  'window.assistant': 'Assistant message',
  'window.model': 'Model',
  'window.time': 'Time',
  'window.reasoning': 'Reasoning',
  'window.toolCall': 'Tool call',
  'window.image': 'Image content (cannot display in this window)',
  'window.empty': 'This message has no displayable text',
  'window.other': 'Other content',
} satisfies Record<MessagePinKey, string>
