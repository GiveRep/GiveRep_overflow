export function ProjectsGridSkeleton() {
  // Render 8 skeleton cards as placeholders
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          className="flex flex-col animate-pulse rounded-lg bg-card/80"
          aria-hidden="true"
        >
          {/* Banner */}
          <div className="h-32 rounded-t-lg bg-muted-foreground/20" />

          <div className="flex flex-col p-4 gap-2">
            {/* Project image & details */}
            <div className="flex items-start gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-muted-foreground/20" />

              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-3/4 rounded bg-muted-foreground/20" />
                <div className="h-3 w-1/2 rounded bg-muted-foreground/20" />
              </div>
            </div>

            {/* Mindshare percentage */}
            <div className="h-5 w-32 mb-2 rounded bg-muted-foreground/20" />

            {/* Metrics */}
            <div className="h-12 rounded bg-muted-foreground/20" />

            {/* View Tweets */}
            <div className="h-10 rounded bg-muted-foreground/20 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
