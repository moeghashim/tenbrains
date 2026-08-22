import { AnthropicProvider } from './anthropic-provider.js';
import { MockProvider } from './mock-provider.js';

export function createProvider(environment = process.env) {
  const providerName = environment.WAYFINDER_PROVIDER
    ?? (environment.ANTHROPIC_API_KEY ? 'anthropic' : 'mock');
  if (providerName === 'mock') return new MockProvider();
  if (providerName === 'anthropic') {
    return new AnthropicProvider({
      apiKey: environment.ANTHROPIC_API_KEY,
      model: environment.WAYFINDER_MODEL ?? 'claude-sonnet-5',
    });
  }
  throw new Error(`Unsupported Wayfinder provider: ${providerName}`);
}
