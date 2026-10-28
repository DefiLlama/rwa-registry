import { vi } from 'vitest';

vi.stubGlobal('fetch', () => {
  throw new Error('network is off in tests: inject a fake client');
});
