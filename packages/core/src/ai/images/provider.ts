import sharp from 'sharp';
import { AppError } from '../../lib/errors';

/**
 * Making a picture.
 *
 * Unlike text, where the AI SDK is already one interface over many
 * providers, image models differ enough — aspect handling, safety
 * responses, output formats — that a small interface of our own earns its
 * place. Everything above it works in bytes and aspect ratios.
 *
 * No real provider is configured yet: that needs an API key and costs money
 * per image. The stub below produces a plain branded placeholder so the
 * whole path — prompt writing, generation, processing, storage, attaching,
 * publishing — runs and can be tested, and everything it makes is labelled
 * as a stub wherever it appears.
 */

export type ImageAspect = '1:1' | '4:5' | '16:9';

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  aspect: ImageAspect;
}

export interface GeneratedImage {
  bytes: Buffer;
  mimeType: string;
  /** Which provider made it; stored with the image and shown to the user. */
  provider: string;
  /** True when no model was involved. */
  stub: boolean;
}

export interface ImageProvider {
  readonly id: string;
  generate(request: ImageRequest): Promise<GeneratedImage>;
}

export const ASPECT_SIZES: Record<ImageAspect, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '4:5': { width: 1024, height: 1280 },
  '16:9': { width: 1280, height: 720 },
};

/**
 * A deterministic placeholder in the brand colours, with the prompt written
 * across it so it is unmistakably not a photograph. It exercises the whole
 * pipeline without an API key or a bill.
 */
export function createStubImageProvider(): ImageProvider {
  return {
    id: 'stub',
    async generate(request) {
      const { width, height } = ASPECT_SIZES[request.aspect];
      const words = request.prompt.trim().slice(0, 120);

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5b3df5"/>
      <stop offset="55%" stop-color="#a155f7"/>
      <stop offset="100%" stop-color="#ff6b4a"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width / 22)}" fill="#ffffff" opacity="0.95">Placeholder image</text>
  <text x="50%" y="54%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width / 34)}" fill="#ffffff" opacity="0.8">${escapeXml(words)}</text>
</svg>`;

      const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
      return { bytes, mimeType: 'image/png', provider: 'stub', stub: true };
    },
  };
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/gu,
    (char) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char,
  );
}

let provider: ImageProvider | undefined;

export function setImageProvider(next: ImageProvider | undefined): void {
  provider = next;
}

/**
 * The provider in use. Only the stub exists so far, so this says so plainly
 * rather than pretending an image model is wired up.
 */
export function getImageProvider(): ImageProvider {
  if (provider) return provider;
  provider = createStubImageProvider();
  return provider;
}

export function assertImageGenerationAvailable(): void {
  if (getImageProvider().id === 'stub') return;
  throw new AppError('PLATFORM_ERROR', { message: 'Image generation is not set up.' });
}
