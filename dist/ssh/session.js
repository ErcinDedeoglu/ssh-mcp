import { EventEmitter } from 'node:events';
import { Client } from 'ssh2';
import { DEFAULT_KEEPALIVE_INTERVAL_MS, DEFAULT_KEEPALIVE_COUNT_MAX, DEFAULT_IDLE_TIMEOUT_MS, DEFAULT_MAX_RECONNECT_ATTEMPTS, DEFAULT_BASE_RECONNECT_DELAY_MS, DEFAULT_MAX_RECONNECT_DELAY_MS, DEFAULT_CONNECTION_TIMEOUT_SECONDS, MS_PER_SECOND, calculateReconnectDelay, safeEmitError, } from './session.types.js';
import { buildSshConnectConfig } from './session-connect-config.io.js';
export class SessionKeeper extends EventEmitter {
    config;
    options;
    sshClient;
    connected = false;
    intentionalDisconnect = false;
    reconnecting = false;
    reconnectAttempt = 0;
    _lastActivity = 0;
    reconnectTimer = null;
    constructor(config, options = {}) {
        super();
        this.config = config;
        this.options = {
            keepaliveIntervalMs: options.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS,
            keepaliveCountMax: options.keepaliveCountMax ?? DEFAULT_KEEPALIVE_COUNT_MAX,
            idleTimeoutMs: options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
            maxReconnectAttempts: options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
            baseReconnectDelayMs: options.baseReconnectDelayMs ?? DEFAULT_BASE_RECONNECT_DELAY_MS,
            maxReconnectDelayMs: options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS,
            jumpStream: options.jumpStream,
            keys: options.keys,
        };
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
    get lastActivity() {
        return this._lastActivity;
    }
    get isJumpConnection() {
        return this.options.jumpStream !== undefined;
    }
    get isIdle() {
        return this._lastActivity !== 0 && Date.now() - this._lastActivity > this.options.idleTimeoutMs;
    }
    touch() {
        this._lastActivity = Date.now();
    }
    healthCheck() {
        const status = {
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
    connect() {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timeoutMs = (this.config.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS) * MS_PER_SECOND;
            const timeoutId = setTimeout(() => {
                if (settled)
                    return;
                settled = true;
                const err = new Error(`Connection timeout after ${timeoutMs}ms`);
                safeEmitError(this, err);
                this.sshClient.destroy();
                reject(err);
            }, timeoutMs);
            const onReady = () => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timeoutId);
                this.connected = true;
                this.intentionalDisconnect = false;
                this.reconnectAttempt = 0;
                this.touch();
                this.emit('connected', this.config.id);
                resolve();
            };
            const onError = (err) => {
                if (settled) {
                    safeEmitError(this, err);
                    return;
                }
                settled = true;
                clearTimeout(timeoutId);
                safeEmitError(this, err);
                reject(err);
            };
            this.sshClient.once('ready', onReady);
            this.sshClient.once('error', onError);
            const connectConfig = buildSshConnectConfig(this.config, this.options);
            this.sshClient.connect(connectConfig);
        });
    }
    disconnect() {
        this.intentionalDisconnect = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnecting = false;
        this.sshClient.end();
    }
    setupEventHandlers() {
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
        this.sshClient.on('error', (err) => {
            if (!this.intentionalDisconnect)
                safeEmitError(this, err);
        });
    }
    startReconnection() {
        if (this.reconnectAttempt >= this.options.maxReconnectAttempts) {
            this.reconnecting = false;
            this.emit('max-retries-reached', this.reconnectAttempt);
            return;
        }
        this.reconnecting = true;
        this.reconnectAttempt++;
        const delay = calculateReconnectDelay(this.reconnectAttempt, this.options.baseReconnectDelayMs, this.options.maxReconnectDelayMs);
        this.emit('reconnecting', this.reconnectAttempt, delay);
        this.reconnectTimer = setTimeout(() => this.attemptReconnect(), delay);
    }
    attemptReconnect() {
        this.sshClient = new Client();
        this.setupReconnectEventHandlers();
        const connectConfig = buildSshConnectConfig(this.config, this.options);
        this.sshClient.connect(connectConfig);
    }
    setupReconnectEventHandlers() {
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
        this.sshClient.once('error', () => this.startReconnection());
    }
}
//# sourceMappingURL=session.js.map