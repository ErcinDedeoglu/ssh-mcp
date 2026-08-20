import { registerListServersTool } from './list-servers.js';
import { registerDisconnectTool } from './disconnect.js';
import { registerExecuteTool } from './execute.js';
import { registerExecuteBackgroundTool } from './execute-background.js';
import { registerCheckJobTool } from './check-job.js';
import { registerCancelJobTool } from './cancel-job.js';
import { registerUploadTool } from './upload.js';
import { registerDownloadTool } from './download.js';
import { registerConnectionStatusTool } from './connection-status.js';
import { registerForwardPortTool } from './forward-port.js';
import { registerCloseForwardTool } from './close-forward.js';
import { registerListForwardsTool } from './list-forwards.js';
import { registerForwardRemotePortTool } from './forward-remote-port.js';
import { registerCloseRemoteForwardTool } from './close-remote-forward.js';
import { registerJumpConnectTool } from './jump-connect.js';
import { registerGetConsoleHistoryTool } from './get-console-history.js';
export { sanitizeError, sanitizePath } from '../utils/sanitize.js';
export { partialDeps } from './deps.js';
export function registerAllTools(server, config, pool, forwardRegistry, remoteForwardRegistry, shellRegistry, jobRegistry) {
    registerListServersTool(server, config, pool);
    registerDisconnectTool(server, pool, shellRegistry);
    registerExecuteTool(server, config, pool, forwardRegistry, shellRegistry);
    registerExecuteBackgroundTool(server, config, pool, forwardRegistry, shellRegistry, jobRegistry);
    registerCheckJobTool(server, jobRegistry);
    registerCancelJobTool(server, jobRegistry, shellRegistry);
    registerUploadTool(server, config, pool, forwardRegistry);
    registerDownloadTool(server, config, pool, forwardRegistry);
    registerConnectionStatusTool(server, config, pool, forwardRegistry);
    registerForwardPortTool(server, config, pool, forwardRegistry);
    registerCloseForwardTool(server, forwardRegistry);
    registerListForwardsTool(server, forwardRegistry, remoteForwardRegistry);
    registerForwardRemotePortTool(server, config, pool, forwardRegistry, remoteForwardRegistry);
    registerCloseRemoteForwardTool(server, pool, remoteForwardRegistry);
    registerJumpConnectTool(server, config, pool, forwardRegistry, remoteForwardRegistry);
    registerGetConsoleHistoryTool(server, shellRegistry);
}
export { registerListServersTool, registerDisconnectTool, registerExecuteTool, registerExecuteBackgroundTool, registerCheckJobTool, registerCancelJobTool, registerUploadTool, registerDownloadTool, registerConnectionStatusTool, registerForwardPortTool, registerCloseForwardTool, registerListForwardsTool, registerForwardRemotePortTool, registerCloseRemoteForwardTool, registerJumpConnectTool, registerGetConsoleHistoryTool, };
//# sourceMappingURL=index.js.map