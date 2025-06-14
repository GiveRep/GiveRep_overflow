import * as reified from "../../_framework/reified";
import {Balance} from "../../_dependencies/onchain/0x2/balance/structs";
import {ID, UID} from "../../_dependencies/onchain/0x2/object/structs";
import {Table} from "../../_dependencies/onchain/0x2/table/structs";
import {PhantomReified, PhantomToTypeStr, PhantomTypeArgument, Reified, StructClass, ToField, ToPhantomTypeArgument, ToTypeStr, assertFieldsWithTypesArgsMatch, assertReifiedTypeArgsMatch, decodeFromFields, decodeFromFieldsWithTypes, decodeFromJSONField, extractType, fieldToJSON, phantom} from "../../_framework/reified";
import {FieldsWithTypes, composeSuiType, compressSuiType, parseTypeName} from "../../_framework/util";
import {Vector} from "../../_framework/vector";
import {PKG_V1} from "../index";
import {bcs} from "@mysten/sui/bcs";
import {SuiClient, SuiObjectData, SuiParsedData} from "@mysten/sui/client";
import {fromB64, fromHEX, toHEX} from "@mysten/sui/utils";

/* ============================== SuperAdmin =============================== */

export function isSuperAdmin(type: string): boolean { type = compressSuiType(type); return type === `${PKG_V1}::giverep_claim::SuperAdmin`; }

export interface SuperAdminFields { id: ToField<UID>; superAdmin: ToField<Vector<"address">> }

export type SuperAdminReified = Reified< SuperAdmin, SuperAdminFields >;

