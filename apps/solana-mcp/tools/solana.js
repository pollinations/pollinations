import { z } from "zod";
import { rpcCall } from "../fetch.js";

export const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_SWAP_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

const CREATE_EVENT = Uint8Array.from([27, 114, 169, 77, 222, 235, 99, 118]);
const TRADE_EVENT = Uint8Array.from([189, 219, 127, 211, 78, 230, 97, 238]);
const SWAP_CREATE_POOL_EVENT = Uint8Array.from([177, 49, 12, 210, 160, 118, 167, 116]);
const SWAP_BUY_EVENT = Uint8Array.from([103, 244, 82, 31, 44, 245, 119, 119]);
const SWAP_SELL_EVENT = Uint8Array.from([62, 47, 55, 10, 165, 3, 220, 42]);

const mintSchema = z.string().trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Use a valid base58 Solana mint address.")
    .describe("Solana token mint address (base58)");
const limitSchema = z.number().int().min(1).max(10).default(5)
    .describe("Number of recent signatures to inspect (default 5, max 10)");

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes) {
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    let encoded = "";
    while (value > 0n) {
        const remainder = Number(value % 58n);
        value /= 58n;
        encoded = ALPHABET[remainder] + encoded;
    }
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
    return "1".repeat(zeros) + encoded;
}

