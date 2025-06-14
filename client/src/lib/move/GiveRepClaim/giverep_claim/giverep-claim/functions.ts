import {PUBLISHED_AT} from "..";
import {obj, pure} from "../../_framework/util";
import {Transaction, TransactionArgument, TransactionObjectInput} from "@mysten/sui/transactions";

export function init( tx: Transaction, ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::init`, arguments: [ ], }) }

export interface AddSuperAdminArgs { superAdmin: TransactionObjectInput; address: string | TransactionArgument }

export function addSuperAdmin( tx: Transaction, args: AddSuperAdminArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::add_super_admin`, arguments: [ obj(tx, args.superAdmin), pure(tx, args.address, `address`) ], }) }

export interface RemoveSuperAdminArgs { superAdmin: TransactionObjectInput; address: string | TransactionArgument }

export function removeSuperAdmin( tx: Transaction, args: RemoveSuperAdminArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::remove_super_admin`, arguments: [ obj(tx, args.superAdmin), pure(tx, args.address, `address`) ], }) }

export interface CreatePoolArgs { u64: bigint | TransactionArgument; superAdmin: TransactionObjectInput; vecAddress: Array<string | TransactionArgument> | TransactionArgument; coin: TransactionObjectInput }

export function createPool( tx: Transaction, typeArg: string, args: CreatePoolArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::create_pool`, typeArguments: [typeArg], arguments: [ pure(tx, args.u64, `u64`), obj(tx, args.superAdmin), pure(tx, args.vecAddress, `vector<address>`), obj(tx, args.coin) ], }) }

export interface DepositArgs { pool: TransactionObjectInput; coin: TransactionObjectInput }

export function deposit( tx: Transaction, typeArg: string, args: DepositArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::deposit`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), obj(tx, args.coin) ], }) }

export interface WithdrawArgs { pool: TransactionObjectInput; u64: bigint | TransactionArgument }

export function withdraw( tx: Transaction, typeArg: string, args: WithdrawArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::withdraw`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.u64, `u64`) ], }) }

export interface AddManagerArgs { pool: TransactionObjectInput; address: string | TransactionArgument }

export function addManager( tx: Transaction, typeArg: string, args: AddManagerArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::add_manager`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.address, `address`) ], }) }

export interface RemoveManagerArgs { pool: TransactionObjectInput; address: string | TransactionArgument }

export function removeManager( tx: Transaction, typeArg: string, args: RemoveManagerArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::remove_manager`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.address, `address`) ], }) }

export interface DeleteTableFieldsArgs { pool: TransactionObjectInput; address: string | TransactionArgument }

export function deleteTableFields( tx: Transaction, typeArg: string, args: DeleteTableFieldsArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::delete_table_fields`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.address, `address`) ], }) }

export function deletePool( tx: Transaction, typeArg: string, pool: TransactionObjectInput ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::delete_pool`, typeArguments: [typeArg], arguments: [ obj(tx, pool) ], }) }

export interface ClaimArgs { pool: TransactionObjectInput; u64: bigint | TransactionArgument }

export function claim( tx: Transaction, typeArg: string, args: ClaimArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::claim`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.u64, `u64`) ], }) }

export interface AssertIsManagerArgs { pool: TransactionObjectInput; address: string | TransactionArgument }

export function assertIsManager( tx: Transaction, typeArg: string, args: AssertIsManagerArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::assert_is_manager`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.address, `address`) ], }) }

export interface IsManagerArgs { pool: TransactionObjectInput; address: string | TransactionArgument }

export function isManager( tx: Transaction, typeArg: string, args: IsManagerArgs ) { return tx.moveCall({ target: `${PUBLISHED_AT}::giverep_claim::is_manager`, typeArguments: [typeArg], arguments: [ obj(tx, args.pool), pure(tx, args.address, `address`) ], }) }