export class SuperAdmin implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::SuperAdmin`; static readonly $numTypeParams = 0; static readonly $isPhantom = [] as const;

 readonly $typeName = SuperAdmin.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::SuperAdmin`; readonly $typeArgs: []; readonly $isPhantom = SuperAdmin.$isPhantom;

 readonly id: ToField<UID>; readonly superAdmin: ToField<Vector<"address">>

 private constructor(typeArgs: [], fields: SuperAdminFields, ) { this.$fullTypeName = composeSuiType( SuperAdmin.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::SuperAdmin`; this.$typeArgs = typeArgs;

 this.id = fields.id;; this.superAdmin = fields.superAdmin; }

 static reified( ): SuperAdminReified { return { typeName: SuperAdmin.$typeName, fullTypeName: composeSuiType( SuperAdmin.$typeName, ...[] ) as `${typeof PKG_V1}::giverep_claim::SuperAdmin`, typeArgs: [ ] as [], isPhantom: SuperAdmin.$isPhantom, reifiedTypeArgs: [], fromFields: (fields: Record<string, any>) => SuperAdmin.fromFields( fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => SuperAdmin.fromFieldsWithTypes( item, ), fromBcs: (data: Uint8Array) => SuperAdmin.fromBcs( data, ), bcs: SuperAdmin.bcs, fromJSONField: (field: any) => SuperAdmin.fromJSONField( field, ), fromJSON: (json: Record<string, any>) => SuperAdmin.fromJSON( json, ), fromSuiParsedData: (content: SuiParsedData) => SuperAdmin.fromSuiParsedData( content, ), fromSuiObjectData: (content: SuiObjectData) => SuperAdmin.fromSuiObjectData( content, ), fetch: async (client: SuiClient, id: string) => SuperAdmin.fetch( client, id, ), new: ( fields: SuperAdminFields, ) => { return new SuperAdmin( [], fields ) }, kind: "StructClassReified", } }

 static get r() { return SuperAdmin.reified() }

 static phantom( ): PhantomReified<ToTypeStr<SuperAdmin>> { return phantom(SuperAdmin.reified( )); } static get p() { return SuperAdmin.phantom() }

 static get bcs() { return bcs.struct("SuperAdmin", {

 id: UID.bcs, super_admin: bcs.vector(bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), }))

}) };

 static fromFields( fields: Record<string, any> ): SuperAdmin { return SuperAdmin.reified( ).new( { id: decodeFromFields(UID.reified(), fields.id), superAdmin: decodeFromFields(reified.vector("address"), fields.super_admin) } ) }

 static fromFieldsWithTypes( item: FieldsWithTypes ): SuperAdmin { if (!isSuperAdmin(item.type)) { throw new Error("not a SuperAdmin type");

 }

 return SuperAdmin.reified( ).new( { id: decodeFromFieldsWithTypes(UID.reified(), item.fields.id), superAdmin: decodeFromFieldsWithTypes(reified.vector("address"), item.fields.super_admin) } ) }

 static fromBcs( data: Uint8Array ): SuperAdmin { return SuperAdmin.fromFields( SuperAdmin.bcs.parse(data) ) }

 toJSONField() { return {

 id: this.id,superAdmin: fieldToJSON<Vector<"address">>(`vector<address>`, this.superAdmin),

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField( field: any ): SuperAdmin { return SuperAdmin.reified( ).new( { id: decodeFromJSONField(UID.reified(), field.id), superAdmin: decodeFromJSONField(reified.vector("address"), field.superAdmin) } ) }

 static fromJSON( json: Record<string, any> ): SuperAdmin { if (json.$typeName !== SuperAdmin.$typeName) { throw new Error("not a WithTwoGenerics json object") };

 return SuperAdmin.fromJSONField( json, ) }

 static fromSuiParsedData( content: SuiParsedData ): SuperAdmin { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isSuperAdmin(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a SuperAdmin object`); } return SuperAdmin.fromFieldsWithTypes( content ); }

 static fromSuiObjectData( data: SuiObjectData ): SuperAdmin { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isSuperAdmin(data.bcs.type)) { throw new Error(`object at is not a SuperAdmin object`); }

 return SuperAdmin.fromBcs( fromB64(data.bcs.bcsBytes) ); } if (data.content) { return SuperAdmin.fromSuiParsedData( data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch( client: SuiClient, id: string ): Promise<SuperAdmin> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching SuperAdmin object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isSuperAdmin(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a SuperAdmin object`); }

 return SuperAdmin.fromSuiObjectData( res.data ); }

 }

/* ============================== Pool =============================== */

export function isPool(type: string): boolean { type = compressSuiType(type); return type.startsWith(`${PKG_V1}::giverep_claim::Pool` + '<'); }

export interface PoolFields<T0 extends PhantomTypeArgument> { id: ToField<UID>; workspaceId: ToField<"u64">; balance: ToField<Balance<T0>>; managers: ToField<Vector<"address">>; claimed: ToField<Table<"address", "bool">> }

export type PoolReified<T0 extends PhantomTypeArgument> = Reified< Pool<T0>, PoolFields<T0> >;

export class Pool<T0 extends PhantomTypeArgument> implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::Pool`; static readonly $numTypeParams = 1; static readonly $isPhantom = [true,] as const;

 readonly $typeName = Pool.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::Pool<${PhantomToTypeStr<T0>}>`; readonly $typeArgs: [PhantomToTypeStr<T0>]; readonly $isPhantom = Pool.$isPhantom;

 readonly id: ToField<UID>; readonly workspaceId: ToField<"u64">; readonly balance: ToField<Balance<T0>>; readonly managers: ToField<Vector<"address">>; readonly claimed: ToField<Table<"address", "bool">>

 private constructor(typeArgs: [PhantomToTypeStr<T0>], fields: PoolFields<T0>, ) { this.$fullTypeName = composeSuiType( Pool.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::Pool<${PhantomToTypeStr<T0>}>`; this.$typeArgs = typeArgs;

 this.id = fields.id;; this.workspaceId = fields.workspaceId;; this.balance = fields.balance;; this.managers = fields.managers;; this.claimed = fields.claimed; }

 static reified<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): PoolReified<ToPhantomTypeArgument<T0>> { return { typeName: Pool.$typeName, fullTypeName: composeSuiType( Pool.$typeName, ...[extractType(T0)] ) as `${typeof PKG_V1}::giverep_claim::Pool<${PhantomToTypeStr<ToPhantomTypeArgument<T0>>}>`, typeArgs: [ extractType(T0) ] as [PhantomToTypeStr<ToPhantomTypeArgument<T0>>], isPhantom: Pool.$isPhantom, reifiedTypeArgs: [T0], fromFields: (fields: Record<string, any>) => Pool.fromFields( T0, fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => Pool.fromFieldsWithTypes( T0, item, ), fromBcs: (data: Uint8Array) => Pool.fromBcs( T0, data, ), bcs: Pool.bcs, fromJSONField: (field: any) => Pool.fromJSONField( T0, field, ), fromJSON: (json: Record<string, any>) => Pool.fromJSON( T0, json, ), fromSuiParsedData: (content: SuiParsedData) => Pool.fromSuiParsedData( T0, content, ), fromSuiObjectData: (content: SuiObjectData) => Pool.fromSuiObjectData( T0, content, ), fetch: async (client: SuiClient, id: string) => Pool.fetch( client, T0, id, ), new: ( fields: PoolFields<ToPhantomTypeArgument<T0>>, ) => { return new Pool( [extractType(T0)], fields ) }, kind: "StructClassReified", } }

 static get r() { return Pool.reified }

 static phantom<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): PhantomReified<ToTypeStr<Pool<ToPhantomTypeArgument<T0>>>> { return phantom(Pool.reified( T0 )); } static get p() { return Pool.phantom }

 static get bcs() { return bcs.struct("Pool", {

 id: UID.bcs, workspace_id: bcs.u64(), balance: Balance.bcs, managers: bcs.vector(bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), })), claimed: Table.bcs

}) };

 static fromFields<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, fields: Record<string, any> ): Pool<ToPhantomTypeArgument<T0>> { return Pool.reified( typeArg, ).new( { id: decodeFromFields(UID.reified(), fields.id), workspaceId: decodeFromFields("u64", fields.workspace_id), balance: decodeFromFields(Balance.reified(typeArg), fields.balance), managers: decodeFromFields(reified.vector("address"), fields.managers), claimed: decodeFromFields(Table.reified(reified.phantom("address"), reified.phantom("bool")), fields.claimed) } ) }

 static fromFieldsWithTypes<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, item: FieldsWithTypes ): Pool<ToPhantomTypeArgument<T0>> { if (!isPool(item.type)) { throw new Error("not a Pool type");

 } assertFieldsWithTypesArgsMatch(item, [typeArg]);

 return Pool.reified( typeArg, ).new( { id: decodeFromFieldsWithTypes(UID.reified(), item.fields.id), workspaceId: decodeFromFieldsWithTypes("u64", item.fields.workspace_id), balance: decodeFromFieldsWithTypes(Balance.reified(typeArg), item.fields.balance), managers: decodeFromFieldsWithTypes(reified.vector("address"), item.fields.managers), claimed: decodeFromFieldsWithTypes(Table.reified(reified.phantom("address"), reified.phantom("bool")), item.fields.claimed) } ) }

 static fromBcs<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: Uint8Array ): Pool<ToPhantomTypeArgument<T0>> { return Pool.fromFields( typeArg, Pool.bcs.parse(data) ) }

 toJSONField() { return {

 id: this.id,workspaceId: this.workspaceId.toString(),balance: this.balance.toJSONField(),managers: fieldToJSON<Vector<"address">>(`vector<address>`, this.managers),claimed: this.claimed.toJSONField(),

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, field: any ): Pool<ToPhantomTypeArgument<T0>> { return Pool.reified( typeArg, ).new( { id: decodeFromJSONField(UID.reified(), field.id), workspaceId: decodeFromJSONField("u64", field.workspaceId), balance: decodeFromJSONField(Balance.reified(typeArg), field.balance), managers: decodeFromJSONField(reified.vector("address"), field.managers), claimed: decodeFromJSONField(Table.reified(reified.phantom("address"), reified.phantom("bool")), field.claimed) } ) }

 static fromJSON<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, json: Record<string, any> ): Pool<ToPhantomTypeArgument<T0>> { if (json.$typeName !== Pool.$typeName) { throw new Error("not a WithTwoGenerics json object") }; assertReifiedTypeArgsMatch( composeSuiType(Pool.$typeName, extractType(typeArg)), json.$typeArgs, [typeArg], )

 return Pool.fromJSONField( typeArg, json, ) }

 static fromSuiParsedData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, content: SuiParsedData ): Pool<ToPhantomTypeArgument<T0>> { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isPool(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a Pool object`); } return Pool.fromFieldsWithTypes( typeArg, content ); }

 static fromSuiObjectData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: SuiObjectData ): Pool<ToPhantomTypeArgument<T0>> { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isPool(data.bcs.type)) { throw new Error(`object at is not a Pool object`); }

 const gotTypeArgs = parseTypeName(data.bcs.type).typeArgs; if (gotTypeArgs.length !== 1) { throw new Error(`type argument mismatch: expected 1 type argument but got '${gotTypeArgs.length}'`); }; const gotTypeArg = compressSuiType(gotTypeArgs[0]); const expectedTypeArg = compressSuiType(extractType(typeArg)); if (gotTypeArg !== compressSuiType(extractType(typeArg))) { throw new Error(`type argument mismatch: expected '${expectedTypeArg}' but got '${gotTypeArg}'`); };

 return Pool.fromBcs( typeArg, fromB64(data.bcs.bcsBytes) ); } if (data.content) { return Pool.fromSuiParsedData( typeArg, data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch<T0 extends PhantomReified<PhantomTypeArgument>>( client: SuiClient, typeArg: T0, id: string ): Promise<Pool<ToPhantomTypeArgument<T0>>> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching Pool object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isPool(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a Pool object`); }

 return Pool.fromSuiObjectData( typeArg, res.data ); }

 }

