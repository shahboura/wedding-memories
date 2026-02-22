/**
 * Local media optimization utilities.
 *
 * This module generates local image variant URLs (thumb/medium) and
 * returns direct URLs for videos.
 */

import type { MediaProps } from './types';
import { isMobileDevice } from './device';

const urlCache = new Map<string, string>();
const URL_CACHE_MAX_SIZE = 5000;

function getOptimizedMediaUrl(
  publicId: string,
  resourceType: 'image' | 'video',
  quality: 'thumb' | 'medium' | 'full' = 'medium'
): string {
  const cacheKey = `${publicId}-${resourceType}-${quality}`;

  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey)!;
  }

  let url: string;

  if (resourceType === 'image') {
    const match = publicId.match(/^(.*\/)([^/?#]+)\.(\w+)(\?.*)?$/);
    if (match) {
      const [, prefix, filename, , suffix = ''] = match;
      if (quality === 'thumb') {
        url = `${prefix}thumb/${filename}.webp${suffix}`;
      } else if (quality === 'medium') {
        url = `${prefix}medium/${filename}.webp${suffix}`;
      } else {
        url = publicId;
      }
    } else {
      url = publicId;
    }
  } else {
    url = publicId;
  }

  // Evict oldest entries if cache is full
  if (urlCache.size >= URL_CACHE_MAX_SIZE) {
    const firstKey = urlCache.keys().next().value;
    if (firstKey !== undefined) {
      urlCache.delete(firstKey);
    }
  }
  urlCache.set(cacheKey, url);
  return url;
}

/**
 * Generates responsive media sizes for Next.js Image component and video elements
 */
function getResponsiveMediaSizes(context: 'gallery' | 'modal' | 'thumb'): string {
  switch (context) {
    case 'gallery':
      return `
        (max-width: 640px) 100vw,
        (max-width: 1280px) 50vw,
        (max-width: 1536px) 33vw,
        25vw
      `;
    case 'modal':
      return '100vw';
    case 'thumb':
      return '180px';
    default:
      return '50vw';
  }
}

/**
 * Preload an image by creating a hidden `new Image()`.
 *
 * Why not `<link rel="prefetch">`?  Safari ignores it entirely — so every
 * iPhone user (40-60 % of wedding guests) got zero prefetch benefit.
 * `new Image().src` works in every browser, fetches at normal priority,
 * and the response lands in the HTTP cache (`Cache-Control: immutable`).
 * When the modal's `<img src="same-url">` renders, it's an instant cache hit.
 *
 * A `Set` deduplicates URLs so we never fetch the same image twice.
 * Videos are skipped — no video variants exist, so preloading would
 * download the full original file on cellular.
 */
const preloadedUrls = new Set<string>();

function preloadImage(url: string): void {
  if (typeof window === 'undefined') return;
  if (preloadedUrls.has(url)) return;

  preloadedUrls.add(url);
  const img = new Image();
  img.src = url;
}

/**
 * Preload media on user interaction (hover, focus, adjacent-item prefetch).
 * Only images are preloaded — videos are skipped to avoid downloading
 * full original files (potentially 50 MB+) on cellular.
 */
export function prefetchMediaOnInteraction(
  item: MediaProps,
  quality: 'thumb' | 'medium' | 'full' = 'medium'
): void {
  if (item.resource_type !== 'image') return;
  const url = getOptimizedMediaUrl(item.public_id, item.resource_type, quality);
  preloadImage(url);
}

/**
 * Generates optimized props for the storage-aware media component.
 */
export function getOptimizedMediaProps(
  item: MediaProps,
  context: 'gallery' | 'modal' | 'thumb' = 'gallery',
  options: {
    priority?: boolean;
    quality?: 'thumb' | 'medium' | 'full';
  } = {}
) {
  // On mobile devices, gallery items display at ~175px wide (2-column masonry).
  // The 400w thumb variant (2.3× display width) is sharp enough for Retina
  // screens while saving ~70-80% bandwidth vs the 1080w medium variant.
  const defaultQuality = context === 'gallery' && isMobileDevice() ? 'thumb' : 'medium';
  const { priority = false, quality = defaultQuality } = options;

  if (item.resource_type === 'video') {
    // Videos use direct URLs — no video variants exist, so quality param
    // is ignored by getOptimizedMediaUrl (always returns publicId as-is).
    // The quality arg below is cosmetic; if video variants are ever added,
    // this should be revisited to match the image 'medium' policy.
    const videoSrc = getOptimizedMediaUrl(item.public_id, item.resource_type, 'medium');

    return {
      src: videoSrc,
      alt: `Wedding video${item.guestName && item.guestName !== 'Unknown Guest' ? ` shared by ${item.guestName}` : ''}`,
      width: item.width,
      height: item.height,
      sizes: getResponsiveMediaSizes(context),
      priority: false, // Videos should never have priority to avoid blocking image loading
      loading: 'lazy' as const,
      resource_type: 'video' as const,
      format: item.format as string,
      controls: context === 'modal',
      context,
    };
  }

  // It's an image, use appropriate URL handling
  const imageSrc = getOptimizedMediaUrl(item.public_id, item.resource_type, quality);

  return {
    src: imageSrc,
    alt: `Wedding photo${item.guestName && item.guestName !== 'Unknown Guest' ? ` shared by ${item.guestName}` : ''}`,
    width: item.width,
    height: item.height,
    sizes: getResponsiveMediaSizes(context),
    priority,
    loading: priority ? ('eager' as const) : ('lazy' as const),
    ...(item.blurDataUrl
      ? { placeholder: 'blur' as const, blurDataURL: item.blurDataUrl }
      : { placeholder: 'empty' as const }),
    resource_type: 'image' as const,
    format: item.format as string,
    context,
  };
}
