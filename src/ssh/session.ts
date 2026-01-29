// SessionKeeper: manages SSH connection lifecycle with keepalive and auto-reconnection.
import { EventEmitter } from 'node:events';
import { Client } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
import {
  DEFAULT_KEEPALIVE_INTERVAL_MS,
  DEFAULT_KEEPALIVE_COUNT_MAX,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_BASE_RECONNECT_DELAY_MS,
  DEFAULT_MAX_RECONNECT_DELAY_MS,
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  MS_PER_SECOND,
  type SessionKeeperOptions,
  type HealthStatus,
} from './session.types.js';
import { buildSshConnectConfig } from './session-connect-config.io.js';

export type { SessionKeeperOptions, HealthStatus };
export type { SessionKeeperEvents } from './session.types.js';

export class SessionKeeper extends EventEmitter {
  private readonly config: ServerConfig;
  private readonly options: Required<SessionKeeperOptions>;
  private sshClient: Client;
  private connected = false;
  private intentionalDisconnect = false;
  private reconnecting = false;
  private reconnectAttempt = 0;
  private _lastActivity = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ServerConfig, options: SessionKeeperOptions = {}) {
    super();
    this.config = config;
    this.options = {
      keepaliveIntervalMs: options.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS,
      keepaliveCountMax: options.keepaliveCountMax ?? DEFAULT_KEEPALIVE_COUNT_MAX,
      idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
      baseReconnectDelayMs: options.baseReconnectDelayMs ?? DEFAULT_BASE_RECONNECT_DELAY_MS,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS,
    };
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

  get username(): string {
    return this.config.username;
  }

  get lastActivity(): number {
    return this._lastActivity;
  }

  get isIdle(): boolean {
    if (this._lastActivity === 0) return false;
    return Date.now() - this._lastActivity > this.options.idleTimeoutMs;
  }

  touch(): void {
    this._lastActivity = Date.now();
  }

  healthCheck(): HealthStatus {
    const status: HealthStatus = {
      connected: this.connected,
      idle: this.isIdle,
      reconnecting: this.reconnecting,
      lastActivity: this._lastActivity,
    };
    if (this.reconnecting) {
      status.reconnectAttempt = this.reconnectAttempt;
    }
    return status;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutMs =
        (this.config.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS) * MS_PER_SECOND;

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
        this.intentionalDisconnect = false;
        this.reconnectAttempt = 0;
        this.touch();
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

      const connectConfig = buildSshConnectConfig(this.config, this.options);
      this.sshClient.connect(connectConfig);
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    this.sshClient.end();
  }

  private setupEventHandlers(): void {
    this.sshClient.on('close', () => {
      this.connected = false;
      this.emit('disconnected', this.config.id);
      if (!this.intentionalDisconnect) {
        this.startReconnection();
      }
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

  private calculateReconnectDelay(attempt: number): number {
    const delay = this.options.baseReconnectDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.options.maxReconnectDelayMs);
  }

  private startReconnection(): void {
    if (this.reconnectAttempt >= this.options.maxReconnectAttempts) {
      this.reconnecting = false;
      this.emit('max-retries-reached', this.reconnectAttempt);
      return;
    }
    this.reconnecting = true;
    this.reconnectAttempt++;
    const delay = this.calculateReconnectDelay(this.reconnectAttempt);
    this.emit('reconnecting', this.reconnectAttempt, delay);
    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  private attemptReconnect(): void {
    this.sshClient = new Client();
    this.setupReconnectEventHandlers();
    const connectConfig = buildSshConnectConfig(this.config, this.options);
    this.sshClient.connect(connectConfig);
  }

  private setupReconnectEventHandlers(): void {
    this.sshClient.once('ready', () => {
      this.connected = true;
      this.reconnecting = false;
      const attempts = this.reconnectAttempt;
      this.reconnectAttempt = 0;
      this.touch();
      this.emit('reconnected', attempts);
      this.emit('connected', this.config.id);
      this.setupEventHandlers();
    });

    this.sshClient.once('error', () => {
      this.startReconnection();
    });
  }
}