/* ============================== PoolCreatedEvent =============================== */

export function isPoolCreatedEvent(type: string): boolean { type = compressSuiType(type); return type === `${PKG_V1}::giverep_claim::PoolCreatedEvent`; }

export interface PoolCreatedEventFields { poolId: ToField<ID>; workspaceId: ToField<"u64">; initialAmount: ToField<"u64">; managers: ToField<Vector<"address">> }

export type PoolCreatedEventReified = Reified< PoolCreatedEvent, PoolCreatedEventFields >;

export class PoolCreatedEvent implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::PoolCreatedEvent`; static readonly $numTypeParams = 0; static readonly $isPhantom = [] as const;

 readonly $typeName = PoolCreatedEvent.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::PoolCreatedEvent`; readonly $typeArgs: []; readonly $isPhantom = PoolCreatedEvent.$isPhantom;

 readonly poolId: ToField<ID>; readonly workspaceId: ToField<"u64">; readonly initialAmount: ToField<"u64">; readonly managers: ToField<Vector<"address">>

 private constructor(typeArgs: [], fields: PoolCreatedEventFields, ) { this.$fullTypeName = composeSuiType( PoolCreatedEvent.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::PoolCreatedEvent`; this.$typeArgs = typeArgs;

 this.poolId = fields.poolId;; this.workspaceId = fields.workspaceId;; this.initialAmount = fields.initialAmount;; this.managers = fields.managers; }

 static reified( ): PoolCreatedEventReified { return { typeName: PoolCreatedEvent.$typeName, fullTypeName: composeSuiType( PoolCreatedEvent.$typeName, ...[] ) as `${typeof PKG_V1}::giverep_claim::PoolCreatedEvent`, typeArgs: [ ] as [], isPhantom: PoolCreatedEvent.$isPhantom, reifiedTypeArgs: [], fromFields: (fields: Record<string, any>) => PoolCreatedEvent.fromFields( fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => PoolCreatedEvent.fromFieldsWithTypes( item, ), fromBcs: (data: Uint8Array) => PoolCreatedEvent.fromBcs( data, ), bcs: PoolCreatedEvent.bcs, fromJSONField: (field: any) => PoolCreatedEvent.fromJSONField( field, ), fromJSON: (json: Record<string, any>) => PoolCreatedEvent.fromJSON( json, ), fromSuiParsedData: (content: SuiParsedData) => PoolCreatedEvent.fromSuiParsedData( content, ), fromSuiObjectData: (content: SuiObjectData) => PoolCreatedEvent.fromSuiObjectData( content, ), fetch: async (client: SuiClient, id: string) => PoolCreatedEvent.fetch( client, id, ), new: ( fields: PoolCreatedEventFields, ) => { return new PoolCreatedEvent( [], fields ) }, kind: "StructClassReified", } }

 static get r() { return PoolCreatedEvent.reified() }

 static phantom( ): PhantomReified<ToTypeStr<PoolCreatedEvent>> { return phantom(PoolCreatedEvent.reified( )); } static get p() { return PoolCreatedEvent.phantom() }

 static get bcs() { return bcs.struct("PoolCreatedEvent", {

 pool_id: ID.bcs, workspace_id: bcs.u64(), initial_amount: bcs.u64(), managers: bcs.vector(bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), }))

}) };

 static fromFields( fields: Record<string, any> ): PoolCreatedEvent { return PoolCreatedEvent.reified( ).new( { poolId: decodeFromFields(ID.reified(), fields.pool_id), workspaceId: decodeFromFields("u64", fields.workspace_id), initialAmount: decodeFromFields("u64", fields.initial_amount), managers: decodeFromFields(reified.vector("address"), fields.managers) } ) }

 static fromFieldsWithTypes( item: FieldsWithTypes ): PoolCreatedEvent { if (!isPoolCreatedEvent(item.type)) { throw new Error("not a PoolCreatedEvent type");

 }

 return PoolCreatedEvent.reified( ).new( { poolId: decodeFromFieldsWithTypes(ID.reified(), item.fields.pool_id), workspaceId: decodeFromFieldsWithTypes("u64", item.fields.workspace_id), initialAmount: decodeFromFieldsWithTypes("u64", item.fields.initial_amount), managers: decodeFromFieldsWithTypes(reified.vector("address"), item.fields.managers) } ) }

 static fromBcs( data: Uint8Array ): PoolCreatedEvent { return PoolCreatedEvent.fromFields( PoolCreatedEvent.bcs.parse(data) ) }

 toJSONField() { return {

 poolId: this.poolId,workspaceId: this.workspaceId.toString(),initialAmount: this.initialAmount.toString(),managers: fieldToJSON<Vector<"address">>(`vector<address>`, this.managers),

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField( field: any ): PoolCreatedEvent { return PoolCreatedEvent.reified( ).new( { poolId: decodeFromJSONField(ID.reified(), field.poolId), workspaceId: decodeFromJSONField("u64", field.workspaceId), initialAmount: decodeFromJSONField("u64", field.initialAmount), managers: decodeFromJSONField(reified.vector("address"), field.managers) } ) }

 static fromJSON( json: Record<string, any> ): PoolCreatedEvent { if (json.$typeName !== PoolCreatedEvent.$typeName) { throw new Error("not a WithTwoGenerics json object") };

 return PoolCreatedEvent.fromJSONField( json, ) }

 static fromSuiParsedData( content: SuiParsedData ): PoolCreatedEvent { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isPoolCreatedEvent(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a PoolCreatedEvent object`); } return PoolCreatedEvent.fromFieldsWithTypes( content ); }

 static fromSuiObjectData( data: SuiObjectData ): PoolCreatedEvent { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isPoolCreatedEvent(data.bcs.type)) { throw new Error(`object at is not a PoolCreatedEvent object`); }

 return PoolCreatedEvent.fromBcs( fromB64(data.bcs.bcsBytes) ); } if (data.content) { return PoolCreatedEvent.fromSuiParsedData( data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch( client: SuiClient, id: string ): Promise<PoolCreatedEvent> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching PoolCreatedEvent object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isPoolCreatedEvent(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a PoolCreatedEvent object`); }

 return PoolCreatedEvent.fromSuiObjectData( res.data ); }

 }

/* ============================== DepositEvent =============================== */

export function isDepositEvent(type: string): boolean { type = compressSuiType(type); return type.startsWith(`${PKG_V1}::giverep_claim::DepositEvent` + '<'); }

export interface DepositEventFields<T0 extends PhantomTypeArgument> { poolId: ToField<ID>; workspaceId: ToField<"u64">; amount: ToField<"u64">; depositor: ToField<"address"> }

export type DepositEventReified<T0 extends PhantomTypeArgument> = Reified< DepositEvent<T0>, DepositEventFields<T0> >;

export class DepositEvent<T0 extends PhantomTypeArgument> implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::DepositEvent`; static readonly $numTypeParams = 1; static readonly $isPhantom = [true,] as const;

 readonly $typeName = DepositEvent.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::DepositEvent<${PhantomToTypeStr<T0>}>`; readonly $typeArgs: [PhantomToTypeStr<T0>]; readonly $isPhantom = DepositEvent.$isPhantom;

 readonly poolId: ToField<ID>; readonly workspaceId: ToField<"u64">; readonly amount: ToField<"u64">; readonly depositor: ToField<"address">

 private constructor(typeArgs: [PhantomToTypeStr<T0>], fields: DepositEventFields<T0>, ) { this.$fullTypeName = composeSuiType( DepositEvent.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::DepositEvent<${PhantomToTypeStr<T0>}>`; this.$typeArgs = typeArgs;

 this.poolId = fields.poolId;; this.workspaceId = fields.workspaceId;; this.amount = fields.amount;; this.depositor = fields.depositor; }

 static reified<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): DepositEventReified<ToPhantomTypeArgument<T0>> { return { typeName: DepositEvent.$typeName, fullTypeName: composeSuiType( DepositEvent.$typeName, ...[extractType(T0)] ) as `${typeof PKG_V1}::giverep_claim::DepositEvent<${PhantomToTypeStr<ToPhantomTypeArgument<T0>>}>`, typeArgs: [ extractType(T0) ] as [PhantomToTypeStr<ToPhantomTypeArgument<T0>>], isPhantom: DepositEvent.$isPhantom, reifiedTypeArgs: [T0], fromFields: (fields: Record<string, any>) => DepositEvent.fromFields( T0, fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => DepositEvent.fromFieldsWithTypes( T0, item, ), fromBcs: (data: Uint8Array) => DepositEvent.fromBcs( T0, data, ), bcs: DepositEvent.bcs, fromJSONField: (field: any) => DepositEvent.fromJSONField( T0, field, ), fromJSON: (json: Record<string, any>) => DepositEvent.fromJSON( T0, json, ), fromSuiParsedData: (content: SuiParsedData) => DepositEvent.fromSuiParsedData( T0, content, ), fromSuiObjectData: (content: SuiObjectData) => DepositEvent.fromSuiObjectData( T0, content, ), fetch: async (client: SuiClient, id: string) => DepositEvent.fetch( client, T0, id, ), new: ( fields: DepositEventFields<ToPhantomTypeArgument<T0>>, ) => { return new DepositEvent( [extractType(T0)], fields ) }, kind: "StructClassReified", } }

 static get r() { return DepositEvent.reified }

 static phantom<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): PhantomReified<ToTypeStr<DepositEvent<ToPhantomTypeArgument<T0>>>> { return phantom(DepositEvent.reified( T0 )); } static get p() { return DepositEvent.phantom }

 static get bcs() { return bcs.struct("DepositEvent", {

 pool_id: ID.bcs, workspace_id: bcs.u64(), amount: bcs.u64(), depositor: bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), })

}) };

 static fromFields<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, fields: Record<string, any> ): DepositEvent<ToPhantomTypeArgument<T0>> { return DepositEvent.reified( typeArg, ).new( { poolId: decodeFromFields(ID.reified(), fields.pool_id), workspaceId: decodeFromFields("u64", fields.workspace_id), amount: decodeFromFields("u64", fields.amount), depositor: decodeFromFields("address", fields.depositor) } ) }

 static fromFieldsWithTypes<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, item: FieldsWithTypes ): DepositEvent<ToPhantomTypeArgument<T0>> { if (!isDepositEvent(item.type)) { throw new Error("not a DepositEvent type");

 } assertFieldsWithTypesArgsMatch(item, [typeArg]);

 return DepositEvent.reified( typeArg, ).new( { poolId: decodeFromFieldsWithTypes(ID.reified(), item.fields.pool_id), workspaceId: decodeFromFieldsWithTypes("u64", item.fields.workspace_id), amount: decodeFromFieldsWithTypes("u64", item.fields.amount), depositor: decodeFromFieldsWithTypes("address", item.fields.depositor) } ) }

 static fromBcs<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: Uint8Array ): DepositEvent<ToPhantomTypeArgument<T0>> { return DepositEvent.fromFields( typeArg, DepositEvent.bcs.parse(data) ) }

 toJSONField() { return {

 poolId: this.poolId,workspaceId: this.workspaceId.toString(),amount: this.amount.toString(),depositor: this.depositor,

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, field: any ): DepositEvent<ToPhantomTypeArgument<T0>> { return DepositEvent.reified( typeArg, ).new( { poolId: decodeFromJSONField(ID.reified(), field.poolId), workspaceId: decodeFromJSONField("u64", field.workspaceId), amount: decodeFromJSONField("u64", field.amount), depositor: decodeFromJSONField("address", field.depositor) } ) }

 static fromJSON<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, json: Record<string, any> ): DepositEvent<ToPhantomTypeArgument<T0>> { if (json.$typeName !== DepositEvent.$typeName) { throw new Error("not a WithTwoGenerics json object") }; assertReifiedTypeArgsMatch( composeSuiType(DepositEvent.$typeName, extractType(typeArg)), json.$typeArgs, [typeArg], )

 return DepositEvent.fromJSONField( typeArg, json, ) }

 static fromSuiParsedData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, content: SuiParsedData ): DepositEvent<ToPhantomTypeArgument<T0>> { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isDepositEvent(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a DepositEvent object`); } return DepositEvent.fromFieldsWithTypes( typeArg, content ); }

 static fromSuiObjectData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: SuiObjectData ): DepositEvent<ToPhantomTypeArgument<T0>> { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isDepositEvent(data.bcs.type)) { throw new Error(`object at is not a DepositEvent object`); }

 const gotTypeArgs = parseTypeName(data.bcs.type).typeArgs; if (gotTypeArgs.length !== 1) { throw new Error(`type argument mismatch: expected 1 type argument but got '${gotTypeArgs.length}'`); }; const gotTypeArg = compressSuiType(gotTypeArgs[0]); const expectedTypeArg = compressSuiType(extractType(typeArg)); if (gotTypeArg !== compressSuiType(extractType(typeArg))) { throw new Error(`type argument mismatch: expected '${expectedTypeArg}' but got '${gotTypeArg}'`); };

 return DepositEvent.fromBcs( typeArg, fromB64(data.bcs.bcsBytes) ); } if (data.content) { return DepositEvent.fromSuiParsedData( typeArg, data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch<T0 extends PhantomReified<PhantomTypeArgument>>( client: SuiClient, typeArg: T0, id: string ): Promise<DepositEvent<ToPhantomTypeArgument<T0>>> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching DepositEvent object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isDepositEvent(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a DepositEvent object`); }

 return DepositEvent.fromSuiObjectData( typeArg, res.data ); }

 }

