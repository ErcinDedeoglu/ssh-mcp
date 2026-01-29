import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const forwardPortSchema = z.object({
  serverId: z.string(),
  remoteHost: z.string().min(1, 'Remote host cannot be empty'),
  remotePort: z.number().int().positive().max(65535, 'Port must be at most 65535'),
  localHost: z.string().min(1, 'Local host cannot be empty').optional(),
  localPort: z.number().int().min(0).max(65535, 'Port must be at most 65535').optional(),
});

const closeForwardSchema = z.object({
  localPort: z.number().int().positive().max(65535, 'Port must be at most 65535'),
  localHost: z.string().min(1, 'Local host cannot be empty').optional(),
});

describe('forward_port validation', () => {
  describe('port number validation', () => {
    it('rejects negative remotePort', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: -1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero remotePort', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects remotePort above 65535', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 70000,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('65535');
      }
    });

    it('rejects non-integer remotePort', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 5432.5,
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid remotePort at boundary (65535)', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 65535,
      });
      expect(result.success).toBe(true);
    });

    it('rejects localPort above 65535', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 5432,
        localPort: 70000,
      });
      expect(result.success).toBe(false);
    });

    it('accepts localPort 0 (auto-assign)', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 5432,
        localPort: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('host validation', () => {
    it('rejects empty remoteHost', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: '',
        remotePort: 5432,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('empty');
      }
    });

    it('rejects empty localHost when provided', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 5432,
        localHost: '',
      });
      expect(result.success).toBe(false);
    });

    it('accepts special characters in host (SSH library handles resolution)', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'db-server.internal',
        remotePort: 5432,
      });
      expect(result.success).toBe(true);
    });

    it('accepts IP addresses', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: '192.168.1.100',
        remotePort: 5432,
      });
      expect(result.success).toBe(true);
    });

    it('accepts localhost', () => {
      const result = forwardPortSchema.safeParse({
        serverId: 'test',
        remoteHost: 'localhost',
        remotePort: 5432,
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('close_forward validation', () => {
  it('rejects negative localPort', () => {
    const result = closeForwardSchema.safeParse({ localPort: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects zero localPort', () => {
    const result = closeForwardSchema.safeParse({ localPort: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects localPort above 65535', () => {
    const result = closeForwardSchema.safeParse({ localPort: 70000 });
    expect(result.success).toBe(false);
  });

  it('rejects empty localHost when provided', () => {
    const result = closeForwardSchema.safeParse({ localPort: 5432, localHost: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid port and optional host', () => {
    const result = closeForwardSchema.safeParse({ localPort: 5432 });
    expect(result.success).toBe(true);
  });
});
