'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { appConfig } from '../config';

import { Button } from './ui/button';
import {
  useGuestName,
  useSetGuestName,
  useSetMedia,
  useMediaModalOpen,
  useRefreshMedia,
} from '../store/useAppStore';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from './ui/input';
import { validateGuestNameForUI, validateGuestName, validateMediaFile } from '../utils/validation';
import { Progress } from './ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Upload as UploadIcon,
  X,
  Check,
  Trash2,
  Edit,
  Plus,
  Camera,
  Square,
  CheckSquare,
  Trash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import type { UploadFile } from '../utils/types';
import { formatFileSize, getCompressionInfo, getEventToken } from '../utils/clientUtils';
import { useI18n } from './I18nProvider';
import { useSearchParams } from 'next/navigation';

/** Revoke blob/object URLs used as thumbnails to prevent memory leaks. */
const revokeThumbnails = (filesToRevoke: UploadFile[]) => {
  for (const f of filesToRevoke) {
    if (f.thumbnail && f.thumbnail.startsWith('blob:')) {
      URL.revokeObjectURL(f.thumbnail);
    }
  }
};

interface TriggerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

const TriggerButton = React.forwardRef<HTMLButtonElement, TriggerButtonProps>(
  function TriggerButton({ label, ...props }, ref) {
    return (
      <Button
        ref={ref}
        {...props}
        size="lg"
        className="fixed bottom-14 right-4 shadow-lg hover:shadow-xl transition-all duration-200 bg-primary hover:bg-primary/90 
                   h-14 px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium
                   mb-[env(safe-area-inset-bottom)]
                   md:h-12 md:px-6 md:py-3 md:rounded-lg md:gap-2 md:text-sm md:font-medium md:mb-0"
      >
        <Camera className="h-5 w-5" />
        <span>{label}</span>
      </Button>
    );
  }
);

interface UploadProps {
  currentGuestName?: string;
}

