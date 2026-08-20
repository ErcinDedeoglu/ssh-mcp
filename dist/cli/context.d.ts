import type { ActionDeps } from '../actions/types.js';
/** Builds a one-shot ActionDeps bundle for a CLI invocation. */
export declare function buildCliDeps(): ActionDeps;
/** Gracefully closes all SSH sessions opened by this invocation. */
export declare function cleanupCli(deps: ActionDeps): void;
//# sourceMappingURL=context.d.ts.map