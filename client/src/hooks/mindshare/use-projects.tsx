import { useQuery } from "@tanstack/react-query";
import { getTwitterUserInfoBatch } from "@/utils/twitterUserInfo";
import { DateRange } from "@/pages/giverep/mindshare-dashboard";
import { MindshareProject } from "@/types/mindshare";

interface MindshareProjectsOptions {
  dateRange: DateRange;
}

export function useMindshareProjects({ dateRange }: MindshareProjectsOptions) {
  // @dev we prefix the queryKey with 'mindshare' so we can invalidate both
  // projects & future mindshare queries for refetching directly from the client.
  const projectsQuery = useQuery({
    queryKey: ["mindshare", "projects", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams({
        days: dateRange,
      });

      const response = await fetch(`/api/mindshare/projects?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      return response.json();
    }
  });

  const twitterQuery = useQuery({
    queryKey: ["twitter-info", projectsQuery.data],
    queryFn: async () => {
      const handles = projectsQuery.data
        ?.filter((project: MindshareProject) => project.twitter_handle)
        .map((project: MindshareProject) =>
          project.twitter_handle!.replace("@", "").toLowerCase()
        );

      return getTwitterUserInfoBatch(handles);
    },
    enabled: !!projectsQuery.data,
  });

  return {
    projects: projectsQuery.data,
    twitterInfo: twitterQuery.data,
    isLoading: projectsQuery.isLoading || twitterQuery.isLoading,
    isError: projectsQuery.isError || twitterQuery.isError,
    refetch: projectsQuery.refetch,
  };
}
