// src/components/wallet/ConvertAddress.tsx
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";

export async function ConvertAddressSuiNS(address: string, hyperlink = false) {
  if (address.length == 0) return address;
  let client = new SuiClient({ url: getFullnodeUrl("mainnet") });
  let result = await client.resolveNameServiceNames({ address });
  if (result.data.length > 0) {
    return result.data[0];
  }
  try {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  } catch (e) {
    return address;
  }
}

export async function ConvertSuiNsToAddress(addressOrSuiNS: string) {
  let suiClient = new SuiClient({ url: getFullnodeUrl("mainnet") });
  if (addressOrSuiNS.endsWith(".sui")) {
    let result = await suiClient.resolveNameServiceAddress({
      name: addressOrSuiNS,
    });
    console.log("result", result);
    if (result) {
      return result;
    } else {
      alert(`${addressOrSuiNS} is not a valid SuiNS`);
      throw new Error("Invalid SuiNS");
    }
  }
  return addressOrSuiNS;
}

export function ConvertAddress(address: string, hyperlink = false) {
  try {
    if (address.includes(".")) {
      return address;
    } else {
      return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }
  } catch (e) {
    return address;
  }
}
