import * as package_onchain_1 from "../_dependencies/onchain/0x1/init";
import * as package_onchain_2 from "../_dependencies/onchain/0x2/init";
import * as package_onchain_b1309b1547968f2256e77dcd4b43a9f0d3aa1b0af5cad460432581f439e33c60 from "../giverep_claim/init";
import {StructClassLoader} from "./loader";

function registerClassesOnchain(loader: StructClassLoader) { package_onchain_1.registerClasses(loader);
package_onchain_2.registerClasses(loader);
package_onchain_b1309b1547968f2256e77dcd4b43a9f0d3aa1b0af5cad460432581f439e33c60.registerClasses(loader);
 }

export function registerClasses(loader: StructClassLoader) { registerClassesOnchain(loader); }
