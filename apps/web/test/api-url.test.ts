import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from '../src/api/client';

describe('resolveApiUrl', () => {
  it('uses the local API in dev when nothing is configured', () => {
    expect(resolveApiUrl(undefined, true)).toBe('http://localhost:3001');
  });

  it('uses same-origin relative URLs in a production build when nothing is configured', () => {
    expect(resolveApiUrl(undefined, false)).toBe('');
  });

  it('lets an explicit VITE_API_URL win in both modes, without a trailing slash', () => {
    expect(resolveApiUrl('http://localhost:4000/', true)).toBe('http://localhost:4000');
    expect(resolveApiUrl('https://api.example.com', false)).toBe('https://api.example.com');
  });

  it('treats an explicit empty value as same-origin even in dev', () => {
    expect(resolveApiUrl('', true)).toBe('');
  });
});
