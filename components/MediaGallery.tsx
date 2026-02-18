'use client';

import { useEffect, useCallback, useRef, useMemo } from 'react';
import type { MediaProps } from '../utils/types';
import { appConfig } from '../config';
import { getOptimizedMediaProps, prefetchMediaOnInteraction } from '../utils/mediaOptimization';
import { StorageAwareMedia } from './StorageAwareMedia';
import dynamic from 'next/dynamic';
import { GuestNameForm } from './GuestNameForm';

const MediaModal = dynamic(() => import('./MediaModal'), { ssr: false });

import {
  useMedia,
  useSetMedia,
  useMediaModalOpen,
  useSelectedMediaId,
  useOpenMediaModal,
  useCloseMediaModal,
  useIsLoadingMedia,
  useLastRefreshTime,
  useSetIsLoadingMedia,
  useRefreshMedia,
  useGuestName,
  useHasHydrated,
} from '../store/useAppStore';
import { useI18n } from './I18nProvider';

interface MediaGalleryProps {
  initialMedia: MediaProps[];
}

function formatUploadDate(dateString: string, locale: string = 'en-US'): string {
  try {
    return new Date(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    console.warn('Invalid date format:', dateString);
    return 'Date unavailable';
  }
}

function handleMediaKeyNavigation(
  event: React.KeyboardEvent,
  mediaId: number | string,
  onOpenModal: (id: number | string) => void
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onOpenModal(mediaId);
  }
}

