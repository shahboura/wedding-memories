import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

function Spinner({ className, size = 'md', label, ...props }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-3',
  };

  const accessibleLabel = label ?? 'Loading...';

  return (
    <div
      className={cn(
        'animate-[spin_1.5s_ease-in-out_infinite] rounded-full border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_2.5s_linear_infinite]',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label={accessibleLabel}
      {...props}
    >
      <span className="sr-only">{accessibleLabel}</span>
    </div>
  );
}

export { Spinner };
