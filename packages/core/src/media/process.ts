import sharp from 'sharp';
import { AppError } from '../lib/errors';

/**
 * Turning whatever someone uploaded into something safe to store and show.
 *
 * Three jobs, in order:
 *
 * 1. **Decide what the file really is** from its first bytes, not its name
 *    or the type the browser claimed. A `.jpg` that begins `MZ` is a Windows
 *    executable, and no amount of renaming makes it a photo.
 * 2. **Re-encode it.** The bytes we store are produced by our own encoder
 *    from the decoded pixels, so a file crafted to exploit an image parser
 *    elsewhere does not survive the trip. EXIF goes with it — holiday photos
 *    carry GPS coordinates, and nobody means to publish their home address.
 * 3. **Make a thumbnail**, so a library of two hundred images doesn't
 *    download two hundred full-size photos.
 */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export type AcceptedType = (typeof ACCEPTED_TYPES)[number];

/** Facebook's own limit for a photo is 4 MB; ours is lower before re-encoding. */
export const MAX_DIMENSION = 2048;
export const THUMB_SIZE = 400;

interface Signature {
  type: AcceptedType;
  matches: (bytes: Buffer) => boolean;
}

const SIGNATURES: Signature[] = [
  { type: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d,
  },
  {
    type: 'image/webp',
    matches: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { type: 'image/gif', matches: (b) => b.subarray(0, 6).toString('ascii').startsWith('GIF8') },
];

/** What the bytes say the file is, ignoring its name and declared type. */
export function sniffImageType(bytes: Buffer): AcceptedType | null {
  if (bytes.length < 12) return null;
  return SIGNATURES.find((signature) => signature.matches(bytes))?.type ?? null;
}

export interface ProcessedImage {
  /** Re-encoded original, within our size limits. */
  image: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  mimeType: string;
  extension: string;
  bytes: number;
}

export interface ProcessOptions {
  /** Refuse anything bigger, before decoding. */
  maxBytes: number;
  /** Animated GIFs are kept as they are; everything else becomes WebP. */
  preferWebp?: boolean;
}

export async function processImage(
  input: Buffer,
  options: ProcessOptions,
): Promise<ProcessedImage> {
  if (input.byteLength > options.maxBytes) {
    throw new AppError('VALIDATION', {
      message: `That file is larger than ${Math.round(options.maxBytes / (1024 * 1024))} MB.`,
    });
  }

  const sniffed = sniffImageType(input);
  if (!sniffed) {
    throw new AppError('VALIDATION', {
      message: 'That file is not an image we can use. JPEG, PNG, WebP or GIF, please.',
    });
  }

  let pipeline: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    // `animated` keeps every frame of a GIF; without it only the first
    // survives, which turns an animation into a still without warning.
    // `failOn: 'error'` rather than sharp's default of 'warning': plenty of
    // real photos from real phones carry a harmless warning, and refusing
    // them would be refusing the user's own camera roll. Anything genuinely
    // unreadable still throws.
    pipeline = sharp(input, { animated: sniffed === 'image/gif', failOn: 'error' });
    metadata = await pipeline.metadata();
  } catch {
    throw new AppError('VALIDATION', {
      message: 'That image could not be read. It may be damaged.',
    });
  }

  if (!metadata.width || !metadata.height) {
    throw new AppError('VALIDATION', { message: 'That image has no readable size.' });
  }

  const animated = sniffed === 'image/gif' && (metadata.pages ?? 1) > 1;
  const useWebp = (options.preferWebp ?? true) && !animated;

  const resized = pipeline.resize({
    width: Math.min(metadata.width, MAX_DIMENSION),
    height: Math.min(metadata.height, MAX_DIMENSION),
    fit: 'inside',
    withoutEnlargement: true,
  });

  // Re-encoding is what strips EXIF: sharp only carries metadata across when
  // explicitly told to, and we never tell it to.
  const image = animated
    ? await resized.gif().toBuffer()
    : useWebp
      ? await resized.webp({ quality: 86 }).toBuffer()
      : await resized.jpeg({ quality: 86 }).toBuffer();

  const thumb = await sharp(input, { animated: false, failOn: 'error' })
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const final = await sharp(image, { animated, failOn: 'error' }).metadata();

  return {
    image,
    thumb,
    width: final.width ?? metadata.width,
    height: final.height ?? metadata.height,
    mimeType: animated ? 'image/gif' : useWebp ? 'image/webp' : 'image/jpeg',
    extension: animated ? 'gif' : useWebp ? 'webp' : 'jpg',
    bytes: image.byteLength,
  };
}
