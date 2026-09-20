import { describe, expect, it } from 'vitest';
import { MAX_TOKEN_NAME_LENGTH, tokenName } from './token-name';

describe('tokenName', () => {
  it('says which client and which machine it belongs to', () => {
    expect(tokenName('firefox', 'mac')).toBe('Hrček extension (Firefox on macOS)');
    expect(tokenName('chrome', 'win')).toBe('Hrček extension (Chrome on Windows)');
    expect(tokenName('firefox', 'linux')).toBe('Hrček extension (Firefox on Linux)');
  });

  it('falls back to the raw values it was given', () => {
    expect(tokenName('vivaldi', 'plan9')).toBe('Hrček extension (vivaldi on plan9)');
  });

  it('names the client even when the platform is unknown', () => {
    expect(tokenName('firefox', null)).toBe('Hrček extension (Firefox)');
  });

  it('never exceeds the length the server accepts', () => {
    const name = tokenName('a'.repeat(80), 'b'.repeat(80));

    expect(name.length).toBeLessThanOrEqual(MAX_TOKEN_NAME_LENGTH);
    expect(MAX_TOKEN_NAME_LENGTH).toBe(50);
  });
});
