import NodeClam from 'clamscan';
import { Readable } from 'node:stream';

let clientPromise: ReturnType<typeof createClient> | undefined;

function createClient() {
  return new NodeClam().init({
    removeInfected: false,
    clamdscan: {
      host: process.env.CLAMAV_HOST ?? '127.0.0.1',
      port: Number(process.env.CLAMAV_PORT ?? 3310),
      timeout: Number(process.env.CLAMAV_TIMEOUT_MS ?? 30000),
    },
  });
}

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
}

export async function pingClamAv(): Promise<boolean> {
  try {
    const client = await getClient();
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

export async function scanFile(buffer: Buffer): Promise<{ isInfected: boolean }> {
  const client = await getClient();
  const stream = Readable.from(buffer);
  const { isInfected } = await client.scanStream(stream);
  return { isInfected: Boolean(isInfected) };
}