/* ============================== WithdrawEvent =============================== */

export function isWithdrawEvent(type: string): boolean { type = compressSuiType(type); return type.startsWith(`${PKG_V1}::giverep_claim::WithdrawEvent` + '<'); }

export interface WithdrawEventFields<T0 extends PhantomTypeArgument> { poolId: ToField<ID>; workspaceId: ToField<"u64">; amount: ToField<"u64">; withdrawer: ToField<"address"> }

export type WithdrawEventReified<T0 extends PhantomTypeArgument> = Reified< WithdrawEvent<T0>, WithdrawEventFields<T0> >;

export class WithdrawEvent<T0 extends PhantomTypeArgument> implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::WithdrawEvent`; static readonly $numTypeParams = 1; static readonly $isPhantom = [true,] as const;

 readonly $typeName = WithdrawEvent.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::WithdrawEvent<${PhantomToTypeStr<T0>}>`; readonly $typeArgs: [PhantomToTypeStr<T0>]; readonly $isPhantom = WithdrawEvent.$isPhantom;

 readonly poolId: ToField<ID>; readonly workspaceId: ToField<"u64">; readonly amount: ToField<"u64">; readonly withdrawer: ToField<"address">

 private constructor(typeArgs: [PhantomToTypeStr<T0>], fields: WithdrawEventFields<T0>, ) { this.$fullTypeName = composeSuiType( WithdrawEvent.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::WithdrawEvent<${PhantomToTypeStr<T0>}>`; this.$typeArgs = typeArgs;

 this.poolId = fields.poolId;; this.workspaceId = fields.workspaceId;; this.amount = fields.amount;; this.withdrawer = fields.withdrawer; }

 static reified<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): WithdrawEventReified<ToPhantomTypeArgument<T0>> { return { typeName: WithdrawEvent.$typeName, fullTypeName: composeSuiType( WithdrawEvent.$typeName, ...[extractType(T0)] ) as `${typeof PKG_V1}::giverep_claim::WithdrawEvent<${PhantomToTypeStr<ToPhantomTypeArgument<T0>>}>`, typeArgs: [ extractType(T0) ] as [PhantomToTypeStr<ToPhantomTypeArgument<T0>>], isPhantom: WithdrawEvent.$isPhantom, reifiedTypeArgs: [T0], fromFields: (fields: Record<string, any>) => WithdrawEvent.fromFields( T0, fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => WithdrawEvent.fromFieldsWithTypes( T0, item, ), fromBcs: (data: Uint8Array) => WithdrawEvent.fromBcs( T0, data, ), bcs: WithdrawEvent.bcs, fromJSONField: (field: any) => WithdrawEvent.fromJSONField( T0, field, ), fromJSON: (json: Record<string, any>) => WithdrawEvent.fromJSON( T0, json, ), fromSuiParsedData: (content: SuiParsedData) => WithdrawEvent.fromSuiParsedData( T0, content, ), fromSuiObjectData: (content: SuiObjectData) => WithdrawEvent.fromSuiObjectData( T0, content, ), fetch: async (client: SuiClient, id: string) => WithdrawEvent.fetch( client, T0, id, ), new: ( fields: WithdrawEventFields<ToPhantomTypeArgument<T0>>, ) => { return new WithdrawEvent( [extractType(T0)], fields ) }, kind: "StructClassReified", } }

 static get r() { return WithdrawEvent.reified }

 static phantom<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): PhantomReified<ToTypeStr<WithdrawEvent<ToPhantomTypeArgument<T0>>>> { return phantom(WithdrawEvent.reified( T0 )); } static get p() { return WithdrawEvent.phantom }

 static get bcs() { return bcs.struct("WithdrawEvent", {

 pool_id: ID.bcs, workspace_id: bcs.u64(), amount: bcs.u64(), withdrawer: bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), })

}) };

 static fromFields<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, fields: Record<string, any> ): WithdrawEvent<ToPhantomTypeArgument<T0>> { return WithdrawEvent.reified( typeArg, ).new( { poolId: decodeFromFields(ID.reified(), fields.pool_id), workspaceId: decodeFromFields("u64", fields.workspace_id), amount: decodeFromFields("u64", fields.amount), withdrawer: decodeFromFields("address", fields.withdrawer) } ) }

 static fromFieldsWithTypes<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, item: FieldsWithTypes ): WithdrawEvent<ToPhantomTypeArgument<T0>> { if (!isWithdrawEvent(item.type)) { throw new Error("not a WithdrawEvent type");

 } assertFieldsWithTypesArgsMatch(item, [typeArg]);

 return WithdrawEvent.reified( typeArg, ).new( { poolId: decodeFromFieldsWithTypes(ID.reified(), item.fields.pool_id), workspaceId: decodeFromFieldsWithTypes("u64", item.fields.workspace_id), amount: decodeFromFieldsWithTypes("u64", item.fields.amount), withdrawer: decodeFromFieldsWithTypes("address", item.fields.withdrawer) } ) }

 static fromBcs<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: Uint8Array ): WithdrawEvent<ToPhantomTypeArgument<T0>> { return WithdrawEvent.fromFields( typeArg, WithdrawEvent.bcs.parse(data) ) }

 toJSONField() { return {

 poolId: this.poolId,workspaceId: this.workspaceId.toString(),amount: this.amount.toString(),withdrawer: this.withdrawer,

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, field: any ): WithdrawEvent<ToPhantomTypeArgument<T0>> { return WithdrawEvent.reified( typeArg, ).new( { poolId: decodeFromJSONField(ID.reified(), field.poolId), workspaceId: decodeFromJSONField("u64", field.workspaceId), amount: decodeFromJSONField("u64", field.amount), withdrawer: decodeFromJSONField("address", field.withdrawer) } ) }

 static fromJSON<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, json: Record<string, any> ): WithdrawEvent<ToPhantomTypeArgument<T0>> { if (json.$typeName !== WithdrawEvent.$typeName) { throw new Error("not a WithTwoGenerics json object") }; assertReifiedTypeArgsMatch( composeSuiType(WithdrawEvent.$typeName, extractType(typeArg)), json.$typeArgs, [typeArg], )

 return WithdrawEvent.fromJSONField( typeArg, json, ) }

 static fromSuiParsedData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, content: SuiParsedData ): WithdrawEvent<ToPhantomTypeArgument<T0>> { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isWithdrawEvent(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a WithdrawEvent object`); } return WithdrawEvent.fromFieldsWithTypes( typeArg, content ); }

 static fromSuiObjectData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: SuiObjectData ): WithdrawEvent<ToPhantomTypeArgument<T0>> { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isWithdrawEvent(data.bcs.type)) { throw new Error(`object at is not a WithdrawEvent object`); }

 const gotTypeArgs = parseTypeName(data.bcs.type).typeArgs; if (gotTypeArgs.length !== 1) { throw new Error(`type argument mismatch: expected 1 type argument but got '${gotTypeArgs.length}'`); }; const gotTypeArg = compressSuiType(gotTypeArgs[0]); const expectedTypeArg = compressSuiType(extractType(typeArg)); if (gotTypeArg !== compressSuiType(extractType(typeArg))) { throw new Error(`type argument mismatch: expected '${expectedTypeArg}' but got '${gotTypeArg}'`); };

 return WithdrawEvent.fromBcs( typeArg, fromB64(data.bcs.bcsBytes) ); } if (data.content) { return WithdrawEvent.fromSuiParsedData( typeArg, data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch<T0 extends PhantomReified<PhantomTypeArgument>>( client: SuiClient, typeArg: T0, id: string ): Promise<WithdrawEvent<ToPhantomTypeArgument<T0>>> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching WithdrawEvent object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isWithdrawEvent(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a WithdrawEvent object`); }

 return WithdrawEvent.fromSuiObjectData( typeArg, res.data ); }

 }

/* ============================== ClaimEvent =============================== */

export function isClaimEvent(type: string): boolean { type = compressSuiType(type); return type.startsWith(`${PKG_V1}::giverep_claim::ClaimEvent` + '<'); }

export interface ClaimEventFields<T0 extends PhantomTypeArgument> { poolId: ToField<ID>; workspaceId: ToField<"u64">; amount: ToField<"u64">; manager: ToField<"address">; receiver: ToField<"address"> }

export type ClaimEventReified<T0 extends PhantomTypeArgument> = Reified< ClaimEvent<T0>, ClaimEventFields<T0> >;

export class ClaimEvent<T0 extends PhantomTypeArgument> implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::ClaimEvent`; static readonly $numTypeParams = 1; static readonly $isPhantom = [true,] as const;

 readonly $typeName = ClaimEvent.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::ClaimEvent<${PhantomToTypeStr<T0>}>`; readonly $typeArgs: [PhantomToTypeStr<T0>]; readonly $isPhantom = ClaimEvent.$isPhantom;

 readonly poolId: ToField<ID>; readonly workspaceId: ToField<"u64">; readonly amount: ToField<"u64">; readonly manager: ToField<"address">; readonly receiver: ToField<"address">

 private constructor(typeArgs: [PhantomToTypeStr<T0>], fields: ClaimEventFields<T0>, ) { this.$fullTypeName = composeSuiType( ClaimEvent.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::ClaimEvent<${PhantomToTypeStr<T0>}>`; this.$typeArgs = typeArgs;

 this.poolId = fields.poolId;; this.workspaceId = fields.workspaceId;; this.amount = fields.amount;; this.manager = fields.manager;; this.receiver = fields.receiver; }

 static reified<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): ClaimEventReified<ToPhantomTypeArgument<T0>> { return { typeName: ClaimEvent.$typeName, fullTypeName: composeSuiType( ClaimEvent.$typeName, ...[extractType(T0)] ) as `${typeof PKG_V1}::giverep_claim::ClaimEvent<${PhantomToTypeStr<ToPhantomTypeArgument<T0>>}>`, typeArgs: [ extractType(T0) ] as [PhantomToTypeStr<ToPhantomTypeArgument<T0>>], isPhantom: ClaimEvent.$isPhantom, reifiedTypeArgs: [T0], fromFields: (fields: Record<string, any>) => ClaimEvent.fromFields( T0, fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => ClaimEvent.fromFieldsWithTypes( T0, item, ), fromBcs: (data: Uint8Array) => ClaimEvent.fromBcs( T0, data, ), bcs: ClaimEvent.bcs, fromJSONField: (field: any) => ClaimEvent.fromJSONField( T0, field, ), fromJSON: (json: Record<string, any>) => ClaimEvent.fromJSON( T0, json, ), fromSuiParsedData: (content: SuiParsedData) => ClaimEvent.fromSuiParsedData( T0, content, ), fromSuiObjectData: (content: SuiObjectData) => ClaimEvent.fromSuiObjectData( T0, content, ), fetch: async (client: SuiClient, id: string) => ClaimEvent.fetch( client, T0, id, ), new: ( fields: ClaimEventFields<ToPhantomTypeArgument<T0>>, ) => { return new ClaimEvent( [extractType(T0)], fields ) }, kind: "StructClassReified", } }

 static get r() { return ClaimEvent.reified }

 static phantom<T0 extends PhantomReified<PhantomTypeArgument>>( T0: T0 ): PhantomReified<ToTypeStr<ClaimEvent<ToPhantomTypeArgument<T0>>>> { return phantom(ClaimEvent.reified( T0 )); } static get p() { return ClaimEvent.phantom }

 static get bcs() { return bcs.struct("ClaimEvent", {

 pool_id: ID.bcs, workspace_id: bcs.u64(), amount: bcs.u64(), manager: bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), }), receiver: bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), })

}) };

 static fromFields<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, fields: Record<string, any> ): ClaimEvent<ToPhantomTypeArgument<T0>> { return ClaimEvent.reified( typeArg, ).new( { poolId: decodeFromFields(ID.reified(), fields.pool_id), workspaceId: decodeFromFields("u64", fields.workspace_id), amount: decodeFromFields("u64", fields.amount), manager: decodeFromFields("address", fields.manager), receiver: decodeFromFields("address", fields.receiver) } ) }

 static fromFieldsWithTypes<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, item: FieldsWithTypes ): ClaimEvent<ToPhantomTypeArgument<T0>> { if (!isClaimEvent(item.type)) { throw new Error("not a ClaimEvent type");

 } assertFieldsWithTypesArgsMatch(item, [typeArg]);

 return ClaimEvent.reified( typeArg, ).new( { poolId: decodeFromFieldsWithTypes(ID.reified(), item.fields.pool_id), workspaceId: decodeFromFieldsWithTypes("u64", item.fields.workspace_id), amount: decodeFromFieldsWithTypes("u64", item.fields.amount), manager: decodeFromFieldsWithTypes("address", item.fields.manager), receiver: decodeFromFieldsWithTypes("address", item.fields.receiver) } ) }

 static fromBcs<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: Uint8Array ): ClaimEvent<ToPhantomTypeArgument<T0>> { return ClaimEvent.fromFields( typeArg, ClaimEvent.bcs.parse(data) ) }

 toJSONField() { return {

 poolId: this.poolId,workspaceId: this.workspaceId.toString(),amount: this.amount.toString(),manager: this.manager,receiver: this.receiver,

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, field: any ): ClaimEvent<ToPhantomTypeArgument<T0>> { return ClaimEvent.reified( typeArg, ).new( { poolId: decodeFromJSONField(ID.reified(), field.poolId), workspaceId: decodeFromJSONField("u64", field.workspaceId), amount: decodeFromJSONField("u64", field.amount), manager: decodeFromJSONField("address", field.manager), receiver: decodeFromJSONField("address", field.receiver) } ) }

 static fromJSON<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, json: Record<string, any> ): ClaimEvent<ToPhantomTypeArgument<T0>> { if (json.$typeName !== ClaimEvent.$typeName) { throw new Error("not a WithTwoGenerics json object") }; assertReifiedTypeArgsMatch( composeSuiType(ClaimEvent.$typeName, extractType(typeArg)), json.$typeArgs, [typeArg], )

 return ClaimEvent.fromJSONField( typeArg, json, ) }

 static fromSuiParsedData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, content: SuiParsedData ): ClaimEvent<ToPhantomTypeArgument<T0>> { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isClaimEvent(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a ClaimEvent object`); } return ClaimEvent.fromFieldsWithTypes( typeArg, content ); }

 static fromSuiObjectData<T0 extends PhantomReified<PhantomTypeArgument>>( typeArg: T0, data: SuiObjectData ): ClaimEvent<ToPhantomTypeArgument<T0>> { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isClaimEvent(data.bcs.type)) { throw new Error(`object at is not a ClaimEvent object`); }

 const gotTypeArgs = parseTypeName(data.bcs.type).typeArgs; if (gotTypeArgs.length !== 1) { throw new Error(`type argument mismatch: expected 1 type argument but got '${gotTypeArgs.length}'`); }; const gotTypeArg = compressSuiType(gotTypeArgs[0]); const expectedTypeArg = compressSuiType(extractType(typeArg)); if (gotTypeArg !== compressSuiType(extractType(typeArg))) { throw new Error(`type argument mismatch: expected '${expectedTypeArg}' but got '${gotTypeArg}'`); };

 return ClaimEvent.fromBcs( typeArg, fromB64(data.bcs.bcsBytes) ); } if (data.content) { return ClaimEvent.fromSuiParsedData( typeArg, data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch<T0 extends PhantomReified<PhantomTypeArgument>>( client: SuiClient, typeArg: T0, id: string ): Promise<ClaimEvent<ToPhantomTypeArgument<T0>>> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching ClaimEvent object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isClaimEvent(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a ClaimEvent object`); }

 return ClaimEvent.fromSuiObjectData( typeArg, res.data ); }

 }

