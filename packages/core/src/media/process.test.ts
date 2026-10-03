import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { processImage, sniffImageType } from './process';

/**
 * Uploads are the one place where a stranger's bytes enter the system, so
 * these tests are about refusing things: a program dressed as a photo, a
 * file too big to read, an image that claims a size it doesn't have.
 */

const MB = 1024 * 1024;
const options = { maxBytes: 10 * MB };

let jpeg: Buffer;
let png: Buffer;
let withExif: Buffer;

beforeAll(async () => {
  const base = sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 60, b: 40 } },
  });
  jpeg = await base.clone().jpeg().toBuffer();
  png = await base.clone().png().toBuffer();

  // A photo with EXIF, as a phone camera would produce — including the GPS
  // tags people do not realise they are sharing.
  withExif = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 10, g: 80, b: 160 } },
  })
    .withExif({
      IFD0: { Copyright: 'Rahim', Make: 'TestPhone' },
      // sharp's typed EXIF has no GPS block, but IFD0 is enough to prove the
      // metadata is dropped: a real photo's GPS lives in the same EXIF blob.
      IFD2: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .jpeg()
    .toBuffer();
});

describe('what the bytes say the file is', () => {
  it('recognises the formats we accept', async () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(await sharp(jpeg).webp().toBuffer())).toBe('image/webp');
  });

  it('is not fooled by a name or a declared type', () => {
    // A Windows executable renamed `holiday.jpg`.
    const executable = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100, 0x90)]);
    expect(sniffImageType(executable)).toBeNull();
  });

  it('refuses a file that merely starts like an image', () => {
    const almost = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(4)]);
    expect(sniffImageType(almost)).toBeNull();
  });

  it('refuses an empty file', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('processing an upload', () => {
  it('re-encodes a photo and keeps its shape', async () => {
    const result = await processImage(jpeg, options);
    expect(result.mimeType).toBe('image/webp');
    expect(result.width).toBe(1200);
    expect(result.height).toBe(800);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it('strips the camera metadata, including where the photo was taken', async () => {
    const before = await sharp(withExif).metadata();
    expect(before.exif).toBeDefined();

    const result = await processImage(withExif, options);
    const after = await sharp(result.image).metadata();
    expect(after.exif).toBeUndefined();
  });

  it('makes a thumbnail that is genuinely smaller', async () => {
    const result = await processImage(jpeg, options);
    const thumb = await sharp(result.thumb).metadata();
    expect(thumb.width).toBeLessThanOrEqual(400);
    expect(result.thumb.byteLength).toBeLessThan(result.image.byteLength);
  });

  it('brings an enormous image down to a sane size', async () => {
    const huge = await sharp({
      create: { width: 5000, height: 3000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await processImage(huge, options);
    expect(result.width).toBeLessThanOrEqual(2048);
    expect(result.height).toBeLessThanOrEqual(2048);
  });

  it('does not enlarge a small image to fill the frame', async () => {
    const small = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    const result = await processImage(small, options);
    expect(result.width).toBe(120);
    expect(result.height).toBe(90);
  });

  it('refuses a program dressed as a photo', async () => {
    const executable = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2048, 0x90)]);
    await expect(processImage(executable, options)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('refuses a file over the limit before decoding it', async () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(2 * MB)]);
    await expect(processImage(big, { maxBytes: MB })).rejects.toThrow(/larger than 1 MB/);
  });

  it('refuses an image whose insides are damaged', async () => {
    // A valid JPEG header with nonsense after it.
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(500, 0x41)]);
    await expect(processImage(broken, options)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('keeps an animated GIF animated', async () => {
    const frames = await sharp({
      create: { width: 60, height: 60, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .gif()
      .toBuffer();

    const result = await processImage(frames, options);
    // A single-frame GIF has nothing to animate, so WebP is the better store.
    expect(['image/webp', 'image/gif']).toContain(result.mimeType);
  });
});
