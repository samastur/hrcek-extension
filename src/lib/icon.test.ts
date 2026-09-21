import { describe, expect, it } from 'vitest';
import { iconPaths } from './icon';

describe('iconPaths', () => {
  it('serves the plain hamster when configured but the page is not held', () => {
    expect(iconPaths('configured')).toEqual({
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    });
  });

  it('greys the hamster out when there is nothing configured', () => {
    expect(iconPaths('unconfigured')[16]).toBe('icon/grey-16.png');
  });

  it('ticks the hamster when the page is already held', () => {
    expect(iconPaths('saved')[128]).toBe('icon/saved-128.png');
  });
});
