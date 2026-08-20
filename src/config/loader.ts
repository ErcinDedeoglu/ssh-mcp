import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import type { Config } from './types.js';
import { getConfigPath, findProjectConfig, hasExplicitConfigOverride } from './path.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function loadSingleConfig(configPath: string, options: { createTemplate: boolean }): Config {
  if (!fs.existsSync(configPath)) {
    if (options.createTemplate) {
      createTemplateConfig(configPath);
      throw new Error(
        `Config file not found. Created template at ${configPath} - edit it with your servers and restart.`,
      );
    }
    throw new Error(`Config file not found: ${configPath}`);
  }

  checkPermissions(configPath);

  let rawConfig: unknown;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    rawConfig = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config file ${configPath}: ${error.message}`);
    }
    throw error;
  }

  const schema = loadSchema();
  if (!options.createTemplate) {
    // Project files may override only keys/defaults - allow zero servers
    const relaxed = JSON.parse(JSON.stringify(schema)) as {
      properties: { servers?: { minItems?: number } };
      required?: string[];
    };
    delete relaxed.properties?.servers?.minItems;
    relaxed.required = relaxed.required?.filter((r) => r !== 'servers');
    return validateConfig(rawConfig, relaxed);
  }
  return validateConfig(rawConfig, schema);
}

/** serverId -> file that defined it (set during loadConfig). */
const serverSources = new Map<string, string>();

/** Path of the config file owning a server (project or primary). */
export function getServerConfigPath(serverId: string): string | undefined {
  return serverSources.get(serverId);
}

type Defaults = NonNullable<Config['defaults']>;

function mergeDefaults(a: Defaults | undefined, b: Defaults | undefined): Defaults | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    ...a,
    ...b,
    timeouts: { ...a.timeouts, ...b.timeouts },
  };
}

export function loadConfig(options: { startDir?: string } = {}): Config {
  const primaryPath = getConfigPath();
  const primary = loadSingleConfig(primaryPath, { createTemplate: true });

  serverSources.clear();
  for (const server of primary.servers) {
    serverSources.set(server.id, primaryPath);
  }

  // Project-level overlay is disabled by explicit --config / SSH_MCP_CONFIG
  if (hasExplicitConfigOverride()) {
    return primary;
  }

  const projectPath = findProjectConfig(options.startDir ?? process.cwd());
  if (!projectPath) {
    return primary;
  }

  const project = loadSingleConfig(projectPath, { createTemplate: false });

  // Merge: project servers override by id, project keys win per name
  const byId = new Map(primary.servers.map((s) => [s.id, s]));
  for (const server of project.servers ?? []) {
    byId.set(server.id, server);
    serverSources.set(server.id, projectPath);
  }

  return {
    ...primary,
    keys: { ...primary.keys, ...project.keys },
    servers: Array.from(byId.values()),
    defaults: mergeDefaults(primary.defaults, project.defaults),
  };
}
