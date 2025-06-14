import { MindshareNftCollection } from "@/types/mindshare";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge"
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { getTwitterUserInfo, TwitterUserInfo } from "@/utils/twitterUserInfo";
import { useTranslation } from "react-i18next";

interface QuickCollectionViewProps {
    collection: MindshareNftCollection & { twitterInfo?: any } | null;
    isOpen: boolean;
    onClose: () => void;
    users: any[];
    usersLoading: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
    hasNextPage: boolean;
}

// Component for individual user row with its own Twitter info fetching
function UserRow({ user, onNavigate, onImageError }: { user: any; onNavigate: () => void; onImageError: (url: string) => void }) {
    const { t } = useTranslation();
    const [twitterInfo, setTwitterInfo] = useState<TwitterUserInfo | null>(null);
    const [imageError, setImageError] = useState(false);
    
    useEffect(() => {
        const fetchInfo = async () => {
            if (user.twitterHandle) {
                const handle = user.twitterHandle.replace('@', '').toLowerCase();
                const info = await getTwitterUserInfo(handle);
                setTwitterInfo(info);
            }
        };
        fetchInfo();
    }, [user.twitterHandle]);
    
    const displayName = twitterInfo?.display_name || user.twitterHandle?.replace('@', '');
    const profileImageUrl = user.profileImageUrl; // Keep using the NFT image
    
    return (
        <div
            className={cn(
                "flex items-center gap-3 px-3 py-3 border-b last:border-b-0",
                "hover:bg-muted/20 transition-all duration-200",
                "group cursor-pointer"
            )}
            onClick={onNavigate}
        >
            <div className="relative">
                {profileImageUrl && !imageError ? (
                    <img
                        src={profileImageUrl}
                        alt={user.twitterHandle}
                        className="w-10 h-10 rounded-lg object-cover border border-muted group-hover:border-primary/50 transition-colors"
                        onError={() => {
                            setImageError(true);
                            onImageError(profileImageUrl);
                        }}
                    />
                ) : (
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 border border-muted group-hover:border-primary/50 transition-colors"
                    >
                        <span className="text-sm font-bold text-foreground">
                            {user.twitterHandle.replace('@', '').charAt(0).toUpperCase()}
                        </span>
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="font-semibold text-primary truncate group-hover:underline">
                    {displayName}
                </div>
                {twitterInfo?.display_name && (
                    <div className="text-xs text-muted-foreground truncate">
                        @{user.twitterHandle.replace('@', '')}
                    </div>
                )}
            </div>
            <Badge className="rounded-md text-xs">{user.reputation.toLocaleString()} {t('mindshare.reputation')}</Badge>
        </div>
    );
}

export default function QuickCollectionView({ collection, isOpen, onClose, users, usersLoading, isFetchingNextPage, fetchNextPage, hasNextPage }: QuickCollectionViewProps) {
    const { t } = useTranslation();
    const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
    
    // Reset state when dialog opens/closes
    useEffect(() => {
        if (!isOpen) {
            setFailedImages(new Set());
        }
    }, [isOpen]);
    
    if (!collection || !isOpen) return null;

    const twitterInfo = collection.twitterInfo;

    function generateGradient() {
        const hash = collection!.nftName
            .split("")
            .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
        
        const hue1 = hash % 360;
        const hue2 = (hue1 + 40) % 360;
        return `from-[hsl(${hue1},70%,80%)] to-[hsl(${hue2},70%,60%)]`;
    }
    
    const handleImageError = (imageUrl: string) => {
        setFailedImages(prev => new Set(prev).add(imageUrl));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden rounded-xl border-0 shadow-2xl bg-background">
                <DialogHeader className="sr-only">
                    <DialogTitle>{t('mindshare.viewingCollection', { name: collection.nftName })}</DialogTitle>
                </DialogHeader>

                {/* Cover Image */}
                <div className="relative h-48 w-full bg-gradient-to-br from-primary/5 to-secondary/10">
                    {twitterInfo?.banner_url || collection.imageUrl ? (
                        <img
                            src={twitterInfo?.banner_url || collection.imageUrl || ''}
                            alt={collection.nftName}
                            className="object-cover w-full h-full"
                        />
                    ) : (
                        <div
                            className={`w-full h-full bg-gradient-to-br ${generateGradient()} opacity-50`}
                        />
                    )}
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
                </div>

                {/* Main Content */}
				<div className="p-4 select-none">
                    <div className="flex items-start justify-between mb-6">
						<div className="flex items-start gap-4">
							<div className="h-16 w-16 rounded-xl overflow-hidden border-4 border-background shadow-lg">
								{collection.twitterInfo?.profile_image_url || collection.imageUrl ? (
									<img
										src={collection.twitterInfo?.profile_image_url || collection.imageUrl || ''}
										alt={collection.nftName}
										width={64}
										height={64}
										className="object-cover"
									/>
								) : (
									<div
										className={`w-full h-full bg-gradient-to-br ${generateGradient()} flex items-center justify-center`}
									>
										<span className="text-xl font-bold text-white">
											{collection.nftName.charAt(0)}
										</span>
									</div>
								)}
							</div>

							<div>
								<h2 className="text-2xl font-bold tracking-tight">
									{collection.nftName}
								</h2>
                                {collection.twitterHandle && (
                                    <a
                                        href={`https://twitter.com/${collection.twitterHandle}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-foreground duration-300 transition-colors"
                                    >
                                        @{collection.twitterHandle.replace("@", "")}
                                    </a>
                                )}
							</div>
						</div>
					</div>

                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground/70 italic">
                            {t('mindshare.experimentalFeature')}
                        </p>
                        
                        <p className="text-xs text-blue-500/80 bg-blue-500/10 border border-blue-500/20 rounded-md px-2 py-1.5">
                            <span className="font-medium">{t('mindshare.note')}:</span> {t('mindshare.registeredUsersOnly')}
                        </p>
                        
                        <p className="text-xs font-mono uppercase text-muted-foreground py-1">
                            {t('mindshare.showingUsers', { count: users.filter(user => !user.profileImageUrl || !failedImages.has(user.profileImageUrl)).length })}
                        </p>
                    </div>

                    {/* Users Scroll Area */}
                    <div
                        className="h-96 overflow-auto border rounded-md bg-muted/10"
                        style={{ position: 'relative' }}
                        onScroll={e => {
                            const target = e.currentTarget;
                            if (
                                target.scrollHeight - target.scrollTop - target.clientHeight < 60 &&
                                hasNextPage &&
                                !usersLoading &&
                                !isFetchingNextPage
                            ) {
                                fetchNextPage();
                            }
                        }}
                    >
                        {usersLoading ? (
                            <div className="flex flex-col items-center justify-center h-40">
                                <Loader2 className="animate-spin text-primary w-8 h-8 mb-2" />
                                <span className="text-muted-foreground">{t('mindshare.loadingUsers')}</span>
                            </div>
                        ) : (
                            users.filter((user: any) => {
                                // Filter out users whose original profile image has failed
                                // This indicates they changed their profile picture and it no longer matches the NFT
                                if (user.profileImageUrl && failedImages.has(user.profileImageUrl)) {
                                    return false;
                                }
                                return true;
                            }).map((user: any, index: number) => (
                                <UserRow 
                                    key={user.id || index} 
                                    user={user} 
                                    onNavigate={() => window.open(`/mindshare/profile-nft-checker?handle=${user.twitterHandle.replace('@', '')}`, '_blank')}
                                    onImageError={handleImageError}
                                />
                            ))
                        )}

                        {isFetchingNextPage && (
                            <div className="flex flex-col items-center justify-center py-4">
                                <Loader2 className="animate-spin text-primary w-6 h-6 mb-1" />
                                <span className="text-xs text-muted-foreground">{t('mindshare.loadingMore')}</span>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}