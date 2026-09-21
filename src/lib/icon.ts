import { toolbarAction } from './platform/action';

/** What the toolbar button is saying right now. */
export type IconState = 'unconfigured' | 'configured' | 'saved';

const SIZES = [16, 32, 48, 128] as const;

const PREFIX: Record<IconState, string> = {
  unconfigured: 'grey-',
  configured: '',
  saved: 'saved-',
};

export function iconPaths(state: IconState): Record<number, string> {
  const paths: Record<number, string> = {};
  for (const size of SIZES) paths[size] = `icon/${PREFIX[state]}${size}.png`;
  return paths;
}

/**
 * Setting an icon can fail for reasons nothing can be done about — the
 * tab closed between the lookup and the answer, most often. A toolbar
 * that did not repaint is not worth an unhandled rejection.
 */
export async function setIcon(state: IconState, tabId?: number): Promise<void> {
  try {
    await toolbarAction().setIcon({
      path: iconPaths(state),
      ...(tabId === undefined ? {} : { tabId }),
    });
  } catch {
    // The tab is gone. Nothing to repaint.
  }
}
