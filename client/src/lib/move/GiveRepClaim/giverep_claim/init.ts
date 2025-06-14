import * as giverepClaim from "./giverep-claim/structs";
import {StructClassLoader} from "../_framework/loader";

export function registerClasses(loader: StructClassLoader) { loader.register(giverepClaim.SuperAdmin);
loader.register(giverepClaim.Pool);
loader.register(giverepClaim.PoolCreatedEvent);
loader.register(giverepClaim.DepositEvent);
loader.register(giverepClaim.WithdrawEvent);
loader.register(giverepClaim.ClaimEvent);
loader.register(giverepClaim.PoolDeletedEvent);
 }
