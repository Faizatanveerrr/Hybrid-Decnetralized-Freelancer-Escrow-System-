import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');

/** Minimal .env reader (KEY="value" or KEY=value). */
export const readEnv = () => {
  const out = {};
  if (!fs.existsSync(ENV_PATH)) return out;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/);
    if (m) out[m[1]] = m[2];
  }
  return { ...out, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k in out || /^(SEPOLIA_RPC_URL|DEPLOYER_PRIVATE_KEY|ARBITRATOR_PRIVATE_KEY|TOKEN_ADDRESS)$/.test(k))) };
};

/** Set KEY="value" in .env (replace the line if present, else append). */
export const setEnv = (key, value) => {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${key}="${value}"`;
  const re = new RegExp(`^\\s*#?\\s*${key}\\s*=.*$`, 'm');
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '\n')}${line}\n`;
  fs.writeFileSync(ENV_PATH, text);
};