/* ============================== PoolDeletedEvent =============================== */

export function isPoolDeletedEvent(type: string): boolean { type = compressSuiType(type); return type === `${PKG_V1}::giverep_claim::PoolDeletedEvent`; }

export interface PoolDeletedEventFields { poolId: ToField<ID>; workspaceId: ToField<"u64">; sender: ToField<"address"> }

export type PoolDeletedEventReified = Reified< PoolDeletedEvent, PoolDeletedEventFields >;

export class PoolDeletedEvent implements StructClass { __StructClass = true as const;

 static readonly $typeName = `${PKG_V1}::giverep_claim::PoolDeletedEvent`; static readonly $numTypeParams = 0; static readonly $isPhantom = [] as const;

 readonly $typeName = PoolDeletedEvent.$typeName; readonly $fullTypeName: `${typeof PKG_V1}::giverep_claim::PoolDeletedEvent`; readonly $typeArgs: []; readonly $isPhantom = PoolDeletedEvent.$isPhantom;

 readonly poolId: ToField<ID>; readonly workspaceId: ToField<"u64">; readonly sender: ToField<"address">

 private constructor(typeArgs: [], fields: PoolDeletedEventFields, ) { this.$fullTypeName = composeSuiType( PoolDeletedEvent.$typeName, ...typeArgs ) as `${typeof PKG_V1}::giverep_claim::PoolDeletedEvent`; this.$typeArgs = typeArgs;

 this.poolId = fields.poolId;; this.workspaceId = fields.workspaceId;; this.sender = fields.sender; }

