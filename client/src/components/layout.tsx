import { Link, useLocation } from "wouter";
import { BiLogoTwitter } from "react-icons/bi";
import { PiSealDuotone } from "react-icons/pi";
import { useQuery } from "@tanstack/react-query";
import {
  TbBrandX,
  TbChevronUp,
  TbStar,
  TbTrophy,
  TbUserCheck,
  TbUser,
  TbChartPie,
  TbChevronDown,
  TbCurrencyDollar,
  TbPlus,
  TbMenu2,
  TbX,
  TbPhoto,
  TbGift,
  TbSearch,
  TbHelp,
  TbTool,
  TbWallet,
} from "react-icons/tb";
import { AppContext } from "@/context/AppContext";
import { useContext, useState } from "react";
import WalletModal from "@/lib/wallet/walletModal";
import { useCustomWallet } from "@/context/CustomWallet";
import { ConnectWalletButton } from "../lib/wallet/ConnectWalletButton";
import { ConnectTwitterButton } from "../lib/twitter/ConnectTwitterButton";
import { useTwitterAuth } from "@/context/TwitterAuthContext";
import { useWalletProfile } from "@/hooks/use-wallet-profile";
import { GiveRepLogo } from "@/components/ui/GiveRepLogo";
import DraggableWalletButton from "@/components/DraggableWalletButton";
import { useExpandedView } from "@/context/ExpandedViewContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { setWalletOpen } = useContext(AppContext);
  const { isConnected, address, disconnectWallet } = useCustomWallet();
  const { twitterIsLogin, twitterUserName } = useTwitterAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isExpandedView } = useExpandedView();
  const { t } = useTranslation();

  // Get Twitter handle from wallet address if available
  const { twitterHandle: walletLinkedTwitter } = useWalletProfile(address);
  return (
    <div className="max-h-screen bg-background font-fans antialiased">
      {/* Header with dots pattern background */}
      <header className="border-b border-border/40 backdrop-blur-lg bg-background/80 sticky top-0 z-20">
        <div className={`${isExpandedView ? 'max-w-[95vw]' : 'max-w-7xl'} mx-auto px-3 sm:px-4 py-3 sm:py-4`}>
          {/* Desktop Navigation */}
          <nav className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-between">
              <a href="/" className="flex items-center gap-3">
                <HeaderLogo />
              </a>

              {/* Mobile menu button */}
              <div className="sm:hidden">
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="text-white p-1.5 rounded-sm hover:bg-[#1a1c29] focus:outline-none"
                >
                  {mobileMenuOpen ? (
                    <TbX className="h-5 w-5" />
                  ) : (
                    <TbMenu2 className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Navigation links - Desktop view */}
            <div
              className={`
              hidden sm:flex flex-wrap gap-4 sm:gap-6 items-center sm:justify-end lg:justify-center w-full lg:w-auto py-2 sm:py-0
            `}
            >
              <Link href="/">
                <span
                  className={`${
                    location === "/" ||
                    location === "/giverep" ||
                    location === "/giverep/"
                      ? "nav-tab-active font-medium"
                      : "nav-tab-inactive"
                  } cursor-pointer hover:text-primary hover:underline transition-colors text-sm sm:text-base py-1.5`}
                >
                  {t('nav.home')}
                </span>
              </Link>
              {/* Register link removed as Twitter auth serves as registration */}

              {/* Leaderboard link now goes directly to reputation leaderboard */}
              <Link href="/reputation-leaderboard">
                <span
                  className={`${
                    location === "/reputation-leaderboard" ||
                    location === "/giverep/reputation-leaderboard"
                      ? "nav-tab-active font-medium"
                      : "nav-tab-inactive"
                  } cursor-pointer hover:text-primary hover:underline transition-colors text-sm sm:text-base flex items-center gap-1 py-1.5`}
                >
                  <TbStar className="h-4 w-4" />
                  {t('nav.leaderboard')}
                </span>
              </Link>

              {/* Dropdown menu for leaderboards - commented out as requested */}
              {/* We're keeping this code for future reference when we need to restore it */}
              {/* 
              <DropdownMenu>
                <DropdownMenuTrigger className="outline-none">
                  <span
                    className={`${
                      (location === "/leaderboard" ||
                      location === "/giverep/leaderboard" ||
                      location === "/reputation-leaderboard" ||
                      location === "/giverep/reputation-leaderboard")
                        ? "nav-tab-active font-medium"
                        : "nav-tab-inactive"
                    } cursor-pointer hover:text-primary hover:underline transition-colors text-sm sm:text-base flex items-center gap-1 py-1.5`}
                  >
                    <TbTrophy className="h-4 w-4" />
                    Leaderboards                    <TbChevronDown className="h-3 w-3 mt-0.5" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-[#12131e] border border-[#2b2d3c] text-white min-w-[180px] p-1 rounded-sm z-[100]">
                  <Link href="/leaderboard">
                    <DropdownMenuItem 
                      className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                        location === "/leaderboard" || location === "/giverep/leaderboard" 
                          ? "text-primary" 
                          : "text-white"
                      }`}
                    >
                      Leaderboard
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/reputation-leaderboard">
                    <DropdownMenuItem 
                      className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                        location === "/reputation-leaderboard" || location === "/giverep/reputation-leaderboard" 
                          ? "text-primary" 
                          : "text-white"
                      }`}
                    >
                      Rep Leaderboard
                    </DropdownMenuItem>
                  </Link>
                </DropdownMenuContent>
              </DropdownMenu>
              */}

              <Link href="/mindshare-dashboard">
                <span
                  className={`${
                    location === "/mindshare-dashboard" ||
                    location === "/giverep/mindshare-dashboard"
                      ? "nav-tab-active font-medium"
                      : "nav-tab-inactive"
                  } cursor-pointer hover:text-primary hover:underline transition-colors text-sm sm:text-base flex items-center gap-1 py-1.5`}
                >
                  <TbChartPie className="h-4 w-4" />
                  {t('nav.mindshare')}
                </span>
              </Link>

              <div className="relative group">
                <Link href="/loyalty">
                  <span
                    className={`${
                      location === "/loyalty" || 
                      location === "/giverep/loyalty" ||
                      location === "/loyalty/reward"
                        ? "nav-tab-active font-medium"
                        : "nav-tab-inactive"
                    } cursor-pointer hover:text-primary hover:underline transition-colors flex items-center gap-1 text-sm sm:text-base py-1.5`}
                  >
                    <TbStar className="h-4 w-4" />
                    {t('nav.loyalty')}
                    <TbChevronDown className="h-3 w-3 mt-0.5" />
                  </span>
                </Link>
                <div className="absolute top-full left-0 pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="bg-[#12131e] border border-[#2b2d3c] text-white min-w-[180px] p-1 rounded-sm shadow-lg">
                    <Link href="/loyalty">
                      <div
                        className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                          location === "/loyalty" || location === "/giverep/loyalty"
                            ? "text-primary"
                            : "text-white"
                        }`}
                      >
                        <TbStar className="h-4 w-4 mr-2 inline" />
                        {t('nav.loyaltyPrograms')}
                      </div>
                    </Link>
                    <Link href="/loyalty/reward">
                      <div
                        className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                          location === "/loyalty/reward"
                            ? "text-primary"
                            : "text-white"
                        }`}
                      >
                        <TbGift className="h-4 w-4 mr-2 inline" />
                        {t('nav.rewards')}
                      </div>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Circles feature temporarily disabled
              <Link href="/circles">
                <span
                  className={`${
                    location === "/circles" ||
                    location === "/giverep/circles"
                      ? "text-primary font-medium"
                      : "text-gray-400"
                  } cursor-pointer hover:text-primary hover:underline transition-colors`}
                >
                  Circles
                </span>
              </Link> */}
              {/* My Profile dropdown - only show if user is connected with Twitter */}
              {twitterIsLogin && (
                <div className="relative group">
                  <Link href={`/profile/${twitterUserName}`}>
                    <span
                      className={`${
                        location.includes("/profile") ||
                        location.includes("/giverep/profile") ||
                        location === "/recover" ||
                        location === "/user/add-tweet-manually" ||
                        location === "/user/wallets"
                          ? "nav-tab-active font-medium"
                          : "nav-tab-inactive"
                      } cursor-pointer hover:text-primary hover:underline transition-colors flex items-center gap-1 text-sm sm:text-base py-1.5`}
                    >
                      <TbUser className="h-4 w-4" />
                      {t('nav.myProfile')}
                      <TbChevronDown className="h-3 w-3 mt-0.5" />
                    </span>
                  </Link>
                  <div className="absolute top-full right-0 pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    <div className="bg-[#12131e] border border-[#2b2d3c] text-white min-w-[180px] p-1 rounded-sm shadow-lg">
                      <Link href={`/profile/${twitterUserName}`}>
                        <div
                          className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                            location.includes("/profile")
                              ? "text-primary"
                              : "text-white"
                          }`}
                        >
                          <TbUser className="h-4 w-4 mr-2 inline" />
                          {t('nav.viewProfile')}
                        </div>
                      </Link>
                      <Link href="/user/add-tweet-manually">
                        <div
                          className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                            location === "/user/add-tweet-manually"
                              ? "text-primary"
                              : "text-white"
                          }`}
                        >
                          <TbTool className="h-4 w-4 mr-2 inline" />
                          {t('nav.addTweet')}
                        </div>
                      </Link>
                      <Link href="/user/wallets">
                        <div
                          className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                            location === "/user/wallets"
                              ? "text-primary"
                              : "text-white"
                          }`}
                        >
                          <TbWallet className="h-4 w-4 mr-2 inline" />
                          My Wallets
                        </div>
                      </Link>
                      <Link href="/recover">
                        <div
                          className={`cursor-pointer hover:bg-[#1a1b29] rounded-sm px-3 py-2.5 text-sm ${
                            location === "/recover"
                              ? "text-primary"
                              : "text-white"
                          }`}
                        >
                          <TbUserCheck className="h-4 w-4 mr-2 inline" />
                          {t('nav.recovery')}
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {/* Twitter login button - Desktop only */}
              <div className="hidden sm:flex items-center gap-2 ml-1 sm:ml-auto lg:ml-1">
                <LanguageSwitcher />
                <ConnectTwitterButton />
                <ConnectWalletButton />
              </div>
            </div>
          </nav>
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="sm:hidden bg-[#0c0d15] border-t border-[#1a1c29] animate-in fade-in slide-in-from-top duration-300">
            <div className={`${isExpandedView ? 'max-w-[95vw]' : 'max-w-5xl'} mx-auto px-4 py-4 flex flex-col gap-2`}>
              {/* Connect buttons as first row */}
              <div className="flex gap-2 pb-2 border-b border-gray-800">
                <LanguageSwitcher />
                <ConnectTwitterButton />
                <ConnectWalletButton />
              </div>
              
              <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                <span
                  className={`${
                    location === "/" ||
                    location === "/giverep" ||
                    location === "/giverep/"
                      ? "text-primary font-medium"
                      : "text-gray-300"
                  } flex items-center py-3 px-1 hover:text-primary transition-colors text-base border-b border-gray-800`}
                >
                  <TbChartPie className="h-5 w-5 mr-2" />
                  {t('nav.home')}
                </span>
              </Link>

              {/* Trophy leaderboard removed and replaced with reputation leaderboard */}
              <Link
                href="/reputation-leaderboard"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span
                  className={`${
                    location === "/reputation-leaderboard" ||
                    location === "/giverep/reputation-leaderboard"
                      ? "text-primary font-medium"
                      : "text-gray-300"
                  } flex items-center py-3 px-1 hover:text-primary transition-colors text-base border-b border-gray-800`}
                >
                  <TbStar className="h-5 w-5 mr-2" />
                  {t('nav.leaderboard')}
                </span>
              </Link>

              {/* Old leaderboard links commented out as requested */}
              {/* 
              <Link href="/leaderboard" onClick={() => setMobileMenuOpen(false)}>
                <span
                  className={`${
                    location === "/leaderboard" ||
                    location === "/giverep/leaderboard"
                      ? "text-primary font-medium"
                      : "text-gray-300"
                  } flex items-center py-3 px-1 hover:text-primary transition-colors text-base border-b border-gray-800`}
                >
                  <TbTrophy className="h-5 w-5 mr-2" />
                  Leaderboard
                </span>
              </Link>
              */}

              <div className="border-b border-gray-800">
                <Link
                  href="/mindshare-dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span
                    className={`${
                      location === "/mindshare-dashboard" ||
                      location === "/giverep/mindshare-dashboard" ||
                      location === "/mindshare/nft"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 hover:text-primary transition-colors text-base`}
                  >
                    <TbChartPie className="h-5 w-5 mr-2" />
                    {t('nav.mindshare')}
                  </span>
                </Link>
                <Link
                  href="/mindshare-dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span
                    className={`${
                      location === "/mindshare-dashboard"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                  >
                    <TbChartPie className="h-4 w-4 mr-2" />
                    {t('nav.projectMindshare')}
                  </span>
                </Link>
                {/* Hidden for now
                <Link href="/mindshare/profile-nft-checker" onClick={() => setMobileMenuOpen(false)}>
                  <span
                    className={`${
                      location === "/mindshare/profile-nft-checker"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                  >
                    <TbUserCheck className="h-4 w-4 mr-2" />
                    NFT Profile Checker
                  </span>
                </Link>
                <Link href="/mindshare/nft/search" onClick={() => setMobileMenuOpen(false)}>
                  <span
                    className={`${
                      location === "/mindshare/nft/search"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                  >
                    <TbSearch className="h-4 w-4 mr-2" />
                    NFT Search
                  </span>
                </Link>
                */}
              </div>

              <div className="border-b border-gray-800">
                <Link
                  href="/loyalty"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span
                    className={`${
                      location === "/loyalty" || 
                      location === "/giverep/loyalty" ||
                      location === "/loyalty/reward"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 hover:text-primary transition-colors text-base`}
                  >
                    <TbStar className="h-5 w-5 mr-2" />
                    {t('nav.loyalty')}
                  </span>
                </Link>
                <Link
                  href="/loyalty"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span
                    className={`${
                      location === "/loyalty" || location === "/giverep/loyalty"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                  >
                    <TbStar className="h-4 w-4 mr-2" />
                    {t('nav.loyaltyPrograms')}
                  </span>
                </Link>
                <Link href="/loyalty/reward" onClick={() => setMobileMenuOpen(false)}>
                  <span
                    className={`${
                      location === "/loyalty/reward"
                        ? "text-primary font-medium"
                        : "text-gray-300"
                    } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                  >
                    <TbGift className="h-4 w-4 mr-2" />
                    {t('nav.rewards')}
                  </span>
                </Link>
              </div>

              {twitterIsLogin && (
                <>
                  <Link
                    href={`/profile/${twitterUserName}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span
                      className={`${
                        location.includes("/profile") ||
                        location.includes("/giverep/profile")
                          ? "text-primary font-medium"
                          : "text-gray-300"
                      } flex items-center py-3 px-1 hover:text-primary transition-colors text-base border-b border-gray-800`}
                    >
                      <TbUser className="h-5 w-5 mr-2" />
                      {t('nav.myProfile')}
                    </span>
                  </Link>
                  
                  {/* Help category with Recovery and Add Tweet */}
                  <div className="border-b border-gray-800">
                    <div className="flex items-center py-3 px-1 text-gray-300 text-base">
                      <TbHelp className="h-5 w-5 mr-2" />
                      {t('nav.help')}
                    </div>
                    <Link
                      href="/recover"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={`${
                          location === "/recover"
                            ? "text-primary font-medium"
                            : "text-gray-300"
                        } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                      >
                        <TbUserCheck className="h-4 w-4 mr-2" />
                        {t('nav.recovery')}
                      </span>
                    </Link>
                    <Link
                      href="/user/add-tweet-manually"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={`${
                          location === "/user/add-tweet-manually"
                            ? "text-primary font-medium"
                            : "text-gray-300"
                        } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                      >
                        <TbTool className="h-4 w-4 mr-2" />
                        {t('nav.addTweet')}
                      </span>
                    </Link>
                    <Link
                      href="/user/wallets"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span
                        className={`${
                          location === "/user/wallets"
                            ? "text-primary font-medium"
                            : "text-gray-300"
                        } flex items-center py-3 px-1 pl-10 hover:text-primary transition-colors text-sm`}
                      >
                        <TbWallet className="h-4 w-4 mr-2" />
                        My Wallets
                      </span>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <WalletModal />

      {/* Main content area with dotted background */}
      <main className={`${isExpandedView ? 'max-w-[95vw]' : 'max-w-7xl'} mx-auto px-4 py-8 relative`}>
        {/* Subtle dot pattern in background */}
        <div
          className="fixed inset-0 opacity-5 z-0 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(rgba(150, 120, 255, 0.3) 1px, transparent 1px)`,
            backgroundSize: "30px 30px",
          }}
        ></div>

        {/* Subtle gradient accent */}
        <div className="absolute top-1/4 right-0 w-96 h-96 bg-primary/10 rounded-full filter blur-[120px] opacity-10 z-0 pointer-events-none"></div>
        <div className="absolute bottom-1/4 left-0 w-96 h-96 bg-primary/10 rounded-full filter blur-[120px] opacity-10 z-0 pointer-events-none"></div>

        {/* Content with relative positioning */}
        <div className="relative z-10">{children}</div>
      </main>

      {/* Footer removed */}

      {/* Back to top button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-8 right-8 bg-primary p-2 text-primary-foreground rounded-sm shadow-lg hover:bg-primary/90 transition-all z-50"
      >
        <TbChevronUp className="h-4 w-4" />
      </button>

      {/* Draggable Wallet Button */}
      <DraggableWalletButton />
    </div>
  );
}
function HeaderLogo() {
  return (
    <>
      <div className="flex items-center">
        <span
          className="font-bold text-lg tracking-wide text-white font-mono"
          style={{
            fontFamily: "'Press Start 2P', 'VT323', monospace",
            letterSpacing: "0.05em",
          }}
        >
          GiveRep
        </span>
        <span
          className="ml-2 text-base bg-transparent text-white px-1.5 py-0.5 rounded-sm"
          style={{
            fontFamily: "'VT323', monospace",
          }}
        >
          V0
        </span>
      </div>
    </>
  );
}
