import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Client, type ConnectConfig } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
import { isPasswordAuth, isPrivateKeyAuth } from '../config/types.js';

const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 10;
const MS_PER_SECOND = 1000;

export interface SSHConnectionEvents {
  connected: (serverId: string) => void;
  disconnected: (serverId: string) => void;
  error: (error: Error) => void;
}

export class SSHConnection extends EventEmitter {
  private readonly config: ServerConfig;
  private readonly sshClient: Client;
  private connected = false;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
    this.sshClient = new Client();
    this.setupEventHandlers();
  }

  get id(): string {
    return this.config.id;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  get client(): Client {
    return this.sshClient;
  }

  private setupEventHandlers(): void {
    this.sshClient.on('close', () => {
      this.connected = false;
      this.emit('disconnected', this.config.id);
    });

    this.sshClient.on('end', () => {
      this.connected = false;
    });
  }

  private safeEmitError(err: Error): void {
    if (this.listenerCount('error') > 0) {
      this.emit('error', err);
    }
  }

  private buildConnectConfig(): ConnectConfig {
    const timeoutSeconds = this.config.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS;
    
    const baseConfig: ConnectConfig = {
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

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutMs = (this.config.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS) * MS_PER_SECOND;

      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        const err = new Error(`Connection timeout after ${timeoutMs}ms`);
        this.safeEmitError(err);
        this.sshClient.destroy();
        reject(err);
      }, timeoutMs);

      const onReady = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        this.connected = true;
        this.emit('connected', this.config.id);
        resolve();
      };

      const onError = (err: Error): void => {
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

  disconnect(): void {
    this.sshClient.end();
  }
}
