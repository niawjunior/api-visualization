'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

// Base shimmer skeleton
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div 
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className
      )} 
    />
  );
}

// API Endpoint Card Skeleton
export function ApiEndpointSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-border/50 bg-card space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-16 rounded-full" /> {/* Method badge */}
        <Skeleton className="h-5 w-48" /> {/* Path */}
        <Skeleton className="h-4 w-20 ml-auto" /> {/* Function name */}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14 rounded-full" /> {/* Tag */}
        <Skeleton className="h-5 w-14 rounded-full" /> {/* Tag */}
      </div>
    </div>
  );
}

// Group of endpoint skeletons
export function ApiExplorerSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-6">
      {/* Group header skeleton */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
        <div className="space-y-2 pl-7">
          {Array.from({ length: count }).map((_, i) => (
            <ApiEndpointSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Second group */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
        <div className="space-y-2 pl-7">
          {Array.from({ length: Math.max(1, count - 2) }).map((_, i) => (
            <ApiEndpointSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// Visual graph skeleton
export function GraphSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="relative">
        {/* Fake nodes */}
        <div className="absolute -top-20 -left-24">
          <Skeleton className="h-12 w-24 rounded-lg" />
        </div>
        <div className="absolute -top-20 right-0">
          <Skeleton className="h-12 w-20 rounded-lg" />
        </div>
        <div className="absolute top-10 -left-16">
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
        <div className="absolute top-10 right-4">
          <Skeleton className="h-10 w-20 rounded-lg" />
        </div>
        <div className="absolute top-32 left-0">
          <Skeleton className="h-12 w-24 rounded-lg" />
        </div>
        
        {/* Center loader */}
        <div className="flex flex-col items-center gap-3 p-8">
          <div className="w-12 h-12 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Building visualization...</p>
        </div>
      </div>
    </div>
  );
}
