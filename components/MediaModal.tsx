/**
 * Modal that uses the exact same cached media from the gallery - zero network requests!
 * This component reuses the already-loaded media for instant display.
 */

'use client';

import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { StorageAwareMedia } from './StorageAwareMedia';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useKeypress } from '../hooks/useKeypress';
import { useSwipeable } from 'react-swipeable';
import {
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
} from 'lucide-react';
import type { MediaProps } from '../utils/types';
import { getOptimizedMediaProps, prefetchMediaOnInteraction } from '../utils/mediaOptimization';

import { useI18n } from './I18nProvider';

interface MediaModalProps {
  items: MediaProps[];
  isOpen: boolean;
  initialIndex: number;
  onClose: () => void;
}

export function MediaModal({ items, isOpen, initialIndex, onClose }: MediaModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const { t } = useI18n();

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const mediaContainerRef = useRef<HTMLDivElement>(null);

  // ── Filmstrip native scroll ──────────────────────────────────────────
  // Scrolling updates the centered thumbnail after scroll settles.
  const filmstripRef = useRef<HTMLDivElement>(null);
  const filmstripHasScrolled = useRef(false);
  const filmstripIsUserScrolling = useRef(false);
  const filmstripScrollTimeout = useRef<number | null>(null);
  const filmstripScrollRaf = useRef<number | null>(null);
  // Map of index → button element for scrollIntoView on navigation
  const thumbElements = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Stable ref callback — only maintains the element map, no scrolling logic.
  // This never changes identity so React never churns refs on re-render.
  const setThumbRef = useCallback(
    (index: number) => (node: HTMLButtonElement | null) => {
      if (node) {
        thumbElements.current.set(index, node);
      } else {
        thumbElements.current.delete(index);
      }
    },
    []
  );

  // UI state
  const [controlsVisible, setControlsVisible] = useState(true);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Touch tracking for distinguishing taps from swipes
  const [touchStartPos, setTouchStartPos] = useState({ x: 0, y: 0 });
  const [hasTouchMoved, setHasTouchMoved] = useState(false);

  // Pinch-to-zoom state
  const [initialDistance, setInitialDistance] = useState(0);
  const [initialZoom, setInitialZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);

  // Update current index when initial index changes or modal opens
  useEffect(() => {
    setCurrentIndex(initialIndex);
    // Always reset zoom and pan to ensure proper centering
    setZoom(1);
    setPanX(0);
    setPanY(0);
    // First filmstrip scroll after modal open should be instant (no smooth animation)
    filmstripHasScrolled.current = false;
  }, [initialIndex, isOpen]);

  // Reset zoom and pan when media changes
  const resetView = useCallback(() => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, []);

  // Detect touch device and browser on mount
  const [isSafariMobile, setIsSafariMobile] = useState(false);

  useEffect(() => {
    const detectTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const detectSafariMobile = () => {
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      const isSafari = /Safari/.test(ua) && !/Chrome|Edge|Firefox/.test(ua);
      return isIOS && isSafari;
    };

    setIsTouchDevice(detectTouch());
    setIsSafariMobile(detectSafariMobile());
  }, []);

  // Ensure controls are always visible when zoomed in (safety net)
  useEffect(() => {
    if (zoom > 1 && !controlsVisible) {
      setControlsVisible(true);
    }
  }, [zoom, controlsVisible]);

  // Prevent browser zoom on the document when modal is open
  // Use position:fixed scroll lock to prevent iOS Safari rubber-banding
  useEffect(() => {
    if (isOpen) {
      const preventDefault = (e: Event) => {
        if ((e as TouchEvent).touches && (e as TouchEvent).touches.length > 1) {
          e.preventDefault();
        }
      };

      // Save current scroll position and lock body
      const scrollY = window.scrollY;
      const body = document.body;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      document.addEventListener('touchstart', preventDefault, { passive: false });

      return () => {
        document.removeEventListener('touchstart', preventDefault);
        // Restore scroll position
        body.style.position = '';
        body.style.top = '';
        body.style.left = '';
        body.style.right = '';
        body.style.overflow = '';
        body.style.paddingRight = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Zoom functions
  const zoomIn = useCallback(() => setZoom((prev) => Math.min(prev * 1.5, 5)), []);
  const zoomOut = useCallback(() => setZoom((prev) => Math.max(prev / 1.5, 0.5)), []);
  // Calculate distance between two touch points
  const getDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  }, []);

  const pauseModalVideos = useCallback(() => {
    const container = mediaContainerRef.current;
    if (!container) return;
    container.querySelectorAll('video').forEach((video) => {
      if (!video.paused) {
        video.pause();
      }
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      pauseModalVideos();
    }
  }, [isOpen, pauseModalVideos]);

  const changeMediaIndex = useCallback(
    (newIndex: number) => {
      // Pause any currently playing video within the modal only
      pauseModalVideos();

      setCurrentIndex(newIndex);
      resetView();
    },
    [pauseModalVideos, resetView]
  );

  const scrollFilmstripToIndex = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      const container = filmstripRef.current;
      const node = thumbElements.current.get(index);
      if (!container || !node) return;
      if (container.clientWidth === 0) return;

      const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
      const targetLeft = nodeCenter - container.clientWidth / 2;
      const lastNode = thumbElements.current.get(items.length - 1);
      const maxLeft = lastNode
        ? lastNode.offsetLeft + lastNode.offsetWidth / 2 - container.clientWidth / 2
        : container.scrollWidth - container.clientWidth;
      const clampedLeft = Math.min(Math.max(targetLeft, 0), Math.max(maxLeft, 0));

      container.scrollTo({ left: clampedLeft, behavior });
    },
    [items.length]
  );

  const findCenteredIndex = useCallback(() => {
    const container = filmstripRef.current;
    if (!container) return null;
    if (container.clientWidth === 0) return null;
    if (thumbElements.current.size === 0) return null;

    const centerX = container.scrollLeft + container.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    thumbElements.current.forEach((node, index) => {
      const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
      const distance = Math.abs(nodeCenter - centerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  }, []);

  const handleFilmstripScrollEnd = useCallback(() => {
    if (!isOpen) return;
    if (thumbElements.current.size === 0) return;
    filmstripIsUserScrolling.current = false;
    if (filmstripScrollTimeout.current) {
      window.clearTimeout(filmstripScrollTimeout.current);
      filmstripScrollTimeout.current = null;
    }

    const centeredIndex = findCenteredIndex();
    if (centeredIndex === null) return;

    if (centeredIndex !== currentIndex) {
      changeMediaIndex(centeredIndex);
    } else {
      scrollFilmstripToIndex(centeredIndex, 'smooth');
    }
  }, [changeMediaIndex, currentIndex, findCenteredIndex, isOpen, scrollFilmstripToIndex]);

  const handleFilmstripScroll = useCallback(() => {
    if (!isOpen) return;
    filmstripIsUserScrolling.current = true;

    if (filmstripScrollTimeout.current) {
      window.clearTimeout(filmstripScrollTimeout.current);
    }

    filmstripScrollTimeout.current = window.setTimeout(() => {
      handleFilmstripScrollEnd();
    }, 120);
  }, [handleFilmstripScrollEnd, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const container = filmstripRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (filmstripScrollRaf.current !== null) return;
      filmstripScrollRaf.current = window.requestAnimationFrame(() => {
        filmstripScrollRaf.current = null;
        handleFilmstripScroll();
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (filmstripScrollTimeout.current) {
        window.clearTimeout(filmstripScrollTimeout.current);
        filmstripScrollTimeout.current = null;
      }
      if (filmstripScrollRaf.current !== null) {
        window.cancelAnimationFrame(filmstripScrollRaf.current);
        filmstripScrollRaf.current = null;
      }
    };
  }, [handleFilmstripScroll, isOpen]);

  // Scroll the active thumbnail into view when currentIndex changes
  // (via swipe, arrow key, or thumbnail tap).
  useEffect(() => {
    if (!isOpen || filmstripIsUserScrolling.current) return;
    const behavior: ScrollBehavior = filmstripHasScrolled.current ? 'smooth' : 'auto';
    scrollFilmstripToIndex(currentIndex, behavior);
    filmstripHasScrolled.current = true;
  }, [currentIndex, isOpen, scrollFilmstripToIndex]);

  // Prefetch adjacent media for faster switching
  // Uses <link rel="prefetch"> instead of hidden <video> elements to avoid
  // DOM bloat, memory leaks, and bandwidth competition on mobile.
  // simpleMediaPrefetch() already deduplicates by checking existing link[href].
  useEffect(() => {
    if (!isOpen) return;

    if (currentIndex > 0) {
      prefetchMediaOnInteraction(items[currentIndex - 1], 'medium');
    }
    if (currentIndex < items.length - 1) {
      prefetchMediaOnInteraction(items[currentIndex + 1], 'medium');
    }
  }, [currentIndex, items, isOpen]);

  // Keyboard navigation — disabled when modal is closed to prevent
  // background state mutations (e.g. currentIndex drift on arrow keys)
  useKeypress(
    'ArrowRight',
    () => {
      if (currentIndex + 1 < items.length) changeMediaIndex(currentIndex + 1);
    },
    { disabled: !isOpen }
  );

  useKeypress(
    'ArrowLeft',
    () => {
      if (currentIndex > 0) changeMediaIndex(currentIndex - 1);
    },
    { disabled: !isOpen }
  );

  const currentItem = items[currentIndex];
  const isVideo = currentItem?.resource_type === 'video';

  // Memoize media props to prevent unnecessary re-fetches
  const currentMediaProps = useMemo(() => {
    if (!currentItem) return null;
    return getOptimizedMediaProps(currentItem, 'modal', {
      priority: true,
      quality: isVideo ? 'medium' : 'full',
    });
  }, [currentItem, isVideo]);

  // Zoom keyboard shortcuts (for images only)
  useKeypress('+', () => !isVideo && zoomIn(), { disabled: !isOpen });
  useKeypress('=', () => !isVideo && zoomIn(), { disabled: !isOpen });
  useKeypress('-', () => !isVideo && zoomOut(), { disabled: !isOpen });
  useKeypress('0', () => !isVideo && resetView(), { disabled: !isOpen });

  // Touch event handlers for pinch-to-zoom
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isVideo) return; // Only allow zoom on images

      if (e.touches.length === 1) {
        // Record touch start position for double-tap detection
        setTouchStartPos({
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        });
        setHasTouchMoved(false);

        if (zoom > 1) {
          // Start pan gesture when zoomed
          setIsDragging(true);
          setDragStart({
            x: e.touches[0].clientX - panX,
            y: e.touches[0].clientY - panY,
          });
        }
      } else if (e.touches.length === 2) {
        // Start pinch gesture
        setIsPinching(true);
        setInitialDistance(getDistance(e.touches));
        setInitialZoom(zoom);
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    },
    [isVideo, zoom, getDistance, panX, panY]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (isVideo) return;

      // Track movement for double-tap detection
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const moveDistance = Math.sqrt(
          Math.pow(touch.clientX - touchStartPos.x, 2) +
            Math.pow(touch.clientY - touchStartPos.y, 2)
        );
        if (moveDistance > 10) {
          setHasTouchMoved(true);
        }
      }

      if (isPinching && e.touches.length === 2) {
        // Handle pinch zoom
        const currentDistance = getDistance(e.touches);
        if (initialDistance > 0) {
          const scale = currentDistance / initialDistance;
          const newZoom = Math.max(0.5, Math.min(5, initialZoom * scale));
          setZoom(newZoom);
        }
        if (e.cancelable) {
          e.preventDefault();
        }
      } else if (isDragging && e.touches.length === 1 && zoom > 1) {
        // Handle pan when zoomed
        const newPanX = e.touches[0].clientX - dragStart.x;
        const newPanY = e.touches[0].clientY - dragStart.y;
        setPanX(newPanX);
        setPanY(newPanY);
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    },
    [
      isVideo,
      isPinching,
      isDragging,
      getDistance,
      initialDistance,
      initialZoom,
      zoom,
      dragStart,
      touchStartPos,
    ]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (isVideo) return;

      if (e.touches.length < 2) {
        setIsPinching(false);
        setInitialDistance(0);
      }

      if (e.touches.length === 0) {
        setIsDragging(false);

        // Handle double-tap to zoom
        if (e.changedTouches.length === 1 && !hasTouchMoved) {
          const now = Date.now();
          if (now - lastTapTime < 300) {
            // Double tap detected - zoom from center
            if (zoom === 1) {
              setPanX(0);
              setPanY(0);
              setZoom(2);
            } else {
              resetView();
            }
          }
          setLastTapTime(now);
        }
      }

      setHasTouchMoved(false);
    },
    [isVideo, hasTouchMoved, lastTapTime, zoom, resetView]
  );

  // Mouse event handlers for desktop dragging
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isVideo || zoom <= 1) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    },
    [isVideo, zoom, panX, panY]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isVideo || !isDragging || zoom <= 1) return;
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    },
    [isVideo, isDragging, zoom, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Mouse wheel handler for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (isVideo) return;
      // No preventDefault needed — modal is full-screen, nothing to scroll behind it
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    },
    [isVideo, zoomIn, zoomOut]
  );

  // Swipe handlers (only when not zoomed to avoid conflicts)
  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (zoom === 1 && !isPinching && currentIndex < items.length - 1) {
        changeMediaIndex(currentIndex + 1);
      }
    },
    onSwipedRight: () => {
      if (zoom === 1 && !isPinching && currentIndex > 0) {
        changeMediaIndex(currentIndex - 1);
      }
    },
    delta: 35,
    swipeDuration: 500,
    preventScrollOnSwipe: true,
    trackTouch: isTouchDevice,
    trackMouse: false,
    touchEventOptions: isTouchDevice ? { passive: false } : undefined,
  });

  if (!isOpen || !currentItem) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          pauseModalVideos();
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-2xl" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center w-screen h-screen-dynamic p-0 border-0 bg-transparent shadow-none"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DialogTitle className="sr-only">
            Wedding media {currentIndex + 1} of {items.length}
            {currentItem.guestName && ` shared by ${currentItem.guestName}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {currentItem.resource_type === 'video' ? 'Video' : 'Image'} viewer with navigation
            controls
          </DialogDescription>

          <div
            className="relative z-50 flex w-full max-w-7xl items-center justify-center p-4"
            {...(zoom === 1 && !isPinching ? handlers : {})}
          >
            <div className="w-full h-full flex items-center justify-center">
              <div
                ref={mediaContainerRef}
                className={`relative w-full max-w-full overflow-hidden flex items-center justify-center ${
                  zoom === 1 && controlsVisible ? 'h-[calc(100dvh-12rem)]' : 'h-[90dvh]' // Full height when zoomed or controls hidden
                }`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                style={{
                  touchAction: zoom > 1 || isPinching ? 'none' : 'auto',
                  cursor: zoom > 1 && !isVideo ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  userSelect: 'none',
                }}
              >
                {controlsVisible && (
                  <div className="fixed top-2 md:top-4 right-2 md:right-5 z-20 rounded-full bg-black/50 backdrop-blur-lg p-1">
                    <button
                      onClick={onClose}
                      className="rounded-full p-3 text-white/75 transition hover:bg-black/50 hover:text-white"
                      title={t('modal.closeModal')}
                      aria-label={t('modal.closeModal')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}

                {controlsVisible && (
                  <>
                    <div className="fixed top-2 md:top-4 left-2 md:left-5 z-20 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-lg p-1">
                      <a
                        href={currentItem.public_id}
                        className="rounded-full p-3 text-white/75 transition hover:bg-black/50 hover:text-white"
                        target="_blank"
                        title={t('modal.openFullsize')}
                        aria-label={t('modal.openFullsize')}
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-5 w-5" />
                      </a>
                      <button
                        onClick={() => {
                          const url = currentItem.public_id;
                          if (!url || !/^https?:|^\//i.test(url)) {
                            console.warn('Blocked invalid download URL', url);
                            return;
                          }
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `wedding-photo-${currentIndex + 1}.${currentItem.format}`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="rounded-full p-3 text-white/75 transition hover:bg-black/50 hover:text-white"
                        title={t('modal.downloadFullsize')}
                        aria-label={t('modal.downloadFullsize')}
                      >
                        <Download className="h-5 w-5" />
                      </button>
                    </div>

                    {!isVideo && (
                      <div className="fixed left-1/2 -translate-x-1/2 top-2 md:top-4 z-20 flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-lg p-1 pointer-events-auto zoom-controls">
                        <button
                          onClick={zoomOut}
                          disabled={zoom <= 0.5}
                          className="rounded-full p-3 text-white/75 transition hover:bg-black/50 hover:text-white disabled:opacity-50"
                          title={t('modal.zoomOut')}
                          aria-label={t('modal.zoomOut')}
                        >
                          <ZoomOut className="h-5 w-5" />
                        </button>
                        <span className="px-2 text-sm text-white/90 min-w-[3rem] text-center font-medium">
                          {Math.round(zoom * 100)}%
                        </span>
                        <button
                          onClick={zoomIn}
                          disabled={zoom >= 5}
                          className="rounded-full p-3 text-white/75 transition hover:bg-black/50 hover:text-white disabled:opacity-50"
                          title={t('modal.zoomIn')}
                          aria-label={t('modal.zoomIn')}
                        >
                          <ZoomIn className="h-5 w-5" />
                        </button>
                        {zoom !== 1 && (
                          <button
                            onClick={resetView}
                            className="rounded-full p-3 text-white/75 transition hover:bg-black/50 hover:text-white ml-0.5"
                            title={t('modal.resetZoom')}
                            aria-label={t('modal.resetZoom')}
                          >
                            <RotateCcw className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {!isTouchDevice && currentIndex > 0 && zoom === 1 && controlsVisible && (
                  <button
                    onClick={() => changeMediaIndex(currentIndex - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                    title={t('modal.previousMedia')}
                    aria-label={t('modal.previousMedia')}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}

                {!isTouchDevice &&
                  currentIndex + 1 < items.length &&
                  zoom === 1 &&
                  controlsVisible && (
                    <button
                      onClick={() => changeMediaIndex(currentIndex + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                      title={t('modal.nextMedia')}
                      aria-label={t('modal.nextMedia')}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  )}

                <div
                  key={`${currentIndex}-${currentItem.id}`}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div
                    className="flex items-center justify-center w-full h-full"
                    style={{
                      transform: !isVideo
                        ? `translate(${panX}px, ${panY}px) scale(${zoom})`
                        : 'scale(1)',
                      transition: isDragging || isPinching ? 'none' : 'transform 0.1s ease-out',
                      transformOrigin: 'center center',
                    }}
                  >
                    {currentMediaProps && (
                      <StorageAwareMedia
                        {...currentMediaProps}
                        context="modal"
                        controls={isVideo}
                        className={`${
                          isVideo
                            ? 'w-full h-full max-w-full max-h-full object-contain rounded-lg'
                            : 'max-w-full max-h-full w-auto h-auto object-contain'
                        } select-none mx-auto my-auto`}
                        draggable={false}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {zoom === 1 && controlsVisible && (
              <div
                className={`fixed inset-x-0 z-60 bottom-0 pb-[env(safe-area-inset-bottom)] ${isSafariMobile ? 'ios-safari-bottom' : ''}`}
              >
                <div
                  ref={filmstripRef}
                  className="mt-0 md:mt-6 flex items-center overflow-x-auto scrollbar-hide"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                    overscrollBehaviorX: 'contain',
                  }}
                >
                  {/* Leading spacer — centers first item */}
                  <div className="shrink-0" style={{ width: '50%' }} />
                  {items.map((item, index) => {
                    const isVideoThumb = item.resource_type === 'video';
                    return (
                      <motion.button
                        ref={setThumbRef(index)}
                        animate={{ scale: index === currentIndex ? 1.15 : 1 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => changeMediaIndex(index)}
                        key={index}
                        className={`${index === currentIndex ? 'z-20 rounded-md' : 'z-10'} ${index === 0 ? 'rounded-l-md' : ''} ${index === items.length - 1 ? 'rounded-r-md' : ''} relative inline-block w-16 md:w-20 h-16 md:h-20 shrink-0 transform-gpu overflow-hidden focus:outline-none`}
                      >
                        {isVideoThumb ? (
                          <div
                            className={`${index === currentIndex ? 'brightness-110' : 'brightness-50 contrast-125'} h-full w-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center transition`}
                          >
                            <Play
                              className="text-white/70 w-4 h-4"
                              fill="white"
                              fillOpacity={0.5}
                            />
                          </div>
                        ) : (
                          <StorageAwareMedia
                            {...getOptimizedMediaProps(item, 'thumb', {
                              priority: Math.abs(index - currentIndex) <= 2,
                              quality: 'thumb',
                            })}
                            className={`${index === currentIndex ? 'brightness-110 hover:brightness-110' : 'brightness-50 contrast-125 hover:brightness-75'} h-full transform object-cover transition`}
                          />
                        )}
                      </motion.button>
                    );
                  })}
                  {/* Trailing spacer — centers last item */}
                  <div className="shrink-0" style={{ width: '50%' }} />
                </div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

export default MediaModal;
