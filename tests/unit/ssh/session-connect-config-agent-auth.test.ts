import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildSshConnectConfig } from '../../../src/ssh/session-connect-config.io.js';
import type {
  ServerConfig,
  AgentAuth,
  PrivateKeyAuth,
  PasswordAuth,
} from '../../../src/config/types.js';

const AGENT_SOCK = '/tmp/agent.sock.123';

function makeServer(auth: AgentAuth | PrivateKeyAuth | PasswordAuth): ServerConfig {
  return { id: 'srv', host: 'h', port: 22, username: 'u', auth };
}

const baseOptions = {
  keepaliveIntervalMs: 30000,
  keepaliveCountMax: 5,
  maxReconnectAttempts: 5,
  baseReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  idleTimeoutMs: 900000,
};

describe('agent auth (auth: { agent: true })', () => {
  const originalSock = process.env.SSH_AUTH_SOCK;

  it('attaches the agent and stores no key material', () => {
    process.env.SSH_AUTH_SOCK = AGENT_SOCK;
    try {
      const config = buildSshConnectConfig(makeServer({ agent: true }), baseOptions);
      expect(config.agent).toBe(AGENT_SOCK);
      expect(config.privateKey).toBeUndefined();
      expect(config.password).toBeUndefined();
    } finally {
      if (originalSock === undefined) delete process.env.SSH_AUTH_SOCK;
      else process.env.SSH_AUTH_SOCK = originalSock;
    }
  });

  it('throws a clear error when no agent is running', () => {
    delete process.env.SSH_AUTH_SOCK;
    try {
      expect(() => buildSshConnectConfig(makeServer({ agent: true }), baseOptions)).toThrow(
        /SSH_AUTH_SOCK is not set/,
      );
    } finally {
      if (originalSock !== undefined) process.env.SSH_AUTH_SOCK = originalSock;
    }
  });
});

describe('privateKey file paths with ~ expansion', () => {
  const originalSock = process.env.SSH_AUTH_SOCK;

  beforeEach(() => {
    process.env.SSH_AUTH_SOCK = AGENT_SOCK;
  });

  afterEach(() => {
    if (originalSock === undefined) delete process.env.SSH_AUTH_SOCK;
    else process.env.SSH_AUTH_SOCK = originalSock;
  });

  it('reads a key via ~ (home-relative path)', () => {
    const keyFile = path.join(os.tmpdir(), `ssh-mcp-key-test-${Date.now()}`);
    fs.writeFileSync(keyFile, 'FAKE KEY MATERIAL\n');
    try {
      const homeRelative = `~${keyFile.slice(os.homedir().length)}`;
      // ensure the tmp file actually lives under home (macOS: /var vs /private/var)
      const rel = path.relative(os.homedir(), keyFile);
      const tildePath = rel.startsWith('..') ? null : `~/${rel}`;
      const usePath = tildePath ?? keyFile;
      void homeRelative;

      const config = buildSshConnectConfig(makeServer({ privateKey: usePath }), baseOptions);
      expect(config.privateKey).toBe('FAKE KEY MATERIAL\n');
    } finally {
      fs.rmSync(keyFile, { force: true });
    }
  });

  it('still supports inline PEM, alias, and absolute paths unchanged', () => {
    const inline = buildSshConnectConfig(
      makeServer({ privateKey: '-----BEGIN FAKE-----\nabc\n-----END FAKE-----' }),
      baseOptions,
    );
    expect(inline.privateKey).toContain('BEGIN FAKE');

    const aliased = buildSshConnectConfig(makeServer({ privateKey: 'k1' }), {
      ...baseOptions,
      keys: { k1: '-----BEGIN ALIAS-----\nx\n-----END ALIAS-----' },
    });
    expect(aliased.privateKey).toContain('BEGIN ALIAS');
  });
});
