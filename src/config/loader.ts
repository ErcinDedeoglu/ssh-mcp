import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import type { Config } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function getConfigPath(): string {
  // Priority: CLI arg > env var > default
  const cliIndex = process.argv.indexOf('--config');
  if (cliIndex !== -1 && process.argv[cliIndex + 1]) {
    return expandHome(process.argv[cliIndex + 1]);
  }

  if (process.env.SSH_MCP_CONFIG) {
    return expandHome(process.env.SSH_MCP_CONFIG);
  }

  return path.join(os.homedir(), '.ssh-mcp', 'config.json');
}

function getSchemaPath(): string {
  return path.resolve(__dirname, '../../config.schema.json');
}

const GROUP_AND_OTHERS_PERMISSION_MASK = 0o077;

const CONFIG_TEMPLATE = {
  _comment: 'SSH-MCP Configuration - Edit this file and restart. Delete _comment fields.',
  keys: {
    _comment: 'Define SSH keys here, reference by name in servers below',
    'my-key':
      '-----BEGIN OPENSSH PRIVATE KEY-----\n...paste your key here...\n-----END OPENSSH PRIVATE KEY-----',
  },
  servers: [
    {
      _comment: 'Example server - duplicate and modify for your servers',
      id: 'my-server',
      host: 'example.com',
      port: 22,
      username: 'ubuntu',
      auth: {
        privateKey: 'my-key',
      },
      description: 'My example server',
    },
  ],
  defaults: {
    timeouts: {
      connection: 10,
      command: 60,
      idle: 900,
    },
  },
};

function createTemplateConfig(configPath: string): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const content = JSON.stringify(CONFIG_TEMPLATE, null, 2);
  fs.writeFileSync(configPath, content, { mode: 0o600 });
}

function checkPermissions(filePath: string): void {
  if (process.platform === 'win32') {
    return;
  }

  const stats = fs.statSync(filePath);
  const mode = stats.mode & 0o777;
  const hasGroupOrOthersAccess = (mode & GROUP_AND_OTHERS_PERMISSION_MASK) !== 0;

  if (hasGroupOrOthersAccess) {
    throw new Error(
      `Insecure file permissions on ${filePath}. ` +
        `Expected 0600 or stricter, got ${mode.toString(8).padStart(4, '0')}. ` +
        `Run: chmod 600 ${filePath}`,
    );
  }
}

function loadSchema(): object {
  const schemaPath = getSchemaPath();
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  return JSON.parse(schemaContent);
}

function validateConfig(config: unknown, schema: object): Config {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  if (!validate(config)) {
    const errors = validate.errors?.map((e) => `${e.instancePath || '/'}: ${e.message}`).join('; ');
    throw new Error(`Config schema validation failed: ${errors}`);
  }

  return config as Config;
}

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    createTemplateConfig(configPath);
    throw new Error(
      `Config file not found. Created template at ${configPath} - edit it with your servers and restart.`,
    );
  }

  checkPermissions(configPath);

  let rawConfig: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    rawConfig = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file: ${error.message}`);
    }
    throw error;
  }

  const schema = loadSchema();
  return validateConfig(rawConfig, schema);
}
