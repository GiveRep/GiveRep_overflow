import { useMindshareProjects } from "@/hooks/mindshare/use-projects";
import type { DateRange } from "@/pages/giverep/mindshare-dashboard";
import { ProjectCard } from "./project-card";
import { MindshareProject } from "@/types/mindshare";
import { ProjectsGridSkeleton } from "./projects-skeleton";
import React, { useEffect, useState, lazy, Suspense } from "react";
import { ProjectTag } from "@/types/loyalty";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { TbLoader2 } from "react-icons/tb";

// Lazy load the ProjectTweetsView component
const ProjectTweetsView = lazy(
  () => import("@/components/giverep/ProjectTweetsView")
);

interface ProjectsTabProps {
  dateRange: DateRange;
  selectedTagIds: number[];
  setSelectedTagIds: (tagIds: number[]) => void;
  projectTags: ProjectTag[];
}

export function ProjectsTab({ dateRange, selectedTagIds, setSelectedTagIds, projectTags }: ProjectsTabProps) {
  const { projects, twitterInfo, isLoading } = useMindshareProjects({
    dateRange,
  });

  const [openDialogId, setOpenDialogId] = useState<number | null>(null);
  
  // Initialize from URL params
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const viewParam = searchParams.get("view");
    
    // Only open dialog if we're on the projects tab
    const tabParam = searchParams.get("tab");
    if ((!tabParam || tabParam === "projects") && viewParam) {
      const projectId = parseInt(viewParam, 10);
      if (!isNaN(projectId)) {
        setOpenDialogId(projectId);
      }
    }
  }, []);

  // Filter and recalculate percentages based on selected tags
  const filteredProjects = React.useMemo(() => {
    if (!projects) return [];

    // Filter projects by selected tags
    let filtered = [...projects];
    
    if (selectedTagIds.length > 0) {
      filtered = projects.filter((project: MindshareProject) =>
        project.tag_ids?.some((tagId) => selectedTagIds.includes(tagId))
      );
    }

    // Recalculate share percentages based on filtered projects only
    const totalFilteredEngagement = filtered.reduce((sum, project) => {
      return sum + (project.metrics?.total_engagement || 0);
    }, 0);

    // Update share percentages for filtered projects
    const projectsWithRecalculatedPercentages = filtered.map(project => {
      const projectEngagement = project.metrics?.total_engagement || 0;
      const newSharePercentage = totalFilteredEngagement > 0 
        ? (projectEngagement / totalFilteredEngagement) * 100 
        : 0;

      return {
        ...project,
        metrics: {
          ...project.metrics!,
          share_percentage: newSharePercentage
        }
      };
    });

    // Sort by recalculated share percentage (descending)
    return projectsWithRecalculatedPercentages.sort((a, b) => {
      const aPercentage = a.metrics?.share_percentage || 0;
      const bPercentage = b.metrics?.share_percentage || 0;
      return bPercentage - aPercentage;
    });
  }, [projects, selectedTagIds]);

  if (isLoading) {
    return <ProjectsGridSkeleton />;
  }

  // Get the number of days from dateRange
  const getDayCount = (range: DateRange): number => {
    return parseInt(range, 10);
  };

  return (
    <>
      {/* Display selected tags as filters above the grid */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <span className="text-sm text-muted-foreground">Filtering by tags:</span>
          {selectedTagIds.map((tagId) => {
            const tag = projectTags.find((t) => t.id === tagId);
            if (!tag) return null;
            return (
              <Badge
                key={tag.id}
                className="bg-primary/20 text-primary border-primary/30 py-1 pl-2 pr-1 gap-1 flex items-center"
              >
                {tag.name}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const newTagIds = selectedTagIds.filter((id) => id !== tagId);
                    setSelectedTagIds(newTagIds);
                  }}
                  className="h-4 w-4 p-0 ml-1 rounded-full hover:bg-primary/20"
                >
                  <span className="sr-only">Remove</span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3"
                  >
                    <path
                      d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                      fill="currentColor"
                    />
                  </svg>
                </Button>
              </Badge>
            );
          })}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedTagIds([]);
            }}
            className="text-muted-foreground hover:text-foreground text-xs py-1 h-7"
          >
            Clear all
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProjects.map((project: MindshareProject, index: number) => (
          <ProjectCard
            key={project.id}
            project={project}
            rank={index}
            twitterInfo={twitterInfo?.get(
              project.twitter_handle?.replace("@", "").toLowerCase()
            )}
            onViewTweets={() => {
              setOpenDialogId(project.id);
              // Update URL when opening project
              const url = new URL(window.location.href);
              url.searchParams.set("view", project.id.toString());
              window.history.replaceState({}, "", url.toString());
            }}
          />
        ))}
      </div>

      {/* Project Tweets Dialog */}
      <Dialog
        open={!!openDialogId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenDialogId(null);
            // Remove view param when closing dialog
            const url = new URL(window.location.href);
            url.searchParams.delete("view");
            url.searchParams.delete("viewTab");
            window.history.replaceState({}, "", url.toString());
          }
        }}
      >
        <DialogContent className="bg-[#12131e] border-[#2b2d3c] text-white max-w-4xl w-[95vw] max-h-[90vh] flex flex-col overflow-hidden p-0">
          {openDialogId !== null && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <TbLoader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-white/50 text-sm">Loading tweets...</p>
                  </div>
                </div>
              }
            >
              <ProjectTweetsView
                projectId={openDialogId}
                days={getDayCount(dateRange)}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
