import type { ClientChannel } from 'ssh2';
import type { SessionKeeper } from './session.js';
export interface JumpStreamOptions {
    srcHost?: string;
    srcPort?: number;
}
export declare function createJumpStream(jumpSession: SessionKeeper, targetHost: string, targetPort: number, options?: JumpStreamOptions): Promise<ClientChannel>;
//# sourceMappingURL=jump-stream.d.ts.map