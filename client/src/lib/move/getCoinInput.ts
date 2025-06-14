import { SuiClient } from "@mysten/sui/client";
import {
  Transaction,
  TransactionObjectArgument,
} from "@mysten/sui/transactions";

/**
 * Fetches all coins of a specific type for an address and merges them into a single coin
 * @param suiClient - The Sui client instance
 * @param address - The wallet address
 * @param coinType - The type of coin to fetch
 * @param tx - The transaction object to add merge operations to
 * @returns The main coin reference after merging, or undefined if no coins found
 */
export async function getCoinInput(
  suiClient: SuiClient,
  address: string,
  coinType: string,
  amount: bigint,
  tx: Transaction
): Promise<TransactionObjectArgument> {
  if (
    coinType === "0x2::sui::SUI" ||
    coinType ===
      "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI"
  ) {
    return tx.splitCoins(tx.gas, [tx.pure.u64(amount)]);
  } else {
    const coins = [];
    let cursor: string | undefined = undefined;
    let totalBalance = 0;

    // Fetch all coins of the specified type
    while (true) {
      const result = await suiClient.getCoins({
        owner: address,
        coinType: coinType,
        cursor,
      });
      coins.push(...result.data);
      if (result.hasNextPage) {
        cursor = result.nextCursor || undefined;
      } else {
        break;
      }
    }

    if (coins.length === 0) {
      throw new Error(`No coin found for type ${coinType} in wallet`);
    }

    // Convert coins to object references
    const [mainCoin, ...otherCoins] = coins.map((coin) => {
      totalBalance += Number(coin.balance);
      return tx.objectRef({
        objectId: coin.coinObjectId,
        digest: coin.digest,
        version: coin.version,
      });
    });

    if (totalBalance < amount) {
      throw new Error("Insufficient balance");
    }

    // Merge other coins into the main coin if there are multiple coins
    if (otherCoins.length > 0) {
      tx.mergeCoins(mainCoin, otherCoins);
    }
    return tx.splitCoins(mainCoin, [tx.pure.u64(amount)]);
  }
}
