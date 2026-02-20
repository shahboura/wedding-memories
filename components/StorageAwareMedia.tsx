/**
 * Storage-aware media component for local storage.
 *
 * Images use Next.js <Image unoptimized> to get blur placeholders and layout
 * shift prevention without double-optimization (sharp already generates WebP
 * variants at upload time). Modal images use raw <img> for pinch-zoom
 * compatibility. Videos use native <video> elements.
 */

import Image from 'next/image';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n } from './I18nProvider';
import type { MediaProps } from '../utils/types';
import { isMobileDevice } from '../utils/device';
import { Play, Video } from 'lucide-react';

interface StorageAwareMediaProps extends Omit<MediaProps, 'id' | 'public_id'> {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onMouseEnter?: () => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onLoad?: () => void;
  draggable?: boolean;
  poster?: string;
  controls?: boolean;
  context?: 'gallery' | 'modal' | 'thumb';
  /** Next.js Image placeholder mode */
  placeholder?: 'blur' | 'empty';
  /** Base64 blur data URL for Next.js Image blur placeholder */
  blurDataURL?: string;
}

export function StorageAwareMedia({
  src,
  alt,
  width = 720,
  height = 480,
  resource_type,
  className,
  sizes,
  priority = false,
  blurDataUrl,
  blurDataURL,
  placeholder: _placeholder,
  style,
  onClick,
  onMouseEnter,
  tabIndex,
  onKeyDown,
  onLoad,
  draggable = true,
  poster,
  controls,
  context = 'gallery',
}: StorageAwareMediaProps) {
  const widthNum = width;
  const heightNum = height;
  const { t } = useI18n();

  // Resolve blur data URL from either source (Next.js convention or MediaProps)
  const resolvedBlurDataURL = blurDataURL || blurDataUrl;

  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    // For modal context, don't show loading state initially
    if (context === 'modal') return false;
    return true;
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasRequestedLoadRef = useRef(false);
  // Tracks whether the video has ever decoded frame data. Once true, we never
  // show the pulsing skeleton again — the browser keeps the last decoded frame
  // visible during seeks/buffering, so our overlay would just cause flicker.
  const hasEverHadDataRef = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [isMobile] = useState(isMobileDevice);
  const isDesktop = !isMobile;
  const [hasFrame, setHasFrame] = useState(false);
  const srcRef = useRef(src);
  const isGalleryView = context === 'gallery' ? !controls : false;

  // Keep srcRef in sync with current src (must be in effect, not render)
  useEffect(() => {
    srcRef.current = src;
  }, [src]);

  useEffect(() => {
    hasRequestedLoadRef.current = false;
    hasEverHadDataRef.current = false;
  }, [src]);

  const ensureVideoReady = useCallback((preloadMode: 'metadata' | 'auto') => {
    const video = videoRef.current;
    if (!video) return;

    // Rank preload levels so we only call load() when upgrading, never when
    // already at or above the requested level.  Calling video.load() restarts
    // the entire resource fetch (WHATWG spec) — redundant calls cause duplicate
    // network requests and flicker on Edge / Firefox.
    const PRELOAD_RANK: Record<string, number> = { none: 0, metadata: 1, auto: 2 };
    const currentRank = PRELOAD_RANK[video.preload] ?? 0;
    const requestedRank = PRELOAD_RANK[preloadMode];

    if (currentRank < requestedRank) {
      video.preload = preloadMode;
    }

    if (!hasRequestedLoadRef.current || currentRank < requestedRank) {
      video.load();
      hasRequestedLoadRef.current = true;
    }
  }, []);

  // Intersection Observer: lazily upgrade preload when video scrolls into view.
  // This avoids downloading metadata for off-screen videos on mobile data.
  // Intersection Observer: lazily upgrade preload when video scrolls into view.
  // Videos with context="thumb" are no longer rendered through this component
  // (the modal filmstrip uses static placeholders for videos instead).
  useEffect(() => {
    if (resource_type !== 'video' || context === 'modal') return;

    // Reset frame state when src changes (e.g., gallery refetch assigns new URL)
    setHasFrame(false);

    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && video.preload === 'none') {
          ensureVideoReady('metadata');
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [resource_type, context, src, ensureVideoReady]);

  useEffect(() => {
    if (resource_type !== 'video') return;

    const video = videoRef.current;
    if (!video) return;

    // Set initial loading state only if video isn't already loaded
    setLoadError(false);

    // Check if video is already loaded before setting loading state
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      hasEverHadDataRef.current = true;
      setIsLoading(false);
    } else if (!hasEverHadDataRef.current) {
      setIsLoading(true);
    }

    const handleLoadedMetadata = () => {
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      // Video is ready to play
      hasEverHadDataRef.current = true;
      setIsLoading(false);
    };

    const handleWaiting = () => {
      // Only show skeleton during initial load, not mid-playback buffering.
      // Browsers keep the last decoded frame visible during seeks, so our
      // pulsing overlay would just cause flicker (especially on Firefox).
      if (!hasEverHadDataRef.current) {
        setIsLoading(true);
      }
    };

    const handleStalled = () => {
      if (!hasEverHadDataRef.current) {
        setIsLoading(true);
      }
    };

    const handlePlaying = () => {
      hasEverHadDataRef.current = true;
      setIsLoading(false);
    };

    const handleError = () => {
      setLoadError(true);
      setIsLoading(false);
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      hasEverHadDataRef.current = true;
      setIsLoading(false);
      return;
    }

    const handleLoadStart = () => {
      // Only show skeleton during initial load — not when re-loading a video
      // that has already rendered frames (e.g., preload upgrade from metadata
      // to auto during playback).
      if (!hasEverHadDataRef.current) {
        setIsLoading(true);
      }
      setLoadError(false);
    };

    // Add event listeners
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
    };
  }, [resource_type, context, src]);

  const handlePlay = () => {
    const video = videoRef.current;
    if (video && video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      ensureVideoReady('auto');
    }
    setIsLoading(false);
  };

  const handleVideoInteraction = () => {
    ensureVideoReady('metadata');
  };

  if (resource_type === 'video') {
    // Use regular video element
    return (
      <div
        ref={containerRef}
        className="relative group w-full h-full"
        onClick={() => {
          handleVideoInteraction();
          onClick?.();
        }}
        onMouseEnter={() => {
          handleVideoInteraction();
          onMouseEnter?.();
          // Desktop hover play for gallery context
          if (isDesktop && context === 'gallery' && videoRef.current) {
            ensureVideoReady('auto');
            videoRef.current.play().catch(() => {});
          }
        }}
        onMouseLeave={() => {
          // Desktop hover pause for gallery context
          if (isDesktop && context === 'gallery' && videoRef.current) {
            videoRef.current.pause();
          }
        }}
        onFocus={handleVideoInteraction}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
      >
        {isLoading && !loadError && context !== 'modal' && (
          <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 animate-pulse rounded-lg" />
        )}

        {loadError && (
          <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 rounded-lg flex items-center justify-center">
            <div className="text-center text-gray-600 dark:text-gray-300">
              <div className="text-sm font-medium mb-1">{t('common.videoUnavailable')}</div>
              <div className="text-xs opacity-75">{t('common.failedToLoad')}</div>
            </div>
          </div>
        )}

        {/* Video placeholder: gradient + icon shown until first frame is extracted */}
        {!hasFrame && !loadError && context !== 'modal' && (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg flex items-center justify-center">
            <div className="bg-white/10 rounded-full p-3 backdrop-blur-sm">
              <Play className="text-white/70 w-6 h-6" fill="white" fillOpacity={0.5} />
            </div>
          </div>
        )}

        {/* Play overlay for gallery view - only shown after first frame is visible */}
        {context === 'gallery' && !controls && hasFrame && !isLoading && !loadError && (
          <div
            className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-200 rounded-lg flex items-center justify-center overflow-hidden"
            onClick={(e) => {
              // For gallery videos, ensure video is ready before playing
              const video = videoRef.current;
              if (video && !controls) {
                e.stopPropagation();
                if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                  // Prepare video for play
                  ensureVideoReady('auto');
                  setIsLoading(true);
                  video.addEventListener(
                    'canplay',
                    () => {
                      setIsLoading(false);
                      video.play().catch(() => {
                        // Fallback if autoplay fails
                        setIsLoading(false);
                      });
                    },
                    { once: true }
                  );
                } else {
                  video.play().catch(() => {
                    // Video play failed, user will need to try again
                  });
                }
              }
            }}
          >
            <div className="bg-black/70 rounded-full opacity-90 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm shadow-lg p-4">
              <Play className="text-white w-4 h-4" fill="white" />
            </div>
          </div>
        )}

        {/* Video indicator icon - always visible for videos */}
        <Video className="absolute top-2 right-2 w-4 h-4 text-white drop-shadow-lg z-10" />

        <video
          ref={videoRef}
          src={src}
          className={`${className} opacity-100 w-full h-full object-contain`}
          style={style}
          controls={controls}
          poster={poster}
          onPlay={handlePlay}
          draggable={draggable}
          playsInline
          muted={isGalleryView}
          preload={context === 'modal' ? 'metadata' : 'none'}
          disablePictureInPicture={isMobile}
          onLoadedMetadata={() => {
            // Force show first frame so the browser renders a visible poster
            // instead of a black rectangle (not all browsers do this automatically).
            // Guard: only seek if the browser has actually buffered data at 0.1s.
            // Firefox with preload="metadata" often buffers zero video frames,
            // so seeking to an unbuffered position aborts the in-progress fetch
            // and throws DOMException ("fetching process…aborted by the user agent").
            const video = videoRef.current;
            if (context !== 'modal' && video && video.currentTime === 0) {
              if (video.buffered.length > 0 && video.buffered.end(0) >= 0.1) {
                video.currentTime = 0.1;
              }
            }
          }}
          onSeeked={() => {
            // First frame has been rendered — hide the placeholder overlay.
            // Guard against stale events: if src changed while seeking,
            // the IntersectionObserver effect already reset hasFrame to false.
            if (context !== 'modal' && videoRef.current?.src.endsWith(srcRef.current)) {
              setHasFrame(true);
            }
          }}
        />
      </div>
    );
  }

  // For modal context, render image directly without wrapper
  if (context === 'modal') {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt={alt}
        width={widthNum}
        height={heightNum}
        className={`${className} transition-opacity duration-300`}
        style={{
          objectFit: 'contain',
          objectPosition: 'center',
          ...style,
        }}
        loading={priority ? 'eager' : 'lazy'}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onLoad={() => {
          setIsLoading(false);
          onLoad?.();
        }}
        onLoadStart={() => setIsLoading(true)}
        draggable={draggable}
      />
    );
  }

  // For gallery/thumb contexts, use wrapper with aspect ratio
  return (
    <div
      className="relative"
      style={
        context === 'thumb'
          ? { width: '80px', height: '80px' }
          : { aspectRatio: `${widthNum}/${heightNum}` }
      }
    >
      {/* Loading skeleton — hidden when blur placeholder is available */}
      {isLoading && !resolvedBlurDataURL && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-800 animate-pulse rounded-lg" />
      )}

      <Image
        unoptimized
        src={src}
        alt={alt}
        width={widthNum}
        height={heightNum}
        sizes={sizes}
        priority={priority}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        style={{
          objectFit: 'contain',
          objectPosition: 'center',
          ...style,
        }}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onLoad={() => {
          setIsLoading(false);
          onLoad?.();
        }}
        draggable={draggable}
        {...(resolvedBlurDataURL
          ? { placeholder: 'blur' as const, blurDataURL: resolvedBlurDataURL }
          : {})}
      />
    </div>
  );
}