 static reified( ): PoolDeletedEventReified { return { typeName: PoolDeletedEvent.$typeName, fullTypeName: composeSuiType( PoolDeletedEvent.$typeName, ...[] ) as `${typeof PKG_V1}::giverep_claim::PoolDeletedEvent`, typeArgs: [ ] as [], isPhantom: PoolDeletedEvent.$isPhantom, reifiedTypeArgs: [], fromFields: (fields: Record<string, any>) => PoolDeletedEvent.fromFields( fields, ), fromFieldsWithTypes: (item: FieldsWithTypes) => PoolDeletedEvent.fromFieldsWithTypes( item, ), fromBcs: (data: Uint8Array) => PoolDeletedEvent.fromBcs( data, ), bcs: PoolDeletedEvent.bcs, fromJSONField: (field: any) => PoolDeletedEvent.fromJSONField( field, ), fromJSON: (json: Record<string, any>) => PoolDeletedEvent.fromJSON( json, ), fromSuiParsedData: (content: SuiParsedData) => PoolDeletedEvent.fromSuiParsedData( content, ), fromSuiObjectData: (content: SuiObjectData) => PoolDeletedEvent.fromSuiObjectData( content, ), fetch: async (client: SuiClient, id: string) => PoolDeletedEvent.fetch( client, id, ), new: ( fields: PoolDeletedEventFields, ) => { return new PoolDeletedEvent( [], fields ) }, kind: "StructClassReified", } }

