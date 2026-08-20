import type { ActionDeps } from '../actions/types.js';
/**
 * Builds an ActionDeps bundle from what a tool wrapper receives.
 * Fields not provided default to empty instances - safe because each tool's
 * action only touches the registries that tool historically received.
 */
export declare function partialDeps(partial: Partial<ActionDeps>): ActionDeps;
//# sourceMappingURL=deps.d.ts.map