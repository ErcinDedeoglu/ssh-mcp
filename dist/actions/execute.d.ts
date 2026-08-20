import { type ActionDeps, type ActionOutcome } from './types.js';
export interface ExecuteInput {
    serverId: string;
    command: string;
    stdin?: string;
    timeout?: number;
    stallTimeout?: number | null;
    maxOutputLength?: number;
    agentForward?: boolean;
}
export interface ExecuteResult {
    serverId: string;
    command: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    truncated: boolean;
    notice?: string;
}
export declare function executeCommand(input: ExecuteInput, deps: ActionDeps): Promise<ActionOutcome<ExecuteResult>>;
//# sourceMappingURL=execute.d.ts.map