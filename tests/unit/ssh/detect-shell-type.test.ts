import { describe, it, expect } from 'vitest';
import { detectShellType } from '../../../src/ssh/shell-adapter.js';

describe('detectShellType', () => {
  describe('powershell prompts', () => {
    it.each([
      ['PS C:\\Users\\ercin>', 'standard Windows PS prompt'],
      ['PS C:\\Users\\ercin> ', 'trailing space'],
      ['PS /home/ercin>', 'PowerShell Core on Linux (pwsh)'],
      ['PS C:\\Users\\admin\\Documents\\project>', 'deep nested path'],
      ['PS /usr/local/bin>', 'pwsh in Linux system path'],
      ['PS \\\\server\\share>', 'UNC network path'],
    ])('detects from %s (%s)', (prompt) => {
      expect(detectShellType(prompt)).toBe('powershell');
    });

    it('detects with multiline banner before prompt', () => {
      const text = 'Windows PowerShell\nCopyright (C) Microsoft\n\nPS C:\\Users\\admin>';
      expect(detectShellType(text)).toBe('powershell');
    });

    it('detects PowerShell 7 banner + prompt', () => {
      const text = 'PowerShell 7.4.1\nPS C:\\Users\\user> ';
      expect(detectShellType(text)).toBe('powershell');
    });
  });

  describe('cmd.exe prompts', () => {
    it.each([
      ['C:\\Users\\ercin>', 'standard C: drive'],
      ['C:\\Users\\ercin> ', 'trailing space'],
      ['D:\\Projects>', 'D: drive'],
      ['E:\\>', 'root of E: drive'],
    ])('detects from %s (%s)', (prompt) => {
      expect(detectShellType(prompt)).toBe('cmd');
    });

    it('detects with Windows version banner', () => {
      const text =
        'Microsoft Windows [Version 10.0.19045]\n(c) Microsoft Corp.\n\nC:\\Users\\admin>';
      expect(detectShellType(text)).toBe('cmd');
    });
  });

  describe('posix prompts', () => {
    it.each([
      ['user@host:~$ ', 'bash dollar prompt'],
      ['root@server:/# ', 'root hash prompt'],
      ['user@host ~ % ', 'zsh percent prompt'],
      ['$ ', 'minimal dollar prompt'],
      ['# ', 'minimal root prompt'],
      ['bash-5.1$ ', 'bash version prompt'],
      ['sh-5.1# ', 'sh version prompt'],
    ])('detects from %s (%s)', (prompt) => {
      expect(detectShellType(prompt)).toBe('posix');
    });

    it('detects with MOTD banner before prompt', () => {
      const text = 'Welcome to Ubuntu 22.04.3 LTS\nLast login: Mon Jan 1\n\nuser@host:~$';
      expect(detectShellType(text)).toBe('posix');
    });
  });

  describe('edge cases and ambiguity', () => {
    it('defaults to posix for empty string', () => {
      expect(detectShellType('')).toBe('posix');
    });

    it('defaults to posix for whitespace-only', () => {
      expect(detectShellType('   \n  \n  ')).toBe('posix');
    });

    it('handles CRLF line endings from Windows', () => {
      expect(detectShellType('banner\r\nPS C:\\Users\\test>\r\n')).toBe('powershell');
    });

    it('handles CRLF cmd prompt', () => {
      expect(detectShellType('banner\r\nC:\\Users\\test>\r\n')).toBe('cmd');
    });

    it('prioritizes powershell over cmd when PS prefix present', () => {
      expect(detectShellType('PS C:\\Windows\\system32>')).toBe('powershell');
    });
  });

  describe('false positive resistance — posix prompts not misdetected', () => {
    it('does not confuse ">" in posix custom prompt with cmd', () => {
      expect(detectShellType('user@host:~/project> ')).toBe('posix');
    });

    it('does not confuse fish shell > prompt with cmd', () => {
      expect(detectShellType('user@host ~/project>')).toBe('posix');
    });

    it('ignores cmd-like line in MOTD banner when prompt is posix', () => {
      // Banner line starts with drive letter path, but actual prompt is bash
      const text = 'C:\\Users\\shared>\nuser@host:~$ ';
      expect(detectShellType(text)).toBe('posix');
    });

    it('ignores PS-like text in MOTD banner when prompt is posix', () => {
      // MOTD has "PS" + space + path-like text ending with >, but prompt is bash
      const text = 'Use HTTPS proxy at port 8080>\nuser@host:~$ ';
      expect(detectShellType(text)).toBe('posix');
    });

    it('does not match "HTTPS ..." ending with > as powershell', () => {
      // Single-line: HTTPS contains "PS" substring
      expect(detectShellType('HTTPS proxy available>')).toBe('posix');
    });

    it('does not match "OPS team>" as powershell', () => {
      expect(detectShellType('OPS team report>')).toBe('posix');
    });

    it('does not match "STEPS ..." ending with > as powershell', () => {
      expect(detectShellType('STEPS to follow>')).toBe('posix');
    });

    it('does not confuse PS1_custom$ posix prompt with powershell', () => {
      expect(detectShellType('PS1_custom$ ')).toBe('posix');
    });

    it('does not confuse admin@PS-SERVER:~$ with powershell', () => {
      expect(detectShellType('admin@PS-SERVER:~$ ')).toBe('posix');
    });

    it('ignores cmd-like line in banner even with multiline CRLF', () => {
      const text = 'C:\\Logs\\app.log>\r\nuser@host:~$ ';
      expect(detectShellType(text)).toBe('posix');
    });

    it('ignores multiple cmd-like banner lines before posix prompt', () => {
      const text = [
        'Welcome to server',
        'C:\\Config\\settings>',
        'D:\\Data\\files>',
        'root@server:/#',
      ].join('\n');
      expect(detectShellType(text)).toBe('posix');
    });
  });
});
