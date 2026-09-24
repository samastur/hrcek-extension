import { startFakeHrcek } from './server';

const port = Number(process.env.PORT ?? 8787);
const fake = await startFakeHrcek(port);
console.log(`fake-hrcek listening on ${fake.url}`);

/**
 * Playwright signals this process when the run ends. Without these
 * handlers nothing acts on the signal, the listening socket keeps the
 * event loop alive, and `playwright test` never exits — which on CI looks
 * exactly like a hung suite, because Node buffers stdout to a pipe and
 * flushes it only on exit. Every test can pass and you still see nothing.
 */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void fake.close().finally(() => process.exit(0));
  });
}