 static get r() { return PoolDeletedEvent.reified() }

 static phantom( ): PhantomReified<ToTypeStr<PoolDeletedEvent>> { return phantom(PoolDeletedEvent.reified( )); } static get p() { return PoolDeletedEvent.phantom() }

 static get bcs() { return bcs.struct("PoolDeletedEvent", {

 pool_id: ID.bcs, workspace_id: bcs.u64(), sender: bcs.bytes(32).transform({ input: (val: string) => fromHEX(val), output: (val: Uint8Array) => toHEX(val), })

}) };

 static fromFields( fields: Record<string, any> ): PoolDeletedEvent { return PoolDeletedEvent.reified( ).new( { poolId: decodeFromFields(ID.reified(), fields.pool_id), workspaceId: decodeFromFields("u64", fields.workspace_id), sender: decodeFromFields("address", fields.sender) } ) }

 static fromFieldsWithTypes( item: FieldsWithTypes ): PoolDeletedEvent { if (!isPoolDeletedEvent(item.type)) { throw new Error("not a PoolDeletedEvent type");

 }

 return PoolDeletedEvent.reified( ).new( { poolId: decodeFromFieldsWithTypes(ID.reified(), item.fields.pool_id), workspaceId: decodeFromFieldsWithTypes("u64", item.fields.workspace_id), sender: decodeFromFieldsWithTypes("address", item.fields.sender) } ) }

