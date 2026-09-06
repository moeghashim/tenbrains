import { loadServerEnvironment } from './env.js';
import { providerStatus } from './provider-config.js';
import { loginCommands } from './subscription-auth.js';

await loadServerEnvironment();
const [command, provider] = process.argv.slice(2);
if (command === 'status' && !provider) {
  const { providers } = await providerStatus();
  for (const item of providers) console.log(`${item.id}: ${item.status}; ${item.reason}${item.source ? ` Source: ~/${item.source} (${item.found ? 'found' : 'not found'}); expiry: ${item.expiresAt ?? 'unknown'}.` : ''}`);
  if (process.env.WAYFINDER_AUTH_HOME) console.log('Credential sources use WAYFINDER_AUTH_HOME rather than the real home directory.');
} else if (command === 'login' && loginCommands[provider]) {
  console.log(`Run in your terminal: ${loginCommands[provider]}`);
  console.log('This command prints instructions only; it does not launch a browser or collect credentials. After signing in, run npm run auth -- status.');
} else {
  console.error('Usage: npm run auth -- status | login <claude-subscription|codex-subscription|grok-subscription>');
  process.exitCode = 1;
}
