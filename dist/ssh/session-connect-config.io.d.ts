import type { Duplex } from 'node:stream';
import type { ConnectConfig } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
import { type SessionKeeperOptions } from './session.types.js';
type OptionsWithJumpStream = Omit<Required<SessionKeeperOptions>, 'jumpStream' | 'keys'> & {
    jumpStream?: Duplex;
    keys?: Record<string, string>;
};
export declare function buildSshConnectConfig(serverConfig: ServerConfig, options: OptionsWithJumpStream): ConnectConfig;
export {};
//# sourceMappingURL=session-connect-config.io.d.ts.map