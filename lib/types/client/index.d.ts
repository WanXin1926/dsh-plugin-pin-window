import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';

/** Required services: the slot registry and the copy. */
export declare const inject: string[];
/** Client plugin body: registers the per-message pin entry. */
export declare function apply(ctx: ClientContext): void;
