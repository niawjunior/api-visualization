'use client';

export function FileExplorerSkeleton() {
  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border overflow-hidden shadow-sm animate-pulse">
      {/* Header Skeleton */}
      <div className="p-3 border-b border-border bg-secondary/30 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 pb-1.5 opacity-50">
          <div className="w-4 h-4 rounded bg-muted"></div>
          <div className="h-4 w-32 rounded bg-muted"></div>
        </div>
        <div className="flex items-center gap-1.5 opacity-40">
           <div className="w-3 h-3 rounded-full bg-muted"></div>
           <div className="h-3 w-16 rounded bg-muted"></div>
           <div className="h-3 w-4 rounded bg-muted"></div>
           <div className="h-3 w-20 rounded bg-muted"></div>
        </div>
      </div>

      {/* File List Skeleton */}
      <div className="flex-1 p-2 space-y-1 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div 
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent"
            style={{ opacity: 1 - i * 0.1 }}
          >
            {/* Icon */}
            <div className="w-5 h-5 rounded bg-secondary shrink-0"></div>
            
            {/* Name */}
            <div className="flex-1 h-3 rounded bg-secondary"></div>
            
            {/* Size/Info */}
            <div className="w-12 h-2.5 rounded bg-secondary/50 shrink-0"></div>
          </div>
        ))}
      </div>

      {/* Footer Skeleton */}
      <div className="p-2 border-t border-border bg-secondary/10 flex justify-between items-center opacity-70">
         <div className="h-3 w-20 rounded bg-muted"></div>
         <div className="h-3 w-12 rounded bg-muted"></div>
      </div>
    </div>
  );
}
