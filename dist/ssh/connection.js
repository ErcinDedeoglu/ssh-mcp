import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Client } from 'ssh2';
import { isPasswordAuth, isPrivateKeyAuth } from '../config/types.js';
const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 10;
const MS_PER_SECOND = 1000;
export class SSHConnection extends EventEmitter {
    config;
    sshClient;
    connected = false;
    constructor(config) {
        super();
        this.config = config;
        this.sshClient = new Client();
        this.setupEventHandlers();
    }
    get id() {
        return this.config.id;
    }
    get isConnected() {
        return this.connected;
    }
    get client() {
        return this.sshClient;
    }
    get username() {
        return this.config.username;
    }
    setupEventHandlers() {
        this.sshClient.on('close', () => {
            this.connected = false;
            this.emit('disconnected', this.config.id);
        });
        this.sshClient.on('end', () => {
            this.connected = false;
        });
    }
    safeEmitError(err) {
        if (this.listenerCount('error') > 0) {
            this.emit('error', err);
        }
    }
    buildConnectConfig() {
        const timeoutSeconds = this.config.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS;
        const baseConfig = {
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            readyTimeout: timeoutSeconds * MS_PER_SECOND,
        };
        if (isPasswordAuth(this.config.auth)) {
            return {
                ...baseConfig,
                password: this.config.auth.password,
            };
        }
        if (isPrivateKeyAuth(this.config.auth)) {
            const privateKeyContent = fs.readFileSync(this.config.auth.privateKey, 'utf-8');
            return {
                ...baseConfig,
                privateKey: privateKeyContent,
                passphrase: this.config.auth.passphrase,
            };
        }
        throw new Error('Invalid authentication configuration');
    }
    connect() {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutMs = (this.config.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS) * MS_PER_SECOND;
            const timeoutId = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                const err = new Error(`Connection timeout after ${timeoutMs}ms`);
                this.safeEmitError(err);
                this.sshClient.destroy();
                reject(err);
            }, timeoutMs);
            const onReady = () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timeoutId);
                this.connected = true;
                this.emit('connected', this.config.id);
                resolve();
            };
            const onError = (err) => {
                if (settled) {
                    this.safeEmitError(err);
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                this.safeEmitError(err);
                reject(err);
            };
            this.sshClient.once('ready', onReady);
            this.sshClient.once('error', onError);
            const connectConfig = this.buildConnectConfig();
            this.sshClient.connect(connectConfig);
        });
    }
    disconnect() {
        this.sshClient.end();
    }
}
//# sourceMappingURL=connection.js.map