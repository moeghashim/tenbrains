import { AnthropicProvider } from './anthropic-provider.js';
import { MockProvider } from './mock-provider.js';
import { OpenAIProvider } from './openai-provider.js';

const PROVIDERS = new Set(['mock', 'anthropic', 'openai']);

function globalProviderName(environment) {
  return environment.WAYFINDER_PROVIDER
    ?? (environment.ANTHROPIC_API_KEY ? 'anthropic' : environment.OPENAI_API_KEY ? 'openai' : 'mock');
}

function surfaceSetting(environment, surface, suffix) {
  if (!surface || surface === 'global') return undefined;
  return environment[`WAYFINDER_${surface.toUpperCase()}_${suffix}`];
}

export function createProvider(environment = process.env, surface = 'global') {
  const providerName = surfaceSetting(environment, surface, 'PROVIDER') ?? globalProviderName(environment);
  if (!PROVIDERS.has(providerName)) throw new Error(`Unsupported Wayfinder provider: ${providerName}`);
  const surfaceModel = surfaceSetting(environment, surface, 'MODEL');
  if (providerName === 'mock') return new MockProvider();
  if (providerName === 'anthropic') {
    return new AnthropicProvider({
      apiKey: environment.ANTHROPIC_API_KEY,
      model: surfaceModel ?? environment.WAYFINDER_MODEL ?? 'claude-sonnet-5',
    });
  }
  return new OpenAIProvider({
    apiKey: environment.OPENAI_API_KEY,
    baseURL: environment.WAYFINDER_OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: surfaceModel ?? environment.WAYFINDER_MODEL ?? 'gpt-5.6-luna',
  });
}

export function createProviders(environment = process.env) {
  return {
    intake: createProvider(environment, 'intake'),
    session: createProvider(environment, 'session'),
  };
}
