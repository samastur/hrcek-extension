import { afterAll, beforeAll } from 'vitest';
import {
  FAKE_IDENTIFIER,
  FAKE_PASSWORD,
  FAKE_TOKEN,
  startFakeHrcek,
  type FakeHrcek,
} from '../fake-hrcek/server';
import { runContractSuite } from './suite';

let fake: FakeHrcek;

beforeAll(async () => {
  fake = await startFakeHrcek(0);
});
afterAll(async () => {
  await fake.close();
});

runContractSuite(
  'fake',
  () => ({
    baseUrl: fake.url,
    token: FAKE_TOKEN,
    runId: crypto.randomUUID(),
  }),
  { identifier: FAKE_IDENTIFIER, password: FAKE_PASSWORD },
);
