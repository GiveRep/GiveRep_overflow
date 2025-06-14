// components/mindshare/ProjectCard.tsx
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { MindshareProject } from "@/types/mindshare";
import { cn } from "@/lib/utils";
import { TwitterUserInfo } from "@/utils/twitterUserInfo";
import { Crown } from "lucide-react";
import { useTranslation } from "react-i18next";

// helper function to get mindshare percentage color
export function getShareColorClass(percentage: number): {
  border: string;
  text: string;
} {
  if (percentage > 30)
    return { border: "border-amber-400", text: "text-amber-400" };

  if (percentage > 15)
    return { border: "border-blue-400", text: "text-blue-400" };

  if (percentage > 5)
    return { border: "border-emerald-400", text: "text-emerald-400" };

  return { border: "border", text: "text-foreground" };
}

interface ProjectCardProps {
  project: MindshareProject;
  rank: number;
  twitterInfo?: TwitterUserInfo;
  onViewTweets: (projectId: number) => void;
}

export const ProjectCard = memo(function ProjectCard({
  project,
  rank,
  twitterInfo,
  onViewTweets,
}: ProjectCardProps) {
  const { t } = useTranslation();
  const sharePercentage = project.metrics?.share_percentage || 0;
  const { border, text } = getShareColorClass(sharePercentage);

  const getRankStyles = (rank: number) => {
    if (rank === 0) return "col-span-1 sm:col-span-2 lg:col-span-1";
    return "col-span-1";
  };

  return (
    <div className={getRankStyles(rank)}>
      <div
        className={cn(
          "flex flex-col h-full backdrop-blur-sm rounded-lg overflow-hidden",
          "bg-gradient-to-br from-card/90 to-card/70 shadow-lg",
          "transition-all duration-500 ease-in-out transform",
          "hover:scale-[1.02] hover:shadow-xl hover:shadow-foreground/5",
          "hover:bg-gradient-to-br hover:from-card/95 hover:to-card/80",
          `border-2 ${border} border-opacity-50 hover:border-opacity-75`,
          rank === 0 && `animate-pulse-subtle ${text}`,
          "relative" // Add relative positioning to ensure proper stacking
        )}
      >
        {/* Banner Image */}
        {twitterInfo?.banner_url && (
          <div className="relative w-full h-24 overflow-hidden rounded-t-lg">
            <img
              src={twitterInfo.banner_url}
              alt={`${project.name} banner`}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
          </div>
        )}

        <div className="p-4">
          <ProjectHeader
            project={project}
            twitterInfo={twitterInfo}
            rank={rank}
          />

          <ProjectShareMetric
            percentage={project.metrics?.share_percentage || 0}
            rank={rank}
          />

          {/* @todo */}
          {/* <ProjectSparkline data={project.sparkline || []} /> */}

          <ProjectMetrics metrics={project.metrics} />

          <Button
            variant="outline"
            className="w-full mt-2"
            onClick={() => onViewTweets(project.id)}
          >
            {t('mindshare.viewTweets')}
          </Button>
        </div>
      </div>
    </div>
  );
});

interface ProjectHeaderProps {
  project: MindshareProject;
  twitterInfo?: TwitterUserInfo;
  rank: number;
}

export function ProjectHeader({
  project,
  twitterInfo,
  rank,
}: ProjectHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="relative">
        <div className="h-12 w-12 rounded-xl overflow-hidden">
          <img
            src={
              twitterInfo?.profile_image_url ?? project.logo_url ?? undefined
            }
            alt={project.name}
            className="h-full w-full object-cover"
          />
        </div>
        {rank < 3 && (
          <div className="absolute -top-1 -right-1">
            <RankBadge rank={rank} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate">{project.name}</h3>
        {project.twitter_handle && (
          <a
            href={`https://twitter.com/${project.twitter_handle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground duration-300 transition-colors"
          >
            @{project.twitter_handle.replace("@", "")}
          </a>
        )}
      </div>
    </div>
  );
}

interface ProjectShareMetricProps {
  percentage: number;
  rank: number;
}

export function ProjectShareMetric({
  percentage,
  rank,
}: ProjectShareMetricProps) {
  const { t } = useTranslation();
  const { text } = getShareColorClass(percentage);

  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-bold tracking-tight",
            rank === 0 ? "text-3xl" : "text-2xl",
            text
          )}
        >
          {percentage.toFixed(2)}%
        </span>
        <span className="text-muted-foreground text-sm">{t('mindshare.mindshare')}</span>
      </div>
    </div>
  );
}

interface ProjectMetricsProps {
  metrics?: {
    tweet_count: number;
    total_views: number;
    total_engagement: number;
  };
}

export function ProjectMetrics({ metrics }: ProjectMetricsProps) {
  const { t } = useTranslation();
  if (!metrics) return null;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded-lg">
      <MetricItem label={t('mindshare.tweets')} value={formatNumber(metrics.tweet_count)} />
      <MetricItem label={t('mindshare.views')} value={formatNumber(metrics.total_views)} />
      <MetricItem
        label={t('mindshare.engagement')}
        value={formatNumber(metrics.total_engagement)}
      />
    </div>
  );
}

interface MetricItemProps {
  label: string;
  value: string;
}

export function MetricItem({ label, value }: MetricItemProps) {
  return (
    <div className="text-center">
      <div className="text-sm font-medium text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

interface RankBadgeProps {
  rank: number;
}

export function RankBadge({ rank }: RankBadgeProps) {
  const badges = {
    0: "text-yellow-400",
    1: "text-slate-300",
    2: "text-amber-600",
  };

  return (
    <div className={cn("h-5 w-5", badges[rank as keyof typeof badges])}>
      <Crown className="h-full w-full" />
    </div>
  );
}
