/**
 * Local media optimization utilities.
 *
 * This module generates local image variant URLs (thumb/medium) and
 * returns direct URLs for videos.
 */

import type { MediaProps } from './types';

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
 * Simple media prefetch utility for immediate use (like on hover)
 */
function simpleMediaPrefetch(url: string, resourceType: 'image' | 'video'): void {
  if (typeof window === 'undefined') return;

  const existing = document.querySelector(`link[href="${url}"]`);
  if (!existing) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = resourceType;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}

/**
 * Prefetch media on user interaction (hover, focus)
 */
export function prefetchMediaOnInteraction(
  item: MediaProps,
  quality: 'thumb' | 'medium' | 'full' = 'full'
): void {
  const url = getOptimizedMediaUrl(item.public_id, item.resource_type, quality);
  simpleMediaPrefetch(url, item.resource_type);
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
  const { priority = false, quality = 'medium' } = options;

  if (item.resource_type === 'video') {
    // For thumbnail context, generate a static image thumbnail instead of video
    if (context === 'thumb') {
      return {
        src: item.public_id,
        alt: `Wedding video thumbnail${item.guestName && item.guestName !== 'Unknown Guest' ? ` shared by ${item.guestName}` : ''}`,
        width: 180,
        height: 120,
        sizes: getResponsiveMediaSizes(context),
        priority: false,
        loading: 'lazy' as const,
        resource_type: 'video' as const,
        format: item.format as string,
        context,
      };
    }

    // Videos use direct URLs since we don't generate video variants yet
    const videoSrc = getOptimizedMediaUrl(
      item.public_id,
      item.resource_type,
      context === 'gallery' ? 'medium' : 'full'
    );

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
