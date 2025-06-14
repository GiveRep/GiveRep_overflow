import { AppContext } from "@/context/AppContext";
import { useConnectWallet, useWallets } from "@mysten/dapp-kit";
import { useContext, useMemo } from "react";

export type Wallet = {
  title: string;
  name: string;
  icon: string;
  link?: {
    desktop?: string;
    mobile?: {
      ios?: string;
      android?: string;
    };
  };
};

export const WALLET_LIST: readonly Wallet[] = [
  {
    title: "OKX",
    name: "OKX Wallet",
    icon: "/wallets/ic_okx.jpeg",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge",
      mobile: {
        ios: "https://apps.apple.com/app/okx-buy-bitcoin-btc-crypto/id1327268470",
        android:
          "https://play.google.com/store/apps/details?id=com.okinc.okex.gp",
      },
    },
  },
  {
    title: "Slush",
    name: "Slush",
    icon: "/wallets/wallet_slush.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil",
      mobile: {
        ios: "https://apps.apple.com/app/slush-a-sui-wallet/id6476572140",
        android:
          "https://play.google.com/store/apps/details?id=com.mystenlabs.suiwallet",
      },
    },
  },
  {
    title: "Suiet",
    name: "Suiet",
    icon: "/wallets/ic_suiet.jpeg",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/suiet-sui-wallet/khpkpbbcccdmmclmpigdgddabeilkdpd",
    },
  },
  {
    title: "Gate",
    name: "Gate Wallet",
    icon: "/wallets/ic_gate.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/gate-wallet/cpmkedoipcpimgecpmgpldfpohjplkpp",
      mobile: {
        ios: "https://apps.apple.com/app/gate-io-trade-btc-eth/id1294998195",
        android:
          "https://play.google.com/store/apps/details?id=com.gateio.gateio",
      },
    },
  },
  {
    title: "Bitget",
    name: "Bitget Wallet",
    icon: "/wallets/ic_bitget.svg",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/bitget-wallet-formerly-bi/jiidiaalihmmhddjgbnbgdfflelocpak",
      mobile: {
        ios: "https://apps.apple.com/app/bitget-trade-bitcoin-crypto/id1442778704",
        android:
          "https://play.google.com/store/apps/details?id=com.bitget.exchange",
      },
    },
  },
  {
    title: "Bybit",
    name: "Bybit Wallet",
    icon: "/wallets/wallet_bybit.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/bybit-wallet/pdliaogehgdbhbnmkklieghmmjkpigpa",
      mobile: {
        ios: "https://apps.apple.com/app/bybit-buy-trade-crypto/id1488296980",
        android: "https://play.google.com/store/apps/details?id=com.bybit.app",
      },
    },
  },
  {
    title: "Ethos",
    name: "Ethos Wallet",
    icon: "/wallets/ic_ethos.png",
  },
  {
    title: "Surf",
    name: "Surf Wallet",
    icon: "/wallets/ic_surf.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/surf-wallet/emeeapjkbcbpbpgaagfchmcgglmebnen",
      mobile: {
        ios: "https://apps.apple.com/app/surf-wallet/id6467386034",
        android:
          "https://play.google.com/store/apps/details?id=com.surf.suiwallet",
      },
    },
  },
  {
    title: "Martian",
    name: "Martian Sui Wallet",
    icon: "/wallets/ic_martian.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/martian-aptos-sui-wallet/efbglgofoippbgcjepnhiblaibcnclgk",
    },
  },
  {
    title: "Nightly",
    name: "Nightly",
    icon: "/wallets/wallet_nightly.webp",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/nightly/fiikommddbeccaoicoejoniammnalkfa?pli=1",
      mobile: {
        ios: "https://apps.apple.com/app/nightly-multichain-wallet/id6444768157",
        android:
          "https://play.google.com/store/apps/details?id=com.nightlymobile",
      },
    },
  },
  {
    title: "TokenPocket",
    name: "TokenPocket Wallet",
    icon: "/wallets/wallet-tp.webp",
    link: {
      desktop: "https://www.tokenpocket.pro/",
      mobile: {
        ios: "https://apps.apple.com/app/tokenpocket-crypto-bitcoin/id6444625622",
        android:
          "https://play.google.com/store/apps/details?id=vip.mytokenpocket",
      },
    },
  },
  {
    title: "Binance",
    name: "Binance Wallet",
    icon: "/wallets/wallet_binance.webp",
    link: {
      desktop: "https://www.binance.com/en/web3wallet",
      mobile: {
        ios: "https://apps.apple.com/app/binance-buy-bitcoin-crypto/id1436799971",
        android:
          "https://play.google.com/store/apps/details?id=com.binance.dev",
      },
    },
  },
  {
    title: "Phantom",
    name: "Phantom",
    icon: "/wallets/ic_phantom.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/phantom/bfnaelmomeimhlpmgjnjophhpkkoljpa",
      mobile: {
        ios: "https://apps.apple.com/app/phantom-crypto-wallet/id1598432977",
        android: "https://play.google.com/store/apps/details?id=app.phantom",
      },
    },
  },
  {
    title: "Backpack",
    name: "Backpack",
    icon: "/wallets/wallet-backpack.png",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/backpack/aflkmfhebedbjioipglgcbcmnbpgliof",
      mobile: {
        ios: "https://apps.apple.com/app/backpack-buy-trade-crypto/id6445964121",
        android:
          "https://play.google.com/store/apps/details?id=app.backpack.mobile",
      },
    },
  },
  {
    title: "xPortal",
    name: "xPortal",
    icon: "/wallets/wallet_xportal.webp",
    link: {
      mobile: {
        ios: "https://apps.apple.com/app/xportal-btc-crypto-wallet/id1519405832",
        android:
          "https://play.google.com/store/apps/details?id=com.elrond.maiar.wallet",
      },
    },
  },
  {
    title: "Sui Wallet",
    name: "Sui Wallet",
    icon: "/wallets/ic_sui_wallet.webp",
    link: {
      desktop:
        "https://chromewebstore.google.com/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil",
    },
  },
];

