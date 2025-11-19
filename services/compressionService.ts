import Pako from 'pako';
import { SignatureSegment, SignaturePayload } from '../types';

const MAX_COORD = 65534;
const SENTINEL = 65535;
const DEFAULT_MAX_PAYLOAD_CHARS = 4096 - 256; // keep signature under ~3.8 KB
const MIN_POINTS = 40;
const DEFAULT_POINTS = 320;
const POINTS_REDUCTION_FACTOR = 0.75;

function encodeSignatureBinary(
  data: SignatureSegment[],
  canvasWidth: number,
  canvasHeight: number,
  maxPoints: number = DEFAULT_POINTS
): { rawBase64: string; compressedBase64: string | null } | null {
  const values: number[] = [];
  const totalPoints = data.reduce((sum, segment) => sum + segment.points.length, 0);
  const step = Math.max(1, Math.ceil(totalPoints / maxPoints));

  data.forEach((segment) => {
    segment.points.forEach((point, index) => {
      const keepPoint = index === 0 || index === segment.points.length - 1 || index % step === 0;
      if (!keepPoint) return;

      const x = Math.min(MAX_COORD, Math.max(0, Math.round((point.x / canvasWidth) * MAX_COORD)));
      const y = Math.min(MAX_COORD, Math.max(0, Math.round((point.y / canvasHeight) * MAX_COORD)));
      values.push(x, y);
    });
    values.push(SENTINEL, SENTINEL);
  });

  if (values.length === 2 && values[0] === SENTINEL && values[1] === SENTINEL) {
    return null;
  }

  const bytes = new Uint8Array(values.length * 2);
  values.forEach((value, idx) => {
    bytes[idx * 2] = (value >> 8) & 0xff;
    bytes[idx * 2 + 1] = value & 0xff;
  });

  let rawBinary = '';
  bytes.forEach((byte) => {
    rawBinary += String.fromCharCode(byte);
  });
  const rawBase64 = btoa(rawBinary);

  let compressedBase64: string | null = null;
  try {
    const compressed = Pako.deflate(bytes, { level: 9 });
    let compressedBinary = '';
    compressed.forEach((byte) => {
      compressedBinary += String.fromCharCode(byte);
    });
    compressedBase64 = btoa(compressedBinary);
  } catch (error) {
    console.error('Compression failed', error);
  }

  return { rawBase64, compressedBase64 };
}

export function prepareSignaturePayload(
  data: SignatureSegment[],
  width: number,
  height: number,
  maxPayloadChars: number = DEFAULT_MAX_PAYLOAD_CHARS
): SignaturePayload | null {
  let pointsLimit = DEFAULT_POINTS;

  while (pointsLimit >= MIN_POINTS) {
    const encoded = encodeSignatureBinary(data, width, height, pointsLimit);
    if (!encoded) return null;

    if (encoded.compressedBase64 && encoded.compressedBase64.length <= maxPayloadChars) {
      return { base64: encoded.compressedBase64, type: 'compressed', compression: 'deflate' };
    }

    if (encoded.rawBase64 && encoded.rawBase64.length <= maxPayloadChars) {
      return { base64: encoded.rawBase64, type: 'binary' };
    }

    const nextLimit = Math.max(MIN_POINTS, Math.floor(pointsLimit * POINTS_REDUCTION_FACTOR));
    if (nextLimit === pointsLimit) break;
    pointsLimit = nextLimit;
  }

  return null;
}
