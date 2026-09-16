import { startFakeHrcek } from './server';

const port = Number(process.env.PORT ?? 8787);
const fake = await startFakeHrcek(port);
console.log(`fake-hrcek listening on ${fake.url}`);
