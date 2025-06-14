import { AssetItem, NFTItem } from "../types/asset";

/**
 * Convert an NFT to a compatible AssetItem format for sending
 * NFTs are treated as objects with a quantity of 1
 */
export function convertNFTToAssetItem(nft: NFTItem): AssetItem & { isNFT: boolean; displayName: string; collectionName: string } {
  return {
    coinType: nft.objectId, // Use the NFT's objectId as the coin type for sending
    name: nft.name,
    symbol: "NFT", // Identify as an NFT
    decimals: 0, // NFTs have no decimals, they're indivisible
    balance: "1", // NFTs always have a quantity of 1
    verified: true,
    logo: nft.image || "",
    usdValue: nft.lastPrice || "0",
    price: nft.lastPrice || "0",
    priceChangePercentage24H: "0",
    objects: 1,
    scam: false,
    isNFT: true, // Add a flag to identify this as an NFT
    displayName: nft.name, // Use the NFT name for display
    collectionName: nft.displayCollectionName || "Unknown Collection" // Collection name for grouping
  };
}