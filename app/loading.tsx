import { Skeleton } from '../components/ui/skeleton';
import { appConfig } from '../config';
import { Camera } from 'lucide-react';

export default function Loading() {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 overflow-auto">
      <main className="mx-auto max-w-[1960px] px-4 py-4">
        <header className="flex justify-between items-start gap-4 mb-8">
          <div className="flex flex-col gap-1 flex-1">
            <h1 className="text-2xl sm:text-3xl font-serif font-light text-foreground leading-tight">
              <span className="text-primary font-medium">{appConfig.brideName}</span>
              <span className="text-muted-foreground mx-2 font-light">&amp;</span>
              <span className="text-primary font-medium">{appConfig.groomName}</span>
            </h1>
            <p className="text-sm text-muted-foreground font-light">Wedding Memories</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Lightweight placeholder instead of full Upload component */}
            <div className="h-14 px-5 py-3 rounded-full bg-primary/50 flex items-center gap-3 opacity-50 pointer-events-none">
              <Camera className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
        </header>

        <div className="columns-1 gap-5 sm:columns-2 xl:columns-3 2xl:columns-4">
          {Array.from({ length: 6 }).map((_, i) => {
            const aspectRatios = [
              { w: 720, h: 480 },
              { w: 720, h: 540 },
              { w: 720, h: 900 },
              { w: 720, h: 720 },
              { w: 720, h: 960 },
              { w: 720, h: 405 },
              { w: 720, h: 600 },
              { w: 720, h: 800 },
            ];

            const ratio = aspectRatios[i % aspectRatios.length];
            const height = Math.round((ratio.h / ratio.w) * 300);

            return (
              <div key={i} className="relative mb-5 block w-full overflow-hidden">
                <Skeleton className="w-full rounded-lg" style={{ height: `${height}px` }} />
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
