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
    clientPromise = createClient().catch((err: unknown) => {
      clientPromise = undefined;
      throw err;
    });
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
  if (isInfected === true) return { isInfected: true };
  if (isInfected === false) return { isInfected: false };
  // clamd read timeout이나 응답 파싱 실패 시 NodeClam은 예외를 던지지 않고
  // isInfected: null로 resolve한다 — 감염 여부를 판정하지 못한 상태이므로
  // "정상"으로 간주하지 않고 fail-closed로 예외를 던진다.
  throw new Error('CLAMAV_INDETERMINATE');
}
