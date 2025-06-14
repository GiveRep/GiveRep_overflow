// components/mindshare/ProjectCard.tsx
import { memo } from "react";
import { MindshareNftCollection } from "@/types/mindshare";
import { cn } from "@/lib/utils";
import { TwitterUserInfo } from "@/utils/twitterUserInfo";
import { Crown } from "lucide-react"
import { getShareColorClass } from "./project-card";
import { formatMistToSui, formatMistToSuiCompact, formatNumber } from "@/lib/formatters";
import { useTranslation } from "react-i18next";

interface CollectionCardProps {
  collection: MindshareNftCollection & { twitterInfo?: TwitterUserInfo };
  rank: number;
  onSelect: (collection: MindshareNftCollection & { twitterInfo?: TwitterUserInfo }) => void;
}

export const CollectionCard = memo(function CollectionCard({
  collection,
  rank,
  onSelect,
}: CollectionCardProps) {
  const twitterInfo = collection.twitterInfo;

  const { border, text } = getShareColorClass(collection.mindsharePercentage);

  const getRankStyles = (rank: number) => {
    if (rank === 0) return "col-span-1 sm:col-span-2 lg:col-span-1";
    return "col-span-1";
  };

  const generateGradient = () => {
		const hash = collection.nftName
			.split('')
			.reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);

		const hue1 = hash % 360;
		const hue2 = (hue1 + 40) % 360;

		return `from-[hsl(${hue1},70%,80%)] to-[hsl(${hue2},70%,60%)]`;
	};

  return (
    <div className={getRankStyles(rank)}>
      <div
        className={cn(
          "flex flex-col h-full backdrop-blur-sm rounded-lg overflow-hidden",
          "bg-gradient-to-br from-card/90 to-card/70 shadow-lg",
          "transition-all duration-500 ease-in-out transform",
          "hover:scale-[1.02] hover:shadow-xl hover:shadow-foreground/5 hover:cursor-pointer",
          "hover:bg-gradient-to-br hover:from-card/95 hover:to-card/80",
          `border-2 ${border} border-opacity-50 hover:border-opacity-85`,
          rank === 0 && `animate-pulse-subtle ${text}`
        )}
        onClick={() => onSelect(collection)}
      >
        {/* Banner Image */}
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-r from-primary/5 to-secondary/10">
          {twitterInfo?.banner_url || collection.imageUrl ? (
              <div className="relative h-32 w-full overflow-hidden bg-gradient-to-r from-primary/5 to-secondary/10">
                <img
                  src={twitterInfo?.banner_url || collection.imageUrl || ''}
                  alt={`${collection.nftName} banner`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-card to-transparent" />
              </div>
          ) : (
            <div
              className={`w-full h-full bg-gradient-to-br ${generateGradient()} opacity-50`}
            />
          )}
        </div>

        <div className="p-4">
          <CollectionHeader
            collection={collection}
            twitterInfo={twitterInfo}
            rank={rank}
          />

          <ProjectShareMetric
            percentage={collection.mindsharePercentage || 0}
            rank={rank}
          />

          {/* @todo */}
          {/* <ProjectSparkline data={project.sparkline || []} /> */}

          <CollectionMetrics collection={collection} />
        </div>
      </div>
    </div>
  );
});

interface CollectionHeaderProps {
  collection: any;
  twitterInfo?: TwitterUserInfo;
  rank: number;
}

export function CollectionHeader({
  collection,
  twitterInfo,
  rank,
}: CollectionHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="relative">
        <div className="h-12 w-12 rounded-xl overflow-hidden">
          <img
            src={twitterInfo?.profile_image_url || collection.imageUrl || collection.logo_url || ''}
            alt={collection.nftName}
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
        <h3 className="font-semibold truncate">{collection.nftName}</h3>
        {collection.twitterHandle && (
          <a
            href={`https://twitter.com/${collection.twitterHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground duration-300 transition-colors"
          >
            @{collection.twitterHandle.replace("@", "")}
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

interface CollectionMetricsProps {
  collection: MindshareNftCollection;
}

export function CollectionMetrics({ collection }: CollectionMetricsProps) {
  const { t } = useTranslation();
  const supply = (collection as any).tradeportData?.supply || collection.totalSupply;
  const floor = (collection as any).floor || collection.price;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-4 p-2 bg-muted rounded-lg">
        <MetricItem label={t('mindshare.users')} value={formatNumber(collection.userCount)} />
        <MetricItem label={t('mindshare.supply')} value={supply ? formatNumber(supply) : "--"} />
        <MetricItem label={t('mindshare.floor')} value={floor ? `${formatMistToSuiCompact(floor)} SUI` : "--"} />
      </div>
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
