import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import type { Config } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getConfigPath(): string {
  const home = os.homedir();
  return path.join(home, '.ssh-mcp', 'config.json');
}

function getSchemaPath(): string {
  return path.resolve(__dirname, '../../config.schema.json');
}

const GROUP_AND_OTHERS_PERMISSION_MASK = 0o077;

function checkPermissions(filePath: string): void {
  const stats = fs.statSync(filePath);
  const mode = stats.mode & 0o777;
  const hasGroupOrOthersAccess = (mode & GROUP_AND_OTHERS_PERMISSION_MASK) !== 0;
  
  if (hasGroupOrOthersAccess) {
    throw new Error(
      `Insecure file permissions on ${filePath}. ` +
      `Expected 0600 or stricter, got ${mode.toString(8).padStart(4, '0')}. ` +
      `Run: chmod 600 ${filePath}`
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
    const errors = validate.errors
      ?.map((e) => `${e.instancePath || '/'}: ${e.message}`)
      .join('; ');
    throw new Error(`Config schema validation failed: ${errors}`);
  }
  
  return config as Config;
}

export function loadConfig(): Config {
  const configPath = getConfigPath();
  
  if (!fs.existsSync(configPath)) {
    throw new Error('Config file not found at ~/.ssh-mcp/config.json');
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