export function MediaGallery({ initialMedia }: MediaGalleryProps) {
  const media = useMedia();
  const setMedia = useSetMedia();
  const isModalOpen = useMediaModalOpen();
  const selectedMediaId = useSelectedMediaId();
  const openModal = useOpenMediaModal();
  const closeModal = useCloseMediaModal();
  const isLoading = useIsLoadingMedia();
  const lastRefreshTime = useLastRefreshTime();
  const setIsLoading = useSetIsLoadingMedia();
  const refresh = useRefreshMedia();
  const guestName = useGuestName();
  const hasHydrated = useHasHydrated();
  const previousGuestName = useRef<string | null>(null);
  const mediaRef = useRef<MediaProps[]>(media);
  const { t, language } = useI18n();

  // Resolve the selected media index from the stored ID.
  // Falls back to 0 if the ID is not found (e.g., item was deleted).
  const selectedMediaIndex = useMemo(() => {
    if (selectedMediaId === null) return 0;
    const idx = media.findIndex((m) => m.id === selectedMediaId);
    return idx >= 0 ? idx : 0;
  }, [selectedMediaId, media]);

  useEffect(() => {
    if (initialMedia.length > 0 && media.length === 0) {
      setMedia(initialMedia);
    }
  }, [initialMedia, media.length, setMedia]);

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  const shouldReplaceMedia = useCallback((currentItems: MediaProps[], nextItems: MediaProps[]) => {
    if (nextItems.length === 0) {
      return currentItems.length === 0;
    }
    const getLatestTimestamp = (items: MediaProps[]): number => {
      return items.reduce((latest, item) => {
        if (!item.uploadDate) return latest;
        const timestamp = new Date(item.uploadDate).getTime();
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, 0);
    };

    const currentLatest = getLatestTimestamp(currentItems);
    const nextLatest = getLatestTimestamp(nextItems);
    if (nextLatest > currentLatest) return true;
    return nextLatest === currentLatest && nextItems.length !== currentItems.length;
  }, []);

  const refetchWeddingMediaInternal = useCallback(
    async (
      options: { showLoading?: boolean; guestOverride?: string } = {}
    ): Promise<MediaProps[]> => {
      const { showLoading = true, guestOverride } = options;
      if (showLoading) {
        setIsLoading(true);
      }
      try {
        let url = '/api/photos';
        const guestToUse = guestOverride || guestName;
        if (appConfig.guestIsolation && guestToUse) {
          url += `?guest=${encodeURIComponent(guestToUse)}`;
        }

        const response = await fetch(url);

        if (response.ok) {
          const refreshedMedia = await response.json();
          setMedia(refreshedMedia);
          refresh();
          return refreshedMedia;
        } else {
          console.error('Failed to refetch media:', response.statusText);
        }
      } catch (error) {
        console.error('Network error while refetching media:', error);
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
      return [];
    },
    [setMedia, setIsLoading, refresh, guestName]
  );

  useEffect(() => {
    if (appConfig.guestIsolation && !guestName) {
      return;
    }

    let cancelled = false;

    const fetchFresh = async () => {
      try {
        const refreshedMedia = await refetchWeddingMediaInternal({ showLoading: false });
        if (cancelled) return;

        if (refreshedMedia.length > 0 && shouldReplaceMedia(mediaRef.current, refreshedMedia)) {
          setMedia(refreshedMedia);
          refresh();
        }
      } catch (error) {
        console.error('Failed to refresh gallery media:', error);
      }
    };

    fetchFresh();
    return () => {
      cancelled = true;
    };
  }, [guestName, refresh, setMedia, shouldReplaceMedia, refetchWeddingMediaInternal]);

  // Single fetch effect for guest isolation - only refetch if guest changes and we need isolation
  useEffect(() => {
    if (appConfig.guestIsolation && guestName) {
      const isNewGuest = previousGuestName.current !== guestName;

      if (isNewGuest) {
        refetchWeddingMediaInternal({
          showLoading: previousGuestName.current !== null,
          guestOverride: guestName,
        });
        previousGuestName.current = guestName;
      }
    }
  }, [guestName, refetchWeddingMediaInternal]);

  // Show name input when guest name hasn't been set yet
  const shouldShowNameInput = hasHydrated && !guestName;

  if (shouldShowNameInput) {
    return <GuestNameForm />;
  }

  // For guest isolation mode, show loading state while fetching media
  const isFetchingMedia = appConfig.guestIsolation && guestName && media.length === 0 && isLoading;

  if (isFetchingMedia) {
    return (
      <div
        className="text-center py-8 text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-label={t('accessibility.loadingNewMedia')}
      >
        <div className="flex items-center justify-center gap-3">
          <div
            className="animate-[spin_1.5s_ease-in-out_infinite] rounded-full h-5 w-5 border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
          <span className="text-sm font-medium">{t('gallery.loadingPhotos')}</span>
        </div>
      </div>
    );
  }

  if (media.length === 0 && !isLoading) {
    return (
      <div
        className="absolute top-1/2 left-1/2 -translate-1/2 w-full px-6 text-center text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <h2 className="text-2xl font-semibold">{t('gallery.noPhotos')}</h2>
        <p className="text-lg">
          {t('gallery.noPhotosDescription', {
            brideName: appConfig.brideName,
            groomName: appConfig.groomName,
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isLoading && (
        <div
          className="text-center py-8 text-muted-foreground"
          role="status"
          aria-live="polite"
          aria-label={t('accessibility.loadingNewMedia')}
        >
          <div className="flex items-center justify-center gap-3">
            <div
              className="animate-[spin_1.5s_ease-in-out_infinite] rounded-full h-5 w-5 border-2 border-current border-r-transparent"
              aria-hidden="true"
            />
            <span className="text-sm font-medium">{t('gallery.loadingPhotos')}</span>
          </div>
        </div>
      )}

      <div
        className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4"
        role="grid"
        aria-label={`${t('gallery.title')} ${t('gallery.photoCount', { count: media.length })}`}
      >
        {media.map((mediaItem, index) => (
          <div
            key={mediaItem.id}
            role="gridcell"
            className="after:content group relative mb-5 block w-full cursor-pointer after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:shadow-highlight focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
            onClick={() => openModal(mediaItem.id)}
            onKeyDown={(e) => handleMediaKeyNavigation(e, mediaItem.id, openModal)}
            onMouseEnter={() => prefetchMediaOnInteraction(mediaItem, 'full')}
            tabIndex={0}
            aria-label={
              mediaItem.guestName && mediaItem.guestName !== 'Unknown Guest'
                ? t('gallery.openPhotoWithGuest', {
                    index: index + 1,
                    guestName: mediaItem.guestName,
                  })
                : t('gallery.openPhoto', { index: index + 1 })
            }
          >
            <StorageAwareMedia
              {...getOptimizedMediaProps(mediaItem, 'gallery', { priority: index < 2 })}
              className="overflow-hidden transform rounded-lg brightness-90 transition will-change-auto group-hover:brightness-110 group-focus:brightness-110"
              style={{ transform: 'translate3d(0, 0, 0)' }}
            />
            {(mediaItem.guestName || mediaItem.uploadDate) && (
              <div
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg"
                aria-hidden="true"
              >
                <div className="text-white text-xs font-medium p-2 text-center">
                  {mediaItem.guestName && mediaItem.guestName !== 'Unknown Guest' && (
                    <p>{t('gallery.sharedBy', { name: mediaItem.guestName })}</p>
                  )}
                  {mediaItem.uploadDate && (
                    <p className="text-white/80">
                      {formatUploadDate(mediaItem.uploadDate, language)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {t('accessibility.galleryUpdated', { time: lastRefreshTime.toLocaleTimeString(language) })}
      </div>

      <MediaModal
        items={media}
        isOpen={isModalOpen}
        initialIndex={selectedMediaIndex}
        onClose={closeModal}
      />
    </div>
  );
}