class Reader {
    constructor(bytes) {
        this.bytes = bytes;
        this.offset = 0;
    }
    take(size) {
        if (!Number.isInteger(size) || size < 0 || this.offset + size > this.bytes.length)
            throw new Error("Truncated on-chain event payload.");
        const value = this.bytes.slice(this.offset, this.offset + size);
        this.offset += size;
        return value;
    }
    u8() { return this.take(1)[0]; }
    u16() { return new DataView(this.take(2).buffer).getUint16(0, true); }
    u32() { return new DataView(this.take(4).buffer).getUint32(0, true); }
    u64() { return new DataView(this.take(8).buffer).getBigUint64(0, true).toString(); }
    i64() { return Number(BigInt.asIntN(64, BigInt(\`0x\${[...this.take(8)].reverse().map(x => x.toString(16).padStart(2, "0")).join("") || "0"\`))); }
    u128() {
        const bytes = this.take(16);
        let value = 0n;
        for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i]);
        return value;
    }
    i128() { return BigInt.asIntN(128, this.u128()).toString(); }
    bool() {
        const value = this.u8();
        if (value !== 0 && value !== 1) throw new Error("Invalid Borsh boolean.");
        return value === 1;
    }
    string() {
        const length = this.u32();
        if (length > 4096) throw new Error("On-chain event string exceeds the 4 KiB limit.");
        return new TextDecoder("utf-8", { fatal: true }).decode(this.take(length));
    }
    pubkey() { return base58Encode(this.take(32)); }
    shareholders() {
        const count = this.u32();
        if (count > 1000) throw new Error("Unreasonable shareholder vector length.");
        return Array.from({ length: count }, () => ({
            address: this.pubkey(),
            shareBps: this.u16(),
        }));
    }
    get remaining() { return this.bytes.length - this.offset; }
}

function decodeBase64(value) {
    if (typeof value !== "string" || value.length > 100000)
        throw new Error("Invalid or oversized base64 event.");
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function startsWith(bytes, prefix) {
    return bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);
}

export function decodeCreateEvent(encoded) {
    const raw = decodeBase64(encoded);
    if (!startsWith(raw, CREATE_EVENT)) return null;
    const r = new Reader(raw.slice(8));
    const event = {
        name: r.string(),
        symbol: r.string(),
        uri: r.string(),
        mint: r.pubkey(),
        bondingCurve: r.pubkey(),
        user: r.pubkey(),
        creator: r.pubkey(),
        timestamp: r.i64(),
        virtualTokenReserves: r.u64(),
        virtualSolReserves: r.u64(),
        realTokenReserves: r.u64(),
        tokenTotalSupply: r.u64(),
        tokenProgram: r.pubkey(),
        isMayhemMode: r.bool(),
        isCashbackEnabled: r.bool(),
        quoteMint: r.pubkey(),
        virtualQuoteReserves: r.u64(),
        creatorFeeBps: r.u64(),
        isHolderReward: r.bool(),
        depth: r.u8(),
    };
    if (r.remaining !== 0) throw new Error("Unexpected trailing bytes in Pump.fun CreateEvent.");
    return event;
}

export function decodeTradeEvent(encoded) {
    const raw = decodeBase64(encoded);
    if (!startsWith(raw, TRADE_EVENT)) return null;
    const r = new Reader(raw.slice(8));
    const event = {
        mint: r.pubkey(),
        solAmount: r.u64(),
        tokenAmount: r.u64(),
        isBuy: r.bool(),
        user: r.pubkey(),
        timestamp: r.i64(),
        virtualSolReserves: r.u64(),
        virtualTokenReserves: r.u64(),
        realSolReserves: r.u64(),
        realTokenReserves: r.u64(),
        feeRecipient: r.pubkey(),
        feeBasisPoints: r.u64(),
        fee: r.u64(),
        creator: r.pubkey(),
        creatorFeeBasisPoints: r.u64(),
        creatorFee: r.u64(),
        trackVolume: r.bool(),
        totalUnclaimedTokens: r.u64(),
        totalClaimedTokens: r.u64(),
        currentSolVolume: r.u64(),
        lastUpdateTimestamp: r.i64(),
        instructionName: r.string(),
        mayhemMode: r.bool(),
        cashbackFeeBasisPoints: r.u64(),
        cashback: r.u64(),
        buybackFeeBasisPoints: r.u64(),
        buybackFee: r.u64(),
        shareholders: r.shareholders(),
        quoteMint: r.pubkey(),
        quoteAmount: r.u64(),
        virtualQuoteReserves: r.u64(),
        realQuoteReserves: r.u64(),
        holderRewardsBps: r.u64(),
        holderRewards: r.u64(),
        creatorFeeUnclaimed: r.u64(),
    };
    // Some deployed events append undocumented bytes. Keep them opaque.
    event.unparsedTrailingBytesLength = r.remaining;
    return event;
}

export function decodePumpSwapEvent(encoded) {
    const raw = decodeBase64(encoded);
    const discriminator = raw.slice(0, 8);
    if (![SWAP_CREATE_POOL_EVENT, SWAP_BUY_EVENT, SWAP_SELL_EVENT].some((d) => startsWith(discriminator, d)))
        return null;
    const r = new Reader(raw.slice(8));
    let kind;
    let event;
    if (startsWith(discriminator, SWAP_CREATE_POOL_EVENT)) {
        kind = "pool_created";
        event = {
            timestamp: r.i64(),
            index: r.u16(),
            creator: r.pubkey(),
            baseMint: r.pubkey(),
            quoteMint: r.pubkey(),
            baseMintDecimals: r.u8(),
            quoteMintDecimals: r.u8(),
            baseAmountIn: r.u64(),
            quoteAmountIn: r.u64(),
            poolBaseAmount: r.u64(),
            poolQuoteAmount: r.u64(),
            minimumLiquidity: r.u64(),
            initialLiquidity: r.u64(),
            lpTokenAmountOut: r.u64(),
            poolBump: r.u8(),
            pool: r.pubkey(),
            lpMint: r.pubkey(),
            userBaseTokenAccount: r.pubkey(),
            userQuoteTokenAccount: r.pubkey(),
            coinCreator: r.pubkey(),
            isMayhemMode: r.bool(),
            creatorFeeBps: r.u64(),
            canEditCreatorFee: r.bool(),
            isHolderReward: r.bool(),
        };
    } else if (startsWith(discriminator, SWAP_BUY_EVENT)) {
        kind = "trade_buy";
        event = {
            timestamp: r.i64(),
            baseAmountOut: r.u64(),
            maxQuoteAmountIn: r.u64(),
            userBaseTokenReserves: r.u64(),
            userQuoteTokenReserves: r.u64(),
            poolBaseTokenReserves: r.u64(),
            poolQuoteTokenReserves: r.u64(),
            quoteAmountIn: r.u64(),
            lpFeeBasisPoints: r.u64(),
            lpFee: r.u64(),
            protocolFeeBasisPoints: r.u64(),
            protocolFee: r.u64(),
            quoteAmountInWithLpFee: r.u64(),
            userQuoteAmountIn: r.u64(),
            pool: r.pubkey(),
            user: r.pubkey(),
            userBaseTokenAccount: r.pubkey(),
            userQuoteTokenAccount: r.pubkey(),
            protocolFeeRecipient: r.pubkey(),
            protocolFeeRecipientTokenAccount: r.pubkey(),
            coinCreator: r.pubkey(),
            coinCreatorFeeBasisPoints: r.u64(),
            coinCreatorFee: r.u64(),
            trackVolume: r.bool(),
            totalUnclaimedTokens: r.u64(),
            totalClaimedTokens: r.u64(),
            currentSolVolume: r.u64(),
            lastUpdateTimestamp: r.i64(),
            minBaseAmountOut: r.u64(),
            instructionName: r.string(),
            cashbackFeeBasisPoints: r.u64(),
            cashback: r.u64(),
            buybackFeeBasisPoints: r.u64(),
            buybackFee: r.u64(),
            virtualQuoteReserves: r.i128(),
            canBoost: r.bool(),
            baseSupply: r.u64(),
            holderRewardsBps: r.u64(),
            holderRewards: r.u64(),
            creatorFeeUnclaimed: r.u64(),
        };
    } else {
        kind = "trade_sell";
        event = {
            timestamp: r.i64(),
            baseAmountIn: r.u64(),
            minQuoteAmountOut: r.u64(),
            userBaseTokenReserves: r.u64(),
            userQuoteTokenReserves: r.u64(),
            poolBaseTokenReserves: r.u64(),
            poolQuoteTokenReserves: r.u64(),
            quoteAmountOut: r.u64(),
            lpFeeBasisPoints: r.u64(),
            lpFee: r.u64(),
            protocolFeeBasisPoints: r.u64(),
            protocolFee: r.u64(),
            quoteAmountOutWithoutLpFee: r.u64(),
            userQuoteAmountOut: r.u64(),
            pool: r.pubkey(),
            user: r.pubkey(),
            userBaseTokenAccount: r.pubkey(),
            userQuoteTokenAccount: r.pubkey(),
            protocolFeeRecipient: r.pubkey(),
            protocolFeeRecipientTokenAccount: r.pubkey(),
            coinCreator: r.pubkey(),
            coinCreatorFeeBasisPoints: r.u64(),
            coinCreatorFee: r.u64(),
            cashbackFeeBasisPoints: r.u64(),
            cashback: r.u64(),
            buybackFeeBasisPoints: r.u64(),
            buybackFee: r.u64(),
            virtualQuoteReserves: r.i128(),
            canBoost: r.bool(),
            baseSupply: r.u64(),
            holderRewardsBps: r.u64(),
            holderRewards: r.u64(),
            creatorFeeUnclaimed: r.u64(),
        };
    }
    event.unparsedTrailingBytesLength = r.remaining;
    return { kind, event };
}

function programDataLines(logMessages, programId) {
    const logs = Array.isArray(logMessages) ? logMessages : [];
    const hasInvocations = logs.some((line) => line.startsWith("Program ") && line.includes(" invoke ["));
    const stack = [];
    const output = [];
    for (let index = 0; index < logs.length; index += 1) {
        const line = logs[index];
        if (line.startsWith("Program ") && line.includes(" invoke [")) {
            stack.push(line.slice("Program ".length).split(" invoke [", 1)[0]);
            continue;
        }
        if (line.startsWith("Program ") && (line.endsWith(" success") || line.includes(" failed:"))) {
            const finished = line.slice("Program ".length).split(" ", 1)[0];
            if (stack.at(-1) === finished) stack.pop();
            else if (stack.includes(finished)) stack.splice(stack.lastIndexOf(finished));
            continue;
        }
        if (line.startsWith("Program data: ") && (!hasInvocations || stack.at(-1) === programId))
            output.push({ logIndex: index, encoded: line.slice("Program data: ".length).trim() });
    }
    return output;
}

async function scanProgramEvents(programId, limit, decoder) {
    const signatures = await rpcCall("getSignaturesForAddress", [
        programId, { limit, commitment: "confirmed" },
    ]);
    const entries = Array.isArray(signatures) ? signatures : [];
    const valid = entries.filter((entry) => entry?.signature && entry.err == null);
    const transactions = await Promise.all(valid.map(async (entry) => ({
        signature: entry.signature,
        tx: await rpcCall("getTransaction", [
            entry.signature,
            { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 1 },
        ]),
    })));
    const events = [];
    let missingTransactions = 0;
    let unparsedEvents = 0;
    for (const { signature, tx } of transactions) {
        if (!tx) { missingTransactions += 1; continue; }
        if (tx.meta?.err != null) continue;
        for (const { logIndex, encoded } of programDataLines(tx.meta?.logMessages, programId)) {
            try {
                const decoded = decoder(encoded);
                if (decoded) {
                    events.push({
                        signature,
                        slot: tx.slot ?? null,
                        blockTime: tx.blockTime ?? null,
                        logIndex,
                        ...decoded,
                    });
                }
            } catch (error) {
                unparsedEvents += 1;
                events.push({
                    signature,
                    slot: tx.slot ?? null,
                    blockTime: tx.blockTime ?? null,
                    logIndex,
                    kind: "unparsed_event",
                    confidence: "unverified",
                    error: String(error?.message ?? error).slice(0, 160),
                });
            }
        }
    }
    return {
        signaturesReturned: entries.length,
        transactionsFetched: transactions.length - missingTransactions,
        missingTransactions,
        unparsedEvents,
        events,
    };
}

async function getMintAccount(mint) {
    const [accountResponse, supplyResponse] = await Promise.all([
        rpcCall("getAccountInfo", [mint, { encoding: "base64", commitment: "confirmed" }]),
        rpcCall("getTokenSupply", [mint, { commitment: "confirmed" }]),
    ]);
    const account = accountResponse?.value;
    if (!account) return { found: false, mint };
    const encoded = account.data?.[0];
    if (typeof encoded !== "string") throw new Error("Mint account did not return base64 data.");
    const data = decodeBase64(encoded);
    if (data.length < 82) throw new Error("Account data is shorter than the SPL Mint layout.");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const mintAuthorityOption = view.getUint32(0, true);
    const supplyRaw = view.getBigUint64(36, true);
    const decimals = data[44];
    const initialized = data[45] === 1;
    const freezeAuthorityOption = view.getUint32(46, true);
    return {
        found: true,
        mint,
        ownerProgram: account.owner ?? null,
        lamports: account.lamports ?? null,
        contextSlot: accountResponse.context?.slot ?? null,
        mintAuthority: mintAuthorityOption === 1 ? base58Encode(data.slice(4, 36)) : null,
        freezeAuthority: freezeAuthorityOption === 1 ? base58Encode(data.slice(50, 82)) : null,
        supplyRaw: supplyRaw.toString(),
        decimals,
        initialized,
        tokenSupply: supplyResponse?.value ?? null,
        extensionBytesLength: Math.max(0, data.length - 82),
        source: "Solana mainnet public RPC",
    };
}

export const solanaTools = [
    [
        "get_token_mint_info",
        "Inspect an SPL/Token-2022 mint account: owner program, decimals, raw supply, mint authority, freeze authority and initialization. Does not provide market cap or price.",
        z.object({ mint: mintSchema }),
        async ({ mint }) => getMintAccount(mint),
    ],
    [
        "get_token_largest_accounts",
        "Get Solana's top-20 token accounts for a mint. These are token accounts, not unique wallet holders; pool vaults and custodial accounts may appear.",
        z.object({ mint: mintSchema }),
        async ({ mint }) => {
            const result = await rpcCall("getTokenLargestAccounts", [mint, { commitment: "confirmed" }]);
            const values = Array.isArray(result?.value) ? result.value : [];
            return {
                mint,
                contextSlot: result?.context?.slot ?? null,
                accounts: values.map((item) => ({
                    address: item.address,
                    amountRaw: item.amount,
                    decimals: item.decimals,
                    uiAmountString: item.uiAmountString ?? null,
                })),
                count: values.length,
                note: "Largest token accounts are not a unique-holder count.",
            };
        },
    ],
    [
        "get_token_activity",
        "Inspect recent transactions that reference a Solana mint and decode matching Pump.fun TradeEvents when present. Signature sampling is bounded and is not complete historical activity.",
        z.object({ mint: mintSchema, limit: limitSchema }),
        async ({ mint, limit }) => {
            const signatures = await rpcCall("getSignaturesForAddress", [
                mint, { limit, commitment: "confirmed" },
            ]);
            const entries = Array.isArray(signatures) ? signatures : [];
            const valid = entries.filter((entry) => entry?.signature && entry.err == null);
            const transactions = await Promise.all(valid.map(async (entry) => ({
                entry,
                tx: await rpcCall("getTransaction", [
                    entry.signature,
                    { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 1 },
                ]),
            })));
            const trades = [];
            let missingTransactions = 0;
            for (const { entry, tx } of transactions) {
                if (!tx) { missingTransactions += 1; continue; }
                for (const { logIndex, encoded } of programDataLines(tx.meta?.logMessages, PUMP_FUN_PROGRAM_ID)) {
                    try {
                        const event = decodeTradeEvent(encoded);
                        if (event?.mint === mint)
                            trades.push({
                                signature: entry.signature,
                                slot: tx.slot ?? null,
                                blockTime: tx.blockTime ?? null,
                                logIndex,
                                ...event,
                            });
                    } catch {
                        // Unknown event layouts are omitted, never guessed.
                    }
                }
            }
            return {
                mint,
                signaturesReturned: entries.length,
                transactionsFetched: transactions.length - missingTransactions,
                missingTransactions,
                signatures: entries.map((entry) => ({
                    signature: entry.signature,
                    slot: entry.slot,
                    blockTime: entry.blockTime ?? null,
                    confirmationStatus: entry.confirmationStatus ?? null,
                    failed: entry.err != null,
                })),
                pumpfunTrades: trades,
                source: "Solana mainnet public RPC + official Pump.fun event discriminator/layout",
            };
        },
    ],
    [
        "get_recent_pumpfun_launches",
        "Scan a small recent window of Pump.fun program transactions and decode official CreateEvent records. This is a bounded recent sample, not a complete launch archive.",
        z.object({ limit: limitSchema }),
        async ({ limit }) => {
            const result = await scanProgramEvents(PUMP_FUN_PROGRAM_ID, limit, (encoded) => {
                const event = decodeCreateEvent(encoded);
                return event ? { kind: "token_created", confidence: "observed", event } : null;
            });
            return { programId: PUMP_FUN_PROGRAM_ID, ...result, source: "Solana mainnet public RPC + official Pump.fun IDL" };
        },
    ],
    [
        "get_recent_pumpfun_trades",
        "Scan a small recent window of Pump.fun program transactions and decode official TradeEvent fields. Unknown trailing bytes are preserved as a length only, never interpreted.",
        z.object({ limit: limitSchema }),
        async ({ limit }) => {
            const result = await scanProgramEvents(PUMP_FUN_PROGRAM_ID, limit, (encoded) => {
                const event = decodeTradeEvent(encoded);
                return event ? { kind: event.isBuy ? "trade_buy" : "trade_sell", confidence: "observed", event } : null;
            });
            return { programId: PUMP_FUN_PROGRAM_ID, ...result, source: "Solana mainnet public RPC + official Pump.fun IDL" };
        },
    ],
    [
        "get_recent_pumpswap_events",
        "Scan a small recent window of PumpSwap program transactions and decode pool creation and buy/sell events. Unknown trailing bytes remain opaque; trade events expose pool IDs and raw token amounts, not USD prices.",
        z.object({ limit: limitSchema }),
        async ({ limit }) => {
            const result = await scanProgramEvents(PUMP_SWAP_PROGRAM_ID, limit, (encoded) => {
                const decoded = decodePumpSwapEvent(encoded);
                return decoded ? { kind: decoded.kind, confidence: "observed", event: decoded.event } : null;
            });
            return { programId: PUMP_SWAP_PROGRAM_ID, ...result, source: "Solana mainnet public RPC + official PumpSwap IDL" };
        },
    ],
];
