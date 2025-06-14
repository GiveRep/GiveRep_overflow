import { SuiClient } from "@mysten/sui/client";

export async function getCoinDecimals(suiClient: SuiClient, coinType: string) {
  const coin = await suiClient.getCoinMetadata({ coinType });
  if (!coin) {
    throw new Error(`Coin metadata not found for type ${coinType}`);
  }
  return coin.decimals;
}