("use client");

import { cn } from "@/lib/utils";
import { useState } from "react";
import { isAndroid, isIOS, isMobile } from "react-device-detect";
import { IoCloseOutline } from "react-icons/io5";
import { LuChevronDown } from "react-icons/lu";
// Fixes for modal position and background overlay

const getLink = (wallet: Wallet) => {
  if (!isMobile && wallet.link?.desktop) {
    return wallet.link.desktop;
  }
  if (isIOS && wallet.link?.mobile?.ios) {
    return wallet.link?.mobile?.ios;
  }
  if (isAndroid && wallet.link?.mobile?.android) {
    return wallet.link?.mobile?.android;
  }
  return undefined;
};

const WalletModal = () => {
  const [viewMore, setViewMore] = useState(false);
  const { isWalletOpen, setWalletOpen } = useContext(AppContext);
  const installedWallets = useWallets();
  const { mutate: connect } = useConnectWallet();

  const supportedWallets = useMemo(() => {
    return WALLET_LIST.filter(
      (t) => installedWallets.find((i) => t.name === i.name) || getLink(t)
    );
  }, [installedWallets]);

  const sortedSupportedWallets = supportedWallets.sort((a, b) => {
    const aIndex = installedWallets.findIndex((t) => t.name === a.name);
    const bIndex = installedWallets.findIndex((t) => t.name === b.name);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    const aSupportedIndex = supportedWallets.findIndex(
      (t) => t.name === a.name
    );
    const bSupportedIndex = supportedWallets.findIndex(
      (t) => t.name === b.name
    );
    return aSupportedIndex - bSupportedIndex;
  });

  const walletList = useMemo(() => {
    return installedWallets.map((t) => t.name);
  }, [installedWallets]);

  const handleConnect = (wallet: Wallet) => {
    const installedWallet = installedWallets.find(
      (t) => t.name === wallet.name
    );
    if (installedWallet) {
      connect({
        wallet: installedWallet,
      });
      setWalletOpen(false);
    } else {
      window.open(getLink(wallet), "_blank");
    }
  };

  if (!isWalletOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 transition-colors duration-300 p-4 overflow-y-auto"
      style={{ backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && setWalletOpen(false)}
    >
      <div
        className="relative w-full max-w-96 my-auto flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#18192a] px-0 py-4 shadow-2xl"
        style={{
          boxShadow: "0 8px 32px 0 rgba(0,0,0,0.45)",
          maxHeight: "min(592px, calc(100vh - 2rem))",
        }}
      >
        <div className="flex items-center justify-between px-4">
          <div className="flex w-full items-center justify-between">
            <span className="text-lg font-medium">
              Connect a wallet from list
            </span>
          </div>
          <button
            onClick={() => setWalletOpen(false)}
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors duration-400 hover:bg-white/20"
          >
            <IoCloseOutline className="size-6" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 flex-1 min-h-0">
          {sortedSupportedWallets
            .filter((_, idx) => viewMore || idx < 5)
            .map((wallet, idx) => (
              <button
                type="button"
                key={`wallet-${idx}`}
                className="flex items-center gap-4 text-gray-400 transition-colors duration-400 hover:text-white"
                onClick={() => handleConnect(wallet)}
              >
                <img
                  src={wallet.icon}
                  alt={wallet.name}
                  width={32}
                  height={32}
                  className="rounded-xl"
                />
                <span className="text-md flex-1 text-left">{wallet.title}</span>
                <span className="text-sm">
                  {walletList.includes(wallet.name) ? "Connect" : "Install"}
                </span>
              </button>
            ))}
          {sortedSupportedWallets.length > 5 && (
            <button
              type="button"
              className={cn(
                "flex items-center justify-center gap-2 rounded-[8px] py-2 font-medium text-[rgba(255,255,255,0.78)] transition-colors duration-400 hover:bg-[rgba(255,255,255,0.05)] active:bg-[rgba(255,255,255,0.05)]",
                viewMore && "hidden"
              )}
              onClick={() => setViewMore(!viewMore)}
            >
              View More
              <LuChevronDown className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletModal;
