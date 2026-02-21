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

/** Calculate distance between two touch points (for pinch-to-zoom). */
function getDistance(touches: React.TouchList): number {
  if (touches.length < 2) return 0;
  const touch1 = touches[0];
  const touch2 = touches[1];
  return Math.sqrt(
    Math.pow(touch2.clientX - touch1.clientX, 2) + Math.pow(touch2.clientY - touch1.clientY, 2)
  );
}

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
  const filmstripRef = useRef<HTMLDivElement>(null);
  const filmstripHasScrolled = useRef(false);

  // UI state
  const [lastTapTime, setLastTapTime] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Swipe drag feedback state — tracks the horizontal offset (in px) during a
  // swipe gesture so the content visually follows the user's finger.
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  // True during the CSS transition that animates the content to its final
  // position after the user lifts their finger.
  const [isSwipeAnimating, setIsSwipeAnimating] = useState(false);
  // Timer ref for the post-swipe animation timeout — allows cleanup on
  // unmount and cancellation on rapid successive swipes.
  const swipeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Detect touch device on mount
  useEffect(() => {
    const detectTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(detectTouch());
  }, []);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Zoom functions
  const zoomIn = useCallback(() => setZoom((prev) => Math.min(prev * 1.5, 5)), []);
  const zoomOut = useCallback(() => setZoom((prev) => Math.max(prev / 1.5, 0.5)), []);

  const changeMediaIndex = useCallback(
    (newIndex: number) => {
      // Pause any currently playing video within the modal only
      const container = mediaContainerRef.current;
      if (container) {
        container.querySelectorAll('video').forEach((video) => {
          if (!video.paused) {
            video.pause();
          }
        });
      }

      setCurrentIndex(newIndex);
      resetView();
    },
    [resetView]
  );

  // Center the filmstrip on the active thumbnail when the modal first
  // opens.  After that, the user owns the scroll — no JS interference.
  useEffect(() => {
    if (!isOpen) return;
    if (filmstripHasScrolled.current) return;
    const container = filmstripRef.current;
    if (!container) return;

    // Find the active thumbnail by data attribute
    const activeThumb = container.querySelector<HTMLButtonElement>('[data-active-thumb="true"]');
    if (!activeThumb) return;

    const thumbCenter = activeThumb.offsetLeft + activeThumb.offsetWidth / 2;
    container.scrollLeft = thumbCenter - container.clientWidth / 2;
    filmstripHasScrolled.current = true;
  }, [currentIndex, isOpen]);

  // Preload adjacent images for instant switching.
  // Uses `new Image().src` (works on all browsers including Safari, which
  // ignores `<link rel="prefetch">` entirely).  Limited to ±2 to avoid
  // speculatively downloading 30 MB+ of full-quality originals on cellular.
  useEffect(() => {
    if (!isOpen) return;

    for (let offset = 1; offset <= 2; offset++) {
      const prev = currentIndex - offset;
      const next = currentIndex + offset;
      if (prev >= 0) {
        prefetchMediaOnInteraction(items[prev], 'full');
      }
      if (next < items.length) {
        prefetchMediaOnInteraction(items[next], 'full');
      }
    }
  }, [currentIndex, items, isOpen]);

  // Keyboard navigation — disabled when modal is closed to prevent
  // background state mutations (e.g. currentIndex drift on arrow keys).
  // Also blocked during swipe animation to prevent double-navigation.
  useKeypress(
    'ArrowRight',
    () => {
      if (!isSwipeAnimating && currentIndex + 1 < items.length) {
        changeMediaIndex(currentIndex + 1);
      }
    },
    { disabled: !isOpen }
  );

  useKeypress(
    'ArrowLeft',
    () => {
      if (!isSwipeAnimating && currentIndex > 0) {
        changeMediaIndex(currentIndex - 1);
      }
    },
    { disabled: !isOpen }
  );

  const currentItem = items[currentIndex];
  const isVideo = currentItem?.resource_type === 'video';

  // Memoize media props to prevent unnecessary re-fetches.
  // Quality is always 'full' — for videos, getOptimizedMediaProps ignores
  // quality and hardcodes by context (no video variants exist).
  const currentMediaProps = useMemo(() => {
    if (!currentItem) return null;
    return getOptimizedMediaProps(currentItem, 'modal', {
      priority: true,
      quality: 'full',
    });
  }, [currentItem]);

  // Zoom keyboard shortcuts (for images only)
  useKeypress('+', () => !isVideo && zoomIn(), { disabled: !isOpen });
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
    [isVideo, zoom, panX, panY]
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
    [isVideo, isPinching, isDragging, initialDistance, initialZoom, zoom, dragStart, touchStartPos]
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

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Mouse wheel handler for zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (isVideo) return;
    // No preventDefault needed — modal is full-screen, nothing to scroll behind it
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  // Swipe handlers (only when not zoomed to avoid conflicts)
  // Uses onSwiping for real-time drag feedback and onSwiped for
  // velocity-based skip (fast flick = skip 2-3 items, normal swipe = 1).
  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      if (zoom !== 1 || isPinching || isSwipeAnimating) return;
      // Only track horizontal swipes (ignore mostly-vertical gestures)
      if (Math.abs(eventData.deltaX) > Math.abs(eventData.deltaY)) {
        let offset = eventData.deltaX;
        // Rubber-band resistance at boundaries — finger still moves but content
        // drags at 30% speed, signalling "nothing more in this direction".
        const atStart = currentIndex === 0 && offset > 0;
        const atEnd = currentIndex === items.length - 1 && offset < 0;
        if (atStart || atEnd) {
          offset = offset * 0.3;
        }
        setSwipeOffsetX(offset);
      }
    },
    onSwiped: (eventData) => {
      if (zoom !== 1 || isPinching || isSwipeAnimating) return;

      // Determine direction: left swipe (negative deltaX) = next, right = prev
      const isLeftSwipe = eventData.deltaX < 0;
      const absVelocity = Math.abs(eventData.velocity);

      // Skip count from velocity (capped at 3):
      //   v < 1.0 → 1 (normal swipe),  v 1.0-2.0 → 2,  v ≥ 2.0 → 3 (fast flick)
      const skipCount = Math.min(3, Math.floor(absVelocity) + 1);

      let targetIndex: number;
      if (isLeftSwipe) {
        targetIndex = Math.min(items.length - 1, currentIndex + skipCount);
      } else {
        targetIndex = Math.max(0, currentIndex - skipCount);
      }

      // Cancel any in-flight animation timer from a prior swipe
      if (swipeTimerRef.current) {
        clearTimeout(swipeTimerRef.current);
        swipeTimerRef.current = null;
      }

      if (targetIndex !== currentIndex) {
        // Animate the offset to the edge, then swap content
        setIsSwipeAnimating(true);
        const direction = isLeftSwipe ? -1 : 1;
        setSwipeOffsetX(direction * window.innerWidth);

        // After the CSS transition finishes, swap the media and reset
        swipeTimerRef.current = setTimeout(() => {
          changeMediaIndex(targetIndex);
          setIsSwipeAnimating(false);
          setSwipeOffsetX(0);
          swipeTimerRef.current = null;
        }, 200);
      } else {
        // Didn't move to a new item — spring back to center
        setIsSwipeAnimating(true);
        setSwipeOffsetX(0);
        swipeTimerRef.current = setTimeout(() => {
          setIsSwipeAnimating(false);
          swipeTimerRef.current = null;
        }, 200);
      }
    },
    delta: 35,
    swipeDuration: 500,
    preventScrollOnSwipe: true,
    trackTouch: isTouchDevice,
    trackMouse: false,
    touchEventOptions: isTouchDevice ? { passive: false } : undefined,
  });

  // Clean up swipe animation timer when modal closes or component unmounts
  useEffect(() => {
    if (!isOpen && swipeTimerRef.current) {
      clearTimeout(swipeTimerRef.current);
      swipeTimerRef.current = null;
      setIsSwipeAnimating(false);
      setSwipeOffsetX(0);
    }
  }, [isOpen]);

  if (!isOpen || !currentItem) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/90" />
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
                  zoom === 1 ? 'h-[calc(100dvh-12rem)]' : 'h-[90dvh]' // Full height when zoomed
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

                {!isTouchDevice && currentIndex > 0 && zoom === 1 && (
                  <button
                    onClick={() => changeMediaIndex(currentIndex - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white"
                    title={t('modal.previousMedia')}
                    aria-label={t('modal.previousMedia')}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}

                {!isTouchDevice && currentIndex + 1 < items.length && zoom === 1 && (
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
                  style={{
                    transform: swipeOffsetX !== 0 ? `translateX(${swipeOffsetX}px)` : undefined,
                    transition: isSwipeAnimating ? 'transform 200ms ease-out' : 'none',
                    willChange: swipeOffsetX !== 0 ? 'transform' : undefined,
                  }}
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

            {zoom === 1 && (
              <div className="fixed inset-x-0 z-60 bottom-0 pb-[env(safe-area-inset-bottom)]">
                <div
                  ref={filmstripRef}
                  className="mt-0 md:mt-6 flex items-center overflow-x-auto scrollbar-hide"
                  onTouchStartCapture={(e) => e.stopPropagation()}
                  onTouchMoveCapture={(e) => e.stopPropagation()}
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
                      <button
                        data-active-thumb={index === currentIndex || undefined}
                        onClick={() => changeMediaIndex(index)}
                        key={index}
                        className={`${index === currentIndex ? 'z-20 rounded-md' : 'z-10'} ${index === 0 ? 'rounded-l-md' : ''} ${index === items.length - 1 ? 'rounded-r-md' : ''} relative inline-block w-16 md:w-20 h-16 md:h-20 shrink-0 transform-gpu overflow-hidden focus:outline-none`}
                        style={{
                          transform: index === currentIndex ? 'scale(1.15)' : 'scale(1)',
                          transition: 'transform 150ms ease-out',
                        }}
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
                      </button>
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