 static fromBcs( data: Uint8Array ): PoolDeletedEvent { return PoolDeletedEvent.fromFields( PoolDeletedEvent.bcs.parse(data) ) }

 toJSONField() { return {

 poolId: this.poolId,workspaceId: this.workspaceId.toString(),sender: this.sender,

} }

 toJSON() { return { $typeName: this.$typeName, $typeArgs: this.$typeArgs, ...this.toJSONField() } }

 static fromJSONField( field: any ): PoolDeletedEvent { return PoolDeletedEvent.reified( ).new( { poolId: decodeFromJSONField(ID.reified(), field.poolId), workspaceId: decodeFromJSONField("u64", field.workspaceId), sender: decodeFromJSONField("address", field.sender) } ) }

 static fromJSON( json: Record<string, any> ): PoolDeletedEvent { if (json.$typeName !== PoolDeletedEvent.$typeName) { throw new Error("not a WithTwoGenerics json object") };

 return PoolDeletedEvent.fromJSONField( json, ) }

 static fromSuiParsedData( content: SuiParsedData ): PoolDeletedEvent { if (content.dataType !== "moveObject") { throw new Error("not an object"); } if (!isPoolDeletedEvent(content.type)) { throw new Error(`object at ${(content.fields as any).id} is not a PoolDeletedEvent object`); } return PoolDeletedEvent.fromFieldsWithTypes( content ); }

 static fromSuiObjectData( data: SuiObjectData ): PoolDeletedEvent { if (data.bcs) { if (data.bcs.dataType !== "moveObject" || !isPoolDeletedEvent(data.bcs.type)) { throw new Error(`object at is not a PoolDeletedEvent object`); }

 return PoolDeletedEvent.fromBcs( fromB64(data.bcs.bcsBytes) ); } if (data.content) { return PoolDeletedEvent.fromSuiParsedData( data.content ) } throw new Error( "Both `bcs` and `content` fields are missing from the data. Include `showBcs` or `showContent` in the request." ); }

 static async fetch( client: SuiClient, id: string ): Promise<PoolDeletedEvent> { const res = await client.getObject({ id, options: { showBcs: true, }, }); if (res.error) { throw new Error(`error fetching PoolDeletedEvent object at id ${id}: ${res.error.code}`); } if (res.data?.bcs?.dataType !== "moveObject" || !isPoolDeletedEvent(res.data.bcs.type)) { throw new Error(`object at id ${id} is not a PoolDeletedEvent object`); }

 return PoolDeletedEvent.fromSuiObjectData( res.data ); }

 }
