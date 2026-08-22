import { MockProvider } from './mock-provider.js';

export function createProvider(environment = process.env) {
  const providerName = environment.WAYFINDER_PROVIDER ?? 'mock';
  if (providerName === 'mock') return new MockProvider();
  throw new Error(`Unsupported Wayfinder provider: ${providerName}`);
}