export const Upload = ({ currentGuestName }: UploadProps) => {
  const guestName = useGuestName();
  const setGuestName = useSetGuestName();

  const isMediaModalOpen = useMediaModalOpen();

  const searchParams = useSearchParams();
  const photoId = searchParams?.get('photoId') || null;

  const isModalOpen = !!photoId || isMediaModalOpen;
  const setMedia = useSetMedia();
  const refreshMedia = useRefreshMedia();
  const { t } = useI18n();

  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingNameMobile, setIsEditingNameMobile] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [currentNameValue, setCurrentNameValue] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastUploadSuccessCount, setLastUploadSuccessCount] = useState(0);
  const [isLargeScreen, setIsLargeScreen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const longPressTriggeredRef = useRef(false);
  const filesRef = useRef(files);

  const { toast } = useToast();

  // Keep ref in sync for unmount cleanup
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (currentGuestName && currentGuestName !== guestName) {
      setGuestName(currentGuestName);
    }
  }, [currentGuestName, guestName, setGuestName]);

  useEffect(() => {
    let rafId: number;
    const checkScreenSize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setIsLargeScreen(window.innerWidth >= 1024); // lg breakpoint
      });
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Revoke all blob thumbnail URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      revokeThumbnails(filesRef.current);
    };
  }, []);

  // Auto-close the drawer/dialog after successful upload and show a toast
  useEffect(() => {
    if (lastUploadSuccessCount > 0 && files.length === 0 && isOpen) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        toast({
          title: t('upload.filesSuccessfullyAdded'),
          description: t('upload.filesAddedToGallery', { count: lastUploadSuccessCount }),
        });
        setLastUploadSuccessCount(0);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [lastUploadSuccessCount, files.length, isOpen, toast, t]);

  const isValidMediaFile = (file: File): boolean => {
    try {
      return validateMediaFile(file, true, true);
    } catch {
      return false;
    }
  };

  const createThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (file.type.startsWith('video/')) {
          if (isMobile) {
            const objectUrl = URL.createObjectURL(file);
            resolve(objectUrl);
            return;
          }

          const video = document.createElement('video');
          video.muted = true;
          video.playsInline = true; // Required for iOS inline playback
          video.preload = 'metadata';

          const cleanup = () => {
            if (video.src) {
              URL.revokeObjectURL(video.src);
            }
          };

          const timeoutId = setTimeout(() => {
            cleanup();
            resolve('');
          }, 8000);

          video.onloadedmetadata = () => {
            try {
              video.currentTime = Math.min(1, video.duration * 0.1);
            } catch {
              clearTimeout(timeoutId);
              cleanup();
              resolve('');
            }
          };

          video.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              const size = 200;
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d');

              if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
                const aspectRatio = video.videoWidth / video.videoHeight;
                let sx = 0,
                  sy = 0,
                  sWidth = video.videoWidth,
                  sHeight = video.videoHeight;

                if (aspectRatio > 1) {
                  sWidth = video.videoHeight;
                  sx = (video.videoWidth - sWidth) / 2;
                } else {
                  sHeight = video.videoWidth;
                  sy = (video.videoHeight - sHeight) / 2;
                }

                ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, size, size);
                const thumbnail = canvas.toDataURL('image/jpeg', 0.7);

                clearTimeout(timeoutId);
                cleanup();
                resolve(thumbnail);
              } else {
                clearTimeout(timeoutId);
                cleanup();
                resolve('');
              }
            } catch {
              clearTimeout(timeoutId);
              cleanup();
              resolve('');
            }
          };

          video.onerror = () => {
            clearTimeout(timeoutId);
            cleanup();
            resolve('');
          };

          video.src = URL.createObjectURL(file);
          return;
        }

        // Image files — use object URL (lightweight pointer, no base64 copy)
        try {
          const objectUrl = URL.createObjectURL(file);
          resolve(objectUrl);
        } catch {
          resolve('');
        }
      } catch {
        // Last resort — return empty string
        resolve('');
      }
    });
  };

  const createFileHash = async (file: File): Promise<string> => {
    try {
      if (!window.crypto || !window.crypto.subtle) {
        return `fallback_${file.name}_${file.size}_${file.lastModified}`;
      }

      // For files larger than 10MB, hash only the first and last 512KB
      // to avoid reading the entire file into memory (OOM risk on mobile).
      const PARTIAL_THRESHOLD = 10 * 1024 * 1024; // 10MB
      const CHUNK_SIZE = 512 * 1024; // 512KB

      let arrayBuffer: ArrayBuffer;

      if (file.size > PARTIAL_THRESHOLD) {
        const head = await file.slice(0, CHUNK_SIZE).arrayBuffer();
        const tail = await file.slice(file.size - CHUNK_SIZE).arrayBuffer();
        // Combine head + tail + size bytes for uniqueness
        const sizeBytes = new TextEncoder().encode(String(file.size));
        const combined = new Uint8Array(head.byteLength + tail.byteLength + sizeBytes.byteLength);
        combined.set(new Uint8Array(head), 0);
        combined.set(new Uint8Array(tail), head.byteLength);
        combined.set(sizeBytes, head.byteLength + tail.byteLength);
        arrayBuffer = combined.buffer;
      } else if (file.arrayBuffer) {
        arrayBuffer = await file.arrayBuffer();
      } else {
        arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result;
            if (result && result instanceof ArrayBuffer) {
              resolve(result);
            } else {
              reject(new Error('Failed to read file as ArrayBuffer'));
            }
          };
          reader.onerror = () => reject(reader.error || new Error('FileReader error'));
          reader.readAsArrayBuffer(file);
        });
      }

      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      return hash;
    } catch {
      return `error_${file.name}_${file.size}_${file.lastModified}`;
    }
  };

  const isDuplicateFile = (newFile: File, newHash: string): boolean => {
    return files.some((existingFile) => {
      if (existingFile.hash === newHash) return true;

      if (existingFile.file.name === newFile.name && existingFile.file.size === newFile.size)
        return true;

      return false;
    });
  };

  const handleFileSelect = async (fileList: FileList | null) => {
    if (!fileList) {
      return;
    }

    const validFiles = Array.from(fileList).filter((file) => {
      try {
        return isValidMediaFile(file);
      } catch {
        return false;
      }
    });

    // Clear the file input value to allow selecting the same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (validFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: t('errors.invalidFiles'),
        description: t('errors.invalidFilesDescription'),
      });
      return;
    }
    const newFiles: UploadFile[] = [];
    const duplicateFiles: string[] = [];

    for (const file of validFiles) {
      try {
        const hash = await createFileHash(file);
        if (!hash || hash.startsWith('error_')) {
          throw new Error(`Hash creation failed: ${hash}`);
        }

        if (isDuplicateFile(file, hash)) {
          duplicateFiles.push(file.name);
          continue;
        }

        let thumbnail = '';
        try {
          thumbnail = await createThumbnail(file);
        } catch {
          // Continue without thumbnail - not critical
        }
        const uploadFile = {
          file,
          id: Math.random().toString(36).substring(2, 11),
          progress: 0,
          status: 'pending' as const,
          thumbnail,
          hash,
        };

        newFiles.push(uploadFile);
      } catch {
        // Skip this file but continue with others
      }
    }

    // Show duplicate notification if any duplicates found
    if (duplicateFiles.length > 0) {
      toast({
        variant: 'destructive',
        title: t('errors.duplicateFiles'),
        description: t('errors.duplicateFilesDescription', { count: duplicateFiles.length }),
      });
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      toast({
        title: t('success.filesSelected'),
        description: t('success.filesSelectedDescription', { count: newFiles.length }),
      });
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const removed = prev.filter((f) => f.id === id);
      revokeThumbnails(removed);
      return prev.filter((f) => f.id !== id);
    });
    setFileToDelete(null);
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const confirmRemoveFile = (id: string) => {
    setFileToDelete(id);
  };

  const toggleFileSelection = (id: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllFiles = () => {
    setSelectedFiles(new Set(pendingFiles.map((f) => f.id)));
  };

  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedFiles(new Set());
    }
  };

  const removeSelectedFiles = () => {
    const removedCount = selectedFiles.size;
    setFiles((prev) => {
      const removed = prev.filter((f) => selectedFiles.has(f.id));
      revokeThumbnails(removed);
      return prev.filter((f) => !selectedFiles.has(f.id));
    });
    setSelectedFiles(new Set());
    setIsSelectionMode(false);

    if (removedCount > 0) {
      toast({
        title: t('success.filesRemoved'),
        description: t('success.filesRemovedDescription', { count: removedCount }),
      });
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (uploadFile: UploadFile): Promise<boolean> => {
    setFiles((prev) =>
      prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f))
    );

    try {
      const data = await (async () => {
        const formData = new FormData();
        formData.append('file', uploadFile.file);
        formData.append('guestName', guestName);

        if (uploadFile.file.type.startsWith('video/')) {
          const video = document.createElement('video');
          const objectUrl = URL.createObjectURL(uploadFile.file);

          try {
            const metadata = await new Promise<{ width: number; height: number }>((resolve) => {
              let settled = false;
              const timeoutId = window.setTimeout(() => {
                if (!settled) {
                  settled = true;
                  resolve({ width: 720, height: 480 });
                }
              }, 4000);

              video.preload = 'metadata';
              video.onloadedmetadata = () => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                resolve({ width: video.videoWidth || 720, height: video.videoHeight || 480 });
              };
              video.onerror = () => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                resolve({ width: 720, height: 480 });
              };
              video.src = objectUrl;
            });

            formData.append('width', String(metadata.width));
            formData.append('height', String(metadata.height));
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
        }

        // No real progress events from fetch(); show 50% to indicate upload started
        setFiles((prev) => prev.map((f) => (f.id === uploadFile.id ? { ...f, progress: 50 } : f)));

        const eventToken = getEventToken();
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
          headers: eventToken ? { 'x-event-token': eventToken } : undefined,
        });

        const responseData = await res.json();

        if (!res.ok) {
          throw new Error(responseData.error || 'Failed to upload file');
        }

        return responseData;
      })();

      if (data) {
        setFiles((prev) =>
          prev.map((f) => (f.id === uploadFile.id ? { ...f, status: 'success', progress: 100 } : f))
        );
        return true;
      }
      return false;
    } catch (uploadError) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: 'error',
                error:
                  uploadError instanceof Error ? uploadError.message : t('errors.uploadFailed'),
              }
            : f
        )
      );
      return false;
    }
  };

  const handleUploadAll = async () => {
    const currentName = guestName.trim();
    if (!currentName) {
      toast({
        variant: 'destructive',
        title: t('errors.nameRequired'),
        description: t('errors.nameRequiredDescription'),
      });
      return;
    }

    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    setLastUploadSuccessCount(0);

    // Upload with concurrency limit to avoid overwhelming the server
    const CONCURRENCY = 3;
    const queue = [...pendingFiles];

    // Track successes via return values — not React state (which batches asynchronously)
    let successCount = 0;
    const runWorker = async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (next) {
          const succeeded = await uploadFile(next);
          if (succeeded) successCount++;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => runWorker())
    );

    setIsUploading(false);

    if (successCount > 0) {
      setLastUploadSuccessCount(successCount);
    }

    // Clean up completed files from the upload list
    setFiles((prev) => {
      // Revoke thumbnails for completed files before clearing them
      const completed = prev.filter((f) => f.status === 'success' || f.status === 'error');
      revokeThumbnails(completed);
      // Keep only pending/uploading files (clear success + error)
      return prev.filter((f) => f.status === 'pending' || f.status === 'uploading');
    });

    // Refetch gallery from server to get proper thumbnails, blur data, and correct IDs.
    // This replaces the old per-file addMedia() which produced broken gallery entries
    // (empty blurDataUrl, missing video thumbnails, client-generated IDs).
    if (successCount > 0) {
      try {
        let url = '/api/photos';
        if (appConfig.guestIsolation && guestName) {
          url += `?guest=${encodeURIComponent(guestName)}`;
        }
        const eventToken = getEventToken();
        const response = await fetch(url, {
          cache: 'no-store',
          headers: eventToken ? { 'x-event-token': eventToken } : undefined,
        });
        if (response.ok) {
          const freshMedia = await response.json();
          setMedia(freshMedia);
          refreshMedia();
        }
      } catch (error) {
        console.error('Failed to refresh gallery after upload:', error);
      }
    }
  };

  const handleNameChange = () => {
    const rawValue = currentNameValue;
    // Final validation before submitting
    const error = validateGuestNameForUI(rawValue, t);
    if (error) {
      setNameError(error);
      return;
    }

    setNameError(null);

    // Use validated and sanitized name
    const sanitizedName = validateGuestName(rawValue, t);

    setGuestName(sanitizedName);
    // Blur the focused input before closing so Radix doesn't apply
    // aria-hidden to an ancestor that still contains the focused element.
    nameInputRef.current?.blur();
    setIsEditingName(false);
    setIsEditingNameMobile(false);
  };

  // Real-time validation handler
  const handleNameInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrentNameValue(value);
    const error = validateGuestNameForUI(value, t);
    setNameError(error);
  };

  const clearCompleted = () => {
    setFiles((prev) => {
      const completed = prev.filter((f) => f.status !== 'pending' && f.status !== 'uploading');
      revokeThumbnails(completed);
      return prev.filter((f) => f.status === 'pending' || f.status === 'uploading');
    });
  };

  const handleViewGallery = () => {
    setIsOpen(false);
    setLastUploadSuccessCount(0);
    // Scroll to top of page to show newly added photos
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const hasFiles = files.length > 0;
  const hasCompleted = files.some((f) => f.status === 'success' || f.status === 'error');
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading').length;
  const successCount = lastUploadSuccessCount;
  const hasSuccessfulUploads = lastUploadSuccessCount > 0;
  const pendingFiles = files.filter((f) => f.status === 'pending');
  const selectedPendingFiles = pendingFiles.filter((f) => selectedFiles.has(f.id));
  const allPendingSelected =
    pendingFiles.length > 0 && selectedPendingFiles.length === pendingFiles.length;

  // Shared content for both Dialog and Drawer
  const uploadContent = (
    <div className="flex-1 flex flex-col gap-3 p-3 select-none min-h-0">
      {/* Post-upload success state removed — auto-close + toast handles this now */}

      {/* Drop area - iOS optimized */}
      <div
        className={cn(
          'flex-1 rounded-lg transition-colors relative flex items-center justify-center min-h-0',
          !hasFiles &&
            'border border-border/30 hover:border-border/60 hover:bg-muted/20 p-6 text-center cursor-pointer touch-manipulation',
          hasFiles && 'border border-border/50 bg-muted/5 p-3 flex-col items-stretch justify-start'
        )}
        onDrop={(e) => {
          e.preventDefault();
          handleFileSelect(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          if (!hasFiles) {
            triggerFileInput();
          }
        }}
      >
        {!hasFiles ? (
          // Empty state - show upload prompt
          <div className="flex flex-col items-center gap-2">
            <UploadIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                <span className="md:hidden">{t('upload.chooseOrDrag')}</span>
                <span className="hidden md:inline">{t('upload.chooseOrDragDesktop')}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">{t('upload.supportedFormats')}</p>
            </div>
          </div>
        ) : (
          // Files selected state - show files inside the drop zone
          <div className="flex-1 flex flex-col gap-3 min-h-0">
            <div className="flex-shrink-0">
              {/* Header with file count and actions */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <UploadIcon className="h-4 w-4 text-primary" />
                  <h4 className="font-medium text-sm">
                    {isSelectionMode
                      ? t('upload.managingFiles', { count: files.length })
                      : t('upload.selectedFiles', { count: files.length })}
                  </h4>
                </div>
                <div className="flex items-center gap-2 relative z-20">
                  {hasCompleted && !isSelectionMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCompleted}
                      className="h-7 px-3 text-xs relative z-20"
                    >
                      {t('upload.clearCompleted')}
                    </Button>
                  )}
                  {!isSelectionMode && (
                    <p className="text-xs text-muted-foreground hidden md:block">
                      {t('upload.dropMoreFiles')}
                    </p>
                  )}
                </div>
              </div>

              {/* Selection mode controls */}
              {isSelectionMode && (
                <div className="bg-muted/10 border border-border/50 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={allPendingSelected ? deselectAllFiles : selectAllFiles}
                        className="h-9 w-9 p-0"
                        disabled={pendingFiles.length === 0}
                      >
                        {allPendingSelected ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </Button>

                      {selectedFiles.size > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={removeSelectedFiles}
                          className="h-9 w-9 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      )}

                      <div className="text-sm font-medium text-muted-foreground ml-2">
                        {selectedFiles.size > 0
                          ? t('upload.countSelected', { count: selectedFiles.size })
                          : t('upload.countFiles', { count: pendingFiles.length })}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleSelectionMode}
                      className="h-8 px-3 text-xs"
                    >
                      {t('upload.done')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Compact grid layout for files - stable layout */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 content-start flex-1 min-h-0 overflow-y-auto p-1 custom-scrollbar">
              {files.map((uploadFile) => (
                <div
                  key={uploadFile.id}
                  className={cn(
                    'relative rounded-lg bg-background transition-all duration-200 p-0.5',
                    isSelectionMode &&
                      uploadFile.status === 'pending' &&
                      selectedFiles.has(uploadFile.id) &&
                      'ring-2 ring-primary bg-primary/5',
                    isSelectionMode &&
                      uploadFile.status === 'pending' &&
                      !selectedFiles.has(uploadFile.id) &&
                      'opacity-60',
                    !isSelectionMode && 'border'
                  )}
                >
                  <div
                    className="relative aspect-square group cursor-pointer overflow-hidden rounded-md select-none"
                    onClick={(e) => {
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false;
                        return;
                      }
                      if (isSelectionMode && uploadFile.status === 'pending') {
                        toggleFileSelection(uploadFile.id);
                      } else if (!isSelectionMode && uploadFile.status === 'pending') {
                        // Desktop: Ctrl+click starts multi-select
                        if (e.ctrlKey || e.metaKey) {
                          setIsSelectionMode(true);
                          toggleFileSelection(uploadFile.id);
                        } else {
                          confirmRemoveFile(uploadFile.id);
                        }
                      }
                    }}
                    onTouchStart={() => {
                      if (!isSelectionMode && uploadFile.status === 'pending') {
                        const touchTimer = setTimeout(() => {
                          longPressTriggeredRef.current = true;
                          setIsSelectionMode(true);
                          toggleFileSelection(uploadFile.id);
                        }, 500);

                        const cleanup = () => {
                          clearTimeout(touchTimer);
                          document.removeEventListener('touchend', cleanup);
                          document.removeEventListener('touchmove', cleanup);
                        };

                        document.addEventListener('touchend', cleanup);
                        document.addEventListener('touchmove', cleanup);
                      }
                    }}
                  >
                    {uploadFile.thumbnail ? (
                      uploadFile.file.type.startsWith('video/') &&
                      uploadFile.thumbnail.startsWith('blob:') ? (
                        <video
                          src={uploadFile.thumbnail}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover transition-all duration-200"
                        />
                      ) : (
                        <Image
                          src={uploadFile.thumbnail}
                          alt={uploadFile.file.name}
                          width={100}
                          height={100}
                          className="w-full h-full object-cover transition-all duration-200"
                        />
                      )
                    ) : uploadFile.file.type.startsWith('video/') ? (
                      <div className="w-full h-full bg-gradient-to-br from-blue-50 to-blue-100 flex flex-col items-center justify-center">
                        <div className="text-2xl mb-1">🎬</div>
                        <div className="text-xs text-gray-600 text-center px-1">
                          {uploadFile.file.name.split('.').pop()?.toUpperCase()}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-muted/20 flex items-center justify-center">
                        <Camera className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}

                    {(uploadFile.thumbnail || uploadFile.file.type.startsWith('video/')) && (
                      <>
                        {/* Normal mode: Show trash on hover */}
                        {!isSelectionMode && uploadFile.status === 'pending' && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                              <Trash2 className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Selection checkbox in top-right corner when in selection mode */}
                    {isSelectionMode && uploadFile.status === 'pending' && (
                      <div className="absolute top-1 right-1 z-10">
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 border-white bg-white shadow-md flex items-center justify-center transition-all duration-200',
                            selectedFiles.has(uploadFile.id) && 'bg-primary border-primary'
                          )}
                        >
                          {selectedFiles.has(uploadFile.id) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Status indicator (not in selection mode) */}
                    {!isSelectionMode && (
                      <div
                        className={cn(
                          'absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center border-2 border-white shadow-md text-white text-xs',
                          uploadFile.status === 'success' && 'bg-green-500',
                          uploadFile.status === 'error' && 'bg-red-500',
                          uploadFile.status === 'uploading' &&
                            'bg-blue-500 animate-[bounce_1s_infinite]',
                          uploadFile.status === 'pending' && 'bg-gray-400'
                        )}
                      >
                        {uploadFile.status === 'success' && <Check className="w-2 h-2" />}
                        {uploadFile.status === 'error' && <X className="w-2 h-2" />}
                        {uploadFile.status === 'uploading' && <UploadIcon className="w-2 h-2" />}
                      </div>
                    )}
                  </div>

                  {/* Compact file info */}
                  <div className="mt-1">
                    <div className="text-xs font-medium truncate" title={uploadFile.file.name}>
                      {uploadFile.file.name}
                    </div>

                    {/* File size info */}
                    <div className="text-xs text-muted-foreground truncate">
                      {formatFileSize(uploadFile.file.size)}
                      {(() => {
                        // Only show compression info for image files (not videos)
                        if (uploadFile.file.type.startsWith('image/')) {
                          const compressionInfo = getCompressionInfo(uploadFile.file.size);
                          return (
                            compressionInfo.willCompress && (
                              <span
                                className="text-orange-600 ml-1"
                                title={`Will be compressed by ${compressionInfo.estimatedSizeReduction} to fit 20MB limit`}
                              >
                                ⚡ -{compressionInfo.estimatedSizeReduction}
                              </span>
                            )
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {uploadFile.status === 'uploading' && (
                      <Progress value={uploadFile.progress} className="h-1 mt-1" />
                    )}

                    {uploadFile.status === 'error' && uploadFile.error && (
                      <p className="text-xs text-red-600 truncate" title={uploadFile.error}>
                        Error
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const sharedDialogsAndInput = (
    <>
      {/* Confirmation Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmDialog.removeFile')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('confirmDialog.removeFileDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('upload.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fileToDelete && removeFile(fileToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('upload.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/mov,video/quicktime,video/avi,video/webm"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
        id="wedding-memories-file-input"
      />
    </>
  );

  if (isLargeScreen) {
    // Desktop: Use Dialog
    return (
      <>
        <Dialog
          open={isOpen}
          onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) setLastUploadSuccessCount(0);
          }}
        >
          <DialogTrigger asChild>
            <TriggerButton label={t('upload.addFiles')} />
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle>{t('upload.title')}</DialogTitle>
                  <DialogDescription>
                    {t('upload.description', {
                      brideName: appConfig.brideName,
                      groomName: appConfig.groomName,
                      interpolation: { escapeValue: false },
                    })}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t('upload.addingAs')}</span>
                  <span className="font-medium">{guestName || t('upload.notSet')}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEditingName(true);
                    }}
                    className="h-7 px-2 text-xs"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    {t('nameDialog.edit')}
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {uploadContent}

            <DialogFooter className="flex-shrink-0">
              {hasSuccessfulUploads && pendingCount === 0 ? (
                // Show "View Gallery" and "Close" when uploads are complete
                <div className="grid grid-cols-2 gap-2 w-full">
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    {t('upload.close')}
                  </Button>
                  <Button onClick={handleViewGallery} className="bg-green-600 hover:bg-green-700">
                    {t('upload.viewGallery', { count: successCount })}
                  </Button>
                </div>
              ) : (
                // Show standard upload interface with optional + button
                <div
                  className={cn(
                    'grid gap-2 w-full',
                    hasFiles && !isSelectionMode ? 'grid-cols-[auto_1fr_1fr]' : 'grid-cols-2'
                  )}
                >
                  {hasFiles && !isSelectionMode && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        triggerFileInput();
                      }}
                      className="border-dashed border-muted-foreground/50 hover:border-primary/50 hover:bg-muted/25 text-muted-foreground hover:text-primary touch-manipulation"
                      aria-label={t('upload.addMore')}
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    {t('upload.close')}
                  </Button>
                  <Button
                    onClick={handleUploadAll}
                    disabled={!hasFiles || pendingCount === 0 || isUploading || !guestName.trim()}
                  >
                    {isUploading
                      ? t('upload.adding', { count: uploadingCount })
                      : t('upload.addCount', { count: pendingCount })}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Name edit dialog for desktop */}
        <Dialog
          open={isEditingName}
          onOpenChange={(open) => {
            setIsEditingName(open);
            if (open) {
              setCurrentNameValue(guestName || '');
              setNameError(null);
            } else {
              setNameError(null);
            }
          }}
        >
          <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{t('nameDialog.title')}</DialogTitle>
              <DialogDescription>{t('nameDialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Input
                  ref={nameInputRef}
                  type="text"
                  placeholder={t('nameDialog.placeholder')}
                  value={currentNameValue}
                  autoFocus
                  onChange={handleNameInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!nameError) {
                        handleNameChange();
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      nameInputRef.current?.blur();
                      setIsEditingName(false);
                    }
                  }}
                  className={nameError ? 'border-destructive focus:border-destructive' : ''}
                />
                <div className="h-6 flex items-center">
                  {nameError && (
                    <p className="text-sm text-destructive flex items-center gap-2">
                      <span className="w-4 h-4">⚠️</span>
                      {nameError}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  nameInputRef.current?.blur();
                  setIsEditingName(false);
                }}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                {t('upload.cancel')}
              </Button>
              <Button
                onClick={handleNameChange}
                className="w-full sm:w-auto order-1 sm:order-2"
                disabled={!!nameError}
              >
                {t('nameDialog.updateName')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {sharedDialogsAndInput}
      </>
    );
  }
  return (
    <div
      className={`fixed bottom-30 right-6 z-50 transition-opacity duration-200 ${isModalOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setLastUploadSuccessCount(0);
            setIsEditingNameMobile(false);
            setNameError(null);
          }
        }}
        repositionInputs={false}
      >
        <DrawerTrigger asChild>
          <TriggerButton label={t('upload.addFiles')} />
        </DrawerTrigger>
        <DrawerContent className="max-h-[90dvh] h-[90dvh] flex flex-col">
          <DrawerHeader className="flex-shrink-0 border-b bg-background/95 backdrop-blur">
            <div className="space-y-2">
              <DrawerTitle>{t('upload.title')}</DrawerTitle>
              <DrawerDescription>
                {t('upload.description', {
                  brideName: appConfig.brideName,
                  groomName: appConfig.groomName,
                  interpolation: { escapeValue: false },
                })}
              </DrawerDescription>
              <div className="pt-2 border-t">
                {isEditingNameMobile ? (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                    <label className="text-xs text-muted-foreground">{t('nameDialog.title')}</label>
                    <div className="flex items-center gap-2">
                      <Input
                        ref={nameInputRef}
                        type="text"
                        placeholder={t('nameDialog.placeholder')}
                        value={currentNameValue}
                        autoFocus
                        onChange={handleNameInput}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!nameError) {
                              handleNameChange();
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            nameInputRef.current?.blur();
                            setIsEditingNameMobile(false);
                            setNameError(null);
                          }
                        }}
                        enterKeyHint="done"
                        className={cn(
                          'h-9 flex-1',
                          nameError && 'border-destructive focus:border-destructive'
                        )}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          nameInputRef.current?.blur();
                          setIsEditingNameMobile(false);
                          setNameError(null);
                        }}
                        aria-label={t('upload.cancel')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-primary hover:text-primary/80"
                        onClick={handleNameChange}
                        disabled={!!nameError}
                        aria-label={t('nameDialog.updateName')}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                    {nameError && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <span className="w-3 h-3">⚠️</span>
                        {nameError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors cursor-pointer"
                    onClick={() => {
                      setCurrentNameValue(guestName || '');
                      setNameError(null);
                      setIsEditingNameMobile(true);
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">{t('upload.addingAs')}</span>
                      <span className="font-medium text-foreground">
                        {guestName || t('upload.notSet')}
                      </span>
                    </div>
                    <Edit className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>
          </DrawerHeader>

          <div className="flex-1 flex flex-col min-h-0">{uploadContent}</div>

          <DrawerFooter className="flex-shrink-0 border-t bg-background/95 backdrop-blur">
            {hasSuccessfulUploads && pendingCount === 0 ? (
              // Show "View Gallery" and "Close" when uploads are complete
              <div className="grid grid-cols-2 gap-2">
                <DrawerClose asChild>
                  <Button variant="outline" className="w-full">
                    {t('upload.close')}
                  </Button>
                </DrawerClose>
                <Button onClick={handleViewGallery} className="bg-green-600 hover:bg-green-700">
                  {t('upload.viewGallery', { count: successCount })}
                </Button>
              </div>
            ) : (
              // Show standard upload interface with optional + button
              <div
                className={cn(
                  'grid gap-2',
                  hasFiles && !isSelectionMode ? 'grid-cols-[auto_1fr_1fr]' : 'grid-cols-2'
                )}
              >
                {hasFiles && !isSelectionMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      triggerFileInput();
                    }}
                    className="border-dashed border-muted-foreground/50 hover:border-primary/50 hover:bg-muted/25 text-muted-foreground hover:text-primary touch-manipulation"
                    aria-label={t('upload.addMore')}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                )}
                <DrawerClose asChild>
                  <Button variant="outline" className="w-full">
                    {t('upload.close')}
                  </Button>
                </DrawerClose>
                <Button
                  onClick={handleUploadAll}
                  disabled={!hasFiles || pendingCount === 0 || isUploading || !guestName.trim()}
                >
                  {isUploading
                    ? t('upload.adding', { count: uploadingCount })
                    : t('upload.addCount', { count: pendingCount })}
                </Button>
              </div>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {sharedDialogsAndInput}
    </div>
  );
};
