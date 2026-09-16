import { afterAll, beforeAll } from 'vitest';
import { FAKE_TOKEN, startFakeHrcek, type FakeHrcek } from '../fake-hrcek/server';
import { runContractSuite } from './suite';

let fake: FakeHrcek;

beforeAll(async () => {
  fake = await startFakeHrcek(0);
});
afterAll(async () => {
  await fake.close();
});

runContractSuite('fake', () => ({
  baseUrl: fake.url,
  token: FAKE_TOKEN,
  runId: crypto.randomUUID(),
}));
