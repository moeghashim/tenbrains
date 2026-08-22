import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const environmentPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');

function parseValue(rawValue) {
  const value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const unquoted = value.slice(1, -1);
    return value.startsWith('"')
      ? unquoted.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"')
      : unquoted;
  }
  return value.replace(/\s+#.*$/, '').trim();
}

export function parseEnvironmentFile(source) {
  const values = {};
  for (const sourceLine of source.split(/\r?\n/)) {
    const line = sourceLine.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = parseValue(line.slice(separator + 1));
  }
  return values;
}

export async function loadServerEnvironment(environment = process.env) {
  try {
    const values = parseEnvironmentFile(await readFile(environmentPath, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (environment[key] === undefined) environment[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return environment;
}
