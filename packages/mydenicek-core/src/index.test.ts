import { describe, expect, it } from 'vitest';
import { helloWorld } from './index';

describe('helloWorld', () => {
  it('returns the correct greeting', () => {
    expect(helloWorld()).toBe('Hello from mydenicek-core!');
  });
});
