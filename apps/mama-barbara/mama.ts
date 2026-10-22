// Mama Barbara: the Telegram bot that sets up a Barbara for anyone. She signs
// the user in to Pollinations (device sign-in), has Telegram create a bot the
// user owns (managed bots), and starts the kit next door in a sandbox on the
// user's account. A fixed program, not an agent: she holds every user's key.
//
// The bot needs Bot Management Mode, switched on in BotFather's Mini App. She
// runs as a Worker (index.ts) and keeps her users in its Durable Object.

import { runInBox } from "./envd.ts";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");

const ENTER = "https://enter.pollinations.ai";
const GEN = "https://gen.pollinations.ai";
// `keys` lets gen give each new box a key of its own (see logIn in
// gen.pollinations.ai/src/routes/e2b.ts); `machines` creates the boxes.
const SCOPE = "generate machines keys";
const TEMPLATE = process.env.MAMA_TEMPLATE ?? "pollinations";
// E2B's largest timeout: gen keeps the box running and bills the key.
const KEEP_SECONDS = 2 ** 31 - 1;
// What a new Barbara's key may spend, and the amounts her settings offer.
const BUDGET = 10;
const BUDGETS = [5, 10, 25, 50];
// The commit whose kit new Barbaras get; CI deploys with its own.
const KIT_REF = process.env.KIT_REF || "main";

type Barbara = { bot: string; botId: number; box: string; created: string };
type User = {
    key?: string;
    barbaras: Barbara[];
    // What Mama waits for after a settings button: a name, a photo or people.
    asking?: { kind: "name" | "photo" | "people"; botId: number };
    // A bot whose setup failed before her box existed, for Try again.
    unfinished?: TgUser;
    // The Create my Barbara message, until her bot arrives.
    botLink?: number;
};
type TgUser = { id: number; first_name: string; username?: string };

let storage: DurableObjectStorage;
let state: Record<string, User> = {};
export async function load(from: DurableObjectStorage) {
    storage = from;
    state = (await storage.get("users")) ?? {};
}
// The Durable Object holds back replies until the write is stored.
const save = () => storage.put("users", state);
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const userOf = (id: number) => (state[id] ??= { barbaras: [] });

// Bots created before their owner finished signing in.
const waitingBots = new Map<number, TgUser>();
const signingIn = new Set<number>();

async function tg<T = unknown>(
    method: string,
    params: object = {},
    token = TOKEN,
) {
    const res = await fetch(
        `https://api.telegram.org/bot${token}/${method}`,
        params instanceof FormData
            ? { method: "POST", body: params }
            : {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(params),
              },
    );
    const body = (await res.json()) as {
        ok: boolean;
        result: T;
        description?: string;
    };
    if (!body.ok) throw new Error(`${method}: ${body.description}`);
    return body.result;
}

const say = (chatId: number, text: string, extra: object = {}) =>
    tg("sendMessage", { chat_id: chatId, text, ...extra });

let me: TgUser | undefined;
async function myUsername() {
    me ??= await tg<TgUser>("getMe");
    return me.username;
}

const MENU = {
    reply_markup: {
        keyboard: [[{ text: "New Barbara" }, { text: "My Barbaras" }]],
        resize_keyboard: true,
    },
};

async function gen<T>(
    key: string,
    path: string,
    init: { method?: string; body?: object } = {},
) {
    const res = await fetch(`${GEN}${path}`, {
        method: init.method ?? "GET",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: init.body && JSON.stringify(init.body),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 300)}`);
    return (body ? JSON.parse(body) : undefined) as T;
}

// Device sign-in (RFC 8628), as `polli auth login` does it.
async function signIn(from: TgUser) {
    if (signingIn.has(from.id)) return;
    signingIn.add(from.id);
    try {
        const code = await fetch(`${ENTER}/api/device/code`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ scope: SCOPE }),
        }).then(
            (r) =>
                r.json() as Promise<{
                    device_code: string;
                    verification_uri_complete: string;
                    interval: number;
                    expires_in: number;
                }>,
        );
        await say(
            from.id,
            "Sign in to Pollinations. Your Barbaras run on your account and use your Pollen. On the next page, clear the expiry: your Barbaras stop when my access ends.",
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "Sign in with Pollinations",
                                url: code.verification_uri_complete,
                            },
                        ],
                    ],
                },
            },
        );
        let wait = code.interval;
        const until = Date.now() + code.expires_in * 1000;
        while (Date.now() < until) {
            await sleep(wait * 1000);
            const token = await fetch(`${ENTER}/api/device/token`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    device_code: code.device_code,
                    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                }),
            }).then(
                (r) =>
                    r.json() as Promise<{
                        access_token?: string;
                        error?: string;
                    }>,
            );
            if (token.access_token) {
                const user = userOf(from.id);
                user.key = token.access_token;
                save();
                const bot = waitingBots.get(from.id);
                waitingBots.delete(from.id);
                if (bot) return setUp(from, bot);
                return user.barbaras.length ? moveBoxes(from) : askForBot(from);
            }
            if (token.error === "slow_down") wait += 5;
            else if (token.error !== "authorization_pending") break;
        }
        await say(
            from.id,
            "The sign-in didn't finish. Tap New Barbara to try again.",
            MENU,
        );
    } finally {
        signingIn.delete(from.id);
    }
}

// Gen renews a kept box on the key that last set its timeout, so after a new
// sign-in, setting it again moves every box over to the new key.
async function moveBoxes(from: TgUser) {
    const { key, barbaras } = userOf(from.id);
    if (!key) return;
    const results = await Promise.allSettled(
        barbaras.map((b) =>
            gen(key, `/alpha/e2b/sandboxes/${b.box}/timeout`, {
                method: "POST",
                body: { timeout: KEEP_SECONDS },
            }),
        ),
    );
    const failed = barbaras.filter((b, i) => {
        const result = results[i];
        if (result.status === "fulfilled") return false;
        console.error(`moveBoxes @${b.bot}:`, result.reason);
        return true;
    });
    const { expiresAt } = await gen<{ expiresAt: string | null }>(
        key,
        "/account/key",
    );
    const ends = expiresAt ? `until ${when(expiresAt)}` : "with no end date";
    const missed = failed.length
        ? `\nCouldn't move ${failed.map((b) => `@${b.bot}`).join(", ")}.`
        : "";
    return say(
        from.id,
        `Signed in again. Your Barbaras now run on this sign-in, ${ends}.${missed}`,
        MENU,
    );
}

// Telegram's own dialog creates the bot from this link; the user owns it and
// we manage it. A link under the message, unlike a keyboard button, can't be
// hidden.
const ASK_FOR_BOT =
    "Tap Create my Barbara: Telegram asks you for her name and username.";
// Telegram doesn't tell Mama when it refuses to create a bot; its dialog just
// spins. Usually that's its limit on new bots per account.
const NO_BOT_YET =
    "\n\nNo bot yet. If Telegram's Create keeps spinning, it's limiting how many bots your account can make right now. That can last up to a day; send /new again later.";

const askForBot = async (from: TgUser) => {
    // Usernames are Latin letters, digits and _, starting with a letter.
    const name = (from.username ?? from.first_name)
        .replace(/\W/g, "")
        .slice(0, 16);
    const username = /^[a-z]/i.test(name)
        ? `${name}_barbara_bot`
        : `barbara_${from.id}_bot`;
    const reply_markup = {
        inline_keyboard: [
            [
                {
                    text: "Create my Barbara",
                    url: `https://t.me/newbot/${await myUsername()}/${username}?name=Barbara`,
                },
            ],
        ],
    };
    const sent = await tg<{ message_id: number }>("sendMessage", {
        chat_id: from.id,
        text: ASK_FOR_BOT,
        reply_markup,
    });
    const user = userOf(from.id);
    user.botLink = sent.message_id;
    save();
    await sleep(2 * 60 * 1000);
    if (user.botLink !== sent.message_id) return;
    await tg("editMessageText", {
        chat_id: from.id,
        message_id: sent.message_id,
        text: ASK_FOR_BOT + NO_BOT_YET,
        reply_markup,
    });
};

// Her kit, apps/mama-barbara/barbara at KIT_REF: setup.sh, start.sh, the bridge and
// AGENTS.md.
const SETUP = `set -euo pipefail
git clone --quiet --depth 1 --filter=blob:none --no-checkout --sparse https://github.com/pollinations/pollinations ~/kit
cd ~/kit
git sparse-checkout set apps/mama-barbara/barbara
git fetch --quiet --depth 1 origin "$REF"
git checkout --quiet FETCH_HEAD
mkdir -p ~/agent && cp -r apps/mama-barbara/barbara/. ~/agent/
cd ~/agent && rm -rf ~/kit
printf 'TELEGRAM_BOT_TOKEN=%s\\nOWNER_IDS=%s\\n' "$BOT_TOKEN" "$OWNER" > .env
chmod 600 .env
bash setup.sh
bash start.sh`;

const SETTING_UP =
    "I'm being set up, which takes about two minutes. Tap Start now and I'll answer as soon as I'm ready.";
const READY =
    "Your own assistant on Pollinations. Ask me anything, or have me connect Gmail, Calendar, GitHub and other apps.";

async function setUp(owner: TgUser, bot: TgUser) {
    const user = userOf(owner.id);
    delete user.botLink;
    if (user.barbaras.some((b) => b.botId === bot.id)) return;
    if (!user.key) {
        waitingBots.set(owner.id, bot);
        return signIn(owner);
    }
    await say(
        owner.id,
        `Setting up @${bot.username}. This takes about two minutes, and I'll tell you when she's ready.`,
    );
    try {
        const token = await botToken(bot.id);
        await tg("setManagedBotAccessSettings", {
            user_id: bot.id,
            is_access_restricted: true,
        });
        // Telegram opens her chat right away; its empty state shows this.
        await tg("setMyDescription", { description: SETTING_UP }, token);
        const box = await gen<{
            sandboxID: string;
            domain?: string;
            envdAccessToken?: string;
        }>(user.key, "/alpha/e2b/sandboxes", {
            method: "POST",
            body: {
                templateID: TEMPLATE,
                timeout: KEEP_SECONDS,
                autoPause: true,
                metadata: { name: `barbara-${bot.username}` },
            },
        });
        const b = {
            bot: bot.username ?? "",
            botId: bot.id,
            box: box.sandboxID,
            created: new Date().toISOString(),
        };
        user.barbaras.push(b);
        delete user.unfinished;
        save();
        await setBudget(user.key, b, BUDGET);
        await runInBox(box, SETUP, {
            REF: KIT_REF,
            BOT_TOKEN: token,
            OWNER: String(owner.id),
        });
        await tg("setMyDescription", { description: READY }, token);
        await say(
            owner.id,
            `${bot.first_name} is ready: @${bot.username}\nShe can spend ${BUDGET} Pollen. Change that under Settings.`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: "💬 Say hi",
                                url: `https://t.me/${bot.username}`,
                                style: "success",
                            },
                            {
                                text: "⚙️ Settings",
                                callback_data: `open:${bot.id}`,
                            },
                        ],
                    ],
                },
            },
        );
    } catch (error) {
        console.error(`setUp @${bot.username}:`, error);
        const early = !user.barbaras.some((b) => b.botId === bot.id);
        if (early) {
            user.unfinished = bot;
            save();
        }
        await say(
            owner.id,
            `Setting up @${bot.username} failed: ${error instanceof Error ? error.message : error}`,
            early
                ? {
                      reply_markup: {
                          inline_keyboard: [
                              [
                                  {
                                      text: "🔁 Try again",
                                      callback_data: `retry:${bot.id}`,
                                  },
                              ],
                          ],
                      },
                  }
                : MENU,
        );
    }
}

type Key = {
    id: string;
    name: string;
    pollenBalance: number | null;
    lastRequest: string | null;
};
type Box = {
    sandboxID: string;
    state: string;
    domain?: string;
    envdAccessToken?: string;
};
type Access = { is_access_restricted: boolean; added_users?: TgUser[] };
type View = { text: string; reply_markup?: object };

const when = (iso: string) =>
    `${new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC`;

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STATES: Record<string, string> = {
    running: "🟢 Running",
    paused: "⏸️ Paused",
    deleted: "⚫ Box deleted",
};

// Mama acts as each Barbara for her name and photo, with the token Telegram
// hands the managing bot.
const botTokens = new Map<number, string>();
async function botToken(botId: number) {
    let token = botTokens.get(botId);
    if (!token) {
        token = await tg<string>("getManagedBotToken", { user_id: botId });
        botTokens.set(botId, token);
    }
    return token;
}

const nameOf = async (b: Barbara) =>
    (await tg<{ name: string }>("getMyName", {}, await botToken(b.botId))).name;

const boxOf = (key: string, b: Barbara) =>
    gen<Box>(key, `/alpha/e2b/sandboxes/${b.box}`).catch(() => ({
        sandboxID: b.box,
        state: "deleted",
    }));

const accessOf = (b: Barbara) =>
    tg<Access>("getManagedBotAccessSettings", { user_id: b.botId });

// Each box's key is the one gen made for it, named after the box. Its budget
// is what it may still spend.
const keyOf = (keys: Key[], b: Barbara) =>
    keys.find((k) => k.name === `polli-sandbox-${b.box}`);

const keysOf = async (key: string) =>
    (await gen<{ data: Key[] }>(key, "/account/keys")).data;

const budgetText = (k?: Key) =>
    k?.pollenBalance == null
        ? "no budget limit"
        : `${Math.round(k.pollenBalance * 100) / 100} Pollen left`;

async function setBudget(key: string, b: Barbara, pollen: number | null) {
    const k = keyOf(await keysOf(key), b);
    if (!k) throw new Error(`no key for her box ${b.box}`);
    await gen(key, `/account/keys/${k.id}`, {
        method: "PATCH",
        body: { pollenBudget: pollen },
    });
}

// Shows a view as a new message, or in place of the message whose button was
// tapped.
async function show(chatId: number, view: View, messageId?: number) {
    const extra = { parse_mode: "HTML", reply_markup: view.reply_markup };
    if (!messageId) return say(chatId, view.text, extra);
    await tg("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: view.text,
        ...extra,
    }).catch((error) => {
        if (!String(error).includes("not modified")) throw error;
    });
}

async function listView(owner: TgUser): Promise<View> {
    const { key, barbaras } = userOf(owner.id);
    if (!key) return { text: "Sign in first: /signin" };
    const [keys, mine] = await Promise.all([
        keysOf(key),
        gen<{ expiresAt: string | null }>(key, "/account/key"),
    ]);
    const rows = await Promise.all(
        barbaras.map(async (b) => {
            const [name, box] = await Promise.all([
                nameOf(b).catch(() => b.bot),
                boxOf(key, b),
            ]);
            const boxKey = keyOf(keys, b);
            const active = boxKey?.lastRequest
                ? ` · last active ${when(boxKey.lastRequest)}`
                : "";
            return {
                text: `<b>${escapeHtml(name)}</b> @${b.bot}\n${STATES[box.state] ?? box.state} · ${budgetText(boxKey)}${active}`,
                button: [
                    {
                        text: `⚙️ ${name} (@${b.bot})`,
                        callback_data: `open:${b.botId}`,
                    },
                ],
            };
        }),
    );
    const expiry = mine.expiresAt
        ? `\n\nMy access to your account ends ${when(mine.expiresAt)}. Your Barbaras stop then. Send /signin to renew it.`
        : "";
    return {
        text: rows.map((r) => r.text).join("\n\n") + expiry,
        reply_markup: { inline_keyboard: rows.map((r) => r.button) },
    };
}

async function list(owner: TgUser) {
    if (!userOf(owner.id).barbaras.length)
        return say(
            owner.id,
            "You have no Barbaras yet. Tap New Barbara.",
            MENU,
        );
    return show(owner.id, await listView(owner));
}

async function cardView(owner: TgUser, b: Barbara): Promise<View> {
    const key = userOf(owner.id).key;
    const [name, access, box, keys] = await Promise.all([
        nameOf(b),
        accessOf(b),
        key ? boxOf(key, b) : { state: "" },
        key ? keysOf(key) : [],
    ]);
    const people = access.added_users ?? [];
    const boxKey = keyOf(keys, b);
    return {
        text: [
            `<b>${escapeHtml(name)}</b> · @${b.bot}`,
            STATES[box.state] ?? box.state,
            "",
            "<b>Budget</b>",
            `${budgetText(boxKey)}${boxKey?.lastRequest ? ` · last active ${when(boxKey.lastRequest)}` : ""}`,
            "",
            "<b>Who can talk to her</b>",
            ["You", ...people.map((u) => escapeHtml(u.first_name))].join(", "),
            "",
            "<b>Groups</b>",
            "Any group you're in. There she answers when someone mentions her or replies to her, and uses your apps only for the people above.",
        ].join("\n"),
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✏️ Rename", callback_data: `name:${b.botId}` },
                    { text: "🖼️ Photo", callback_data: `photo:${b.botId}` },
                    { text: "💰 Budget", callback_data: `budget:${b.botId}` },
                ],
                ...(people.length < 10
                    ? [
                          [
                              {
                                  text: "➕ Add people",
                                  callback_data: `people:${b.botId}`,
                                  style: "primary",
                              },
                          ],
                      ]
                    : []),
                ...people.map((u) => [
                    {
                        text: `Remove ${u.first_name}`,
                        callback_data: `remove:${b.botId}:${u.id}`,
                        style: "danger",
                    },
                ]),
                [
                    {
                        text: "👥 Add her to a group",
                        url: `https://t.me/${b.bot}?startgroup=true`,
                    },
                ],
                [
                    box.state === "paused"
                        ? {
                              text: "▶️ Resume",
                              callback_data: `resume:${b.botId}`,
                              style: "success",
                          }
                        : {
                              text: "⏸️ Pause",
                              callback_data: `pause:${b.botId}`,
                          },
                    {
                        text: "🗑️ Delete",
                        callback_data: `delete:${b.botId}`,
                        style: "danger",
                    },
                ],
                [
                    { text: "💬 Open chat", url: `https://t.me/${b.bot}` },
                    { text: "‹ All Barbaras", callback_data: "list" },
                ],
            ],
        },
    };
}

const pauseView = (b: Barbara): View => ({
    text: `<b>Pause @${b.bot}?</b>\nHer box stops and costs nothing until you resume her. She doesn't answer meanwhile; messages sent to her wait up to a day.`,
    reply_markup: {
        inline_keyboard: [
            [
                { text: "⏸️ Pause her", callback_data: `paused:${b.botId}` },
                { text: "‹ Back", callback_data: `open:${b.botId}` },
            ],
        ],
    },
});

const deleteView = (b: Barbara): View => ({
    text: `<b>Delete @${b.bot}?</b>\nHer box goes away with everything in it: her memory, files and setup. Her key is revoked. Apps you connected stay on your Pollinations account.`,
    reply_markup: {
        inline_keyboard: [
            [
                {
                    text: "🗑️ Delete her",
                    callback_data: `deleted:${b.botId}`,
                    style: "danger",
                },
                { text: "‹ Back", callback_data: `open:${b.botId}` },
            ],
        ],
    },
});

// Deletes her box and revokes its key; the bot stays the owner's.
async function deleteBarbara(owner: TgUser, b: Barbara, key: string) {
    const boxKey = keyOf(await keysOf(key), b);
    await gen(key, `/alpha/e2b/sandboxes/${b.box}`, {
        method: "DELETE",
    }).catch((error) => {
        if (!String(error).includes("404")) throw error;
    });
    if (boxKey)
        await gen(key, `/account/keys/${boxKey.id}`, { method: "DELETE" });
    const user = userOf(owner.id);
    user.barbaras = user.barbaras.filter((x) => x.botId !== b.botId);
    save();
}

async function budgetView(owner: TgUser, b: Barbara): Promise<View> {
    const key = userOf(owner.id).key;
    const boxKey = key ? keyOf(await keysOf(key), b) : undefined;
    return {
        text: [
            `<b>Budget for @${b.bot}</b>`,
            `She has ${budgetText(boxKey)}. Her models, images and other tools are paid from it. When it runs out, she stops answering until you raise it.`,
            "",
            "How much more may she spend?",
        ].join("\n"),
        reply_markup: {
            inline_keyboard: [
                BUDGETS.map((pollen) => ({
                    text: `${pollen} Pollen`,
                    callback_data: `setbudget:${b.botId}:${pollen}`,
                })),
                [
                    {
                        text: "No limit",
                        callback_data: `setbudget:${b.botId}:none`,
                    },
                    { text: "‹ Back", callback_data: `open:${b.botId}` },
                ],
            ],
        },
    };
}

const ALLOW = `python3 - "$ALLOW" <<'EOF'
import json, os, sys
path = os.path.expanduser("~/.claude/channels/telegram/access.json")
access = json.load(open(path))
access["allowFrom"] = sys.argv[1].split(",")
json.dump(access, open(path, "w"), indent=1)
EOF`;

// Who may talk to her is kept in two places: Telegram lets only these people
// reach the bot, and the bridge in her box drops everyone else.
async function setPeople(owner: TgUser, b: Barbara, ids: number[]) {
    const key = userOf(owner.id).key;
    if (!key) throw new Error("Sign in first: /signin");
    await tg("setManagedBotAccessSettings", {
        user_id: b.botId,
        is_access_restricted: true,
        added_user_ids: ids,
    });
    const box = await gen<Box>(key, `/alpha/e2b/sandboxes/${b.box}`);
    await runInBox(box, ALLOW, { ALLOW: [owner.id, ...ids].join(",") });
}

async function addPeople(owner: TgUser, b: Barbara, ids: number[]) {
    const current = (await accessOf(b)).added_users ?? [];
    const all = [...new Set([...current.map((u) => u.id), ...ids])];
    await setPeople(owner, b, all.slice(0, 10));
    await say(owner.id, `Done. They can talk to @${b.bot} now.`, MENU);
    return show(owner.id, await cardView(owner, b));
}

async function rename(owner: TgUser, b: Barbara, name: string) {
    await tg("setMyName", { name: name.slice(0, 64) }, await botToken(b.botId));
    await say(owner.id, `Done. She's called ${name} now.`, MENU);
    return show(owner.id, await cardView(owner, b));
}

// Telegram takes a profile photo only as a fresh upload, so Mama downloads the
// one she was sent and uploads it as the Barbara.
async function setPhoto(owner: TgUser, b: Barbara, fileId: string) {
    const file = await tg<{ file_path: string }>("getFile", {
        file_id: fileId,
    });
    const photo = await fetch(
        `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`,
    ).then((r) => r.blob());
    const form = new FormData();
    form.set(
        "photo",
        JSON.stringify({ type: "static", photo: "attach://file" }),
    );
    form.set("file", photo, "photo.jpg");
    await tg("setMyProfilePhoto", form, await botToken(b.botId));
    await say(owner.id, "Done. That's her photo now.", MENU);
    return show(owner.id, await cardView(owner, b));
}

const CANCEL = {
    reply_markup: {
        keyboard: [[{ text: "Cancel" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
    },
};

type Callback = {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number };
};

const ask = (owner: TgUser, asking: User["asking"]) => {
    userOf(owner.id).asking = asking;
    save();
};

async function onButton(q: Callback) {
    const owner = q.from;
    const [action, botId, arg] = (q.data ?? "").split(":");
    const messageId = q.message?.message_id;
    const b = userOf(owner.id).barbaras.find((x) => x.botId === Number(botId));
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    if (action === "list")
        return show(owner.id, await listView(owner), messageId);
    const unfinished = userOf(owner.id).unfinished;
    if (action === "retry" && unfinished?.id === Number(botId))
        return setUp(owner, unfinished);
    if (!b) return;
    if (action === "open")
        return show(owner.id, await cardView(owner, b), messageId);
    if (action === "name") {
        ask(owner, { kind: "name", botId: b.botId });
        return say(owner.id, `What should @${b.bot} be called?`, {
            reply_markup: {
                force_reply: true,
                input_field_placeholder: await nameOf(b),
            },
        });
    }
    if (action === "photo") {
        ask(owner, { kind: "photo", botId: b.botId });
        return say(owner.id, `Send me a photo for @${b.bot}.`, CANCEL);
    }
    if (action === "people") {
        const left = 10 - ((await accessOf(b)).added_users?.length ?? 0);
        ask(owner, { kind: "people", botId: b.botId });
        return say(
            owner.id,
            `Choose up to ${left} people who can talk to @${b.bot}. They can use everything she can, including your connected apps and your Pollen.`,
            {
                reply_markup: {
                    keyboard: [
                        [
                            {
                                text: "Choose people",
                                style: "primary",
                                request_users: {
                                    request_id: 1,
                                    user_is_bot: false,
                                    max_quantity: left,
                                },
                            },
                        ],
                        [{ text: "Cancel" }],
                    ],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            },
        );
    }
    if (action === "remove") {
        const rest = ((await accessOf(b)).added_users ?? [])
            .map((u) => u.id)
            .filter((id) => id !== Number(arg));
        await setPeople(owner, b, rest);
        return show(owner.id, await cardView(owner, b), messageId);
    }
    if (action === "budget")
        return show(owner.id, await budgetView(owner, b), messageId);
    const key = userOf(owner.id).key;
    if (action === "setbudget" && key) {
        await setBudget(key, b, arg === "none" ? null : Number(arg));
        return show(owner.id, await cardView(owner, b), messageId);
    }
    if (action === "pause") return show(owner.id, pauseView(b), messageId);
    if (action === "paused" && key) {
        await gen(key, `/alpha/e2b/sandboxes/${b.box}/pause`, {
            method: "POST",
        });
        return show(owner.id, await cardView(owner, b), messageId);
    }
    // Connect resumes a paused box, and a long timeout keeps it running.
    if (action === "resume" && key) {
        await gen(key, `/alpha/e2b/sandboxes/${b.box}/connect`, {
            method: "POST",
            body: { timeout: KEEP_SECONDS },
        });
        return show(owner.id, await cardView(owner, b), messageId);
    }
    if (action === "delete") return show(owner.id, deleteView(b), messageId);
    if (action === "deleted" && key) {
        await deleteBarbara(owner, b, key);
        return show(
            owner.id,
            {
                text: `@${b.bot} is deleted. Her bot still counts toward Telegram's 20 bots per account: delete it in @BotFather to free the slot.`,
                reply_markup: userOf(owner.id).barbaras.length
                    ? {
                          inline_keyboard: [
                              [
                                  {
                                      text: "‹ All Barbaras",
                                      callback_data: "list",
                                  },
                              ],
                          ],
                      }
                    : undefined,
            },
            messageId,
        );
    }
}

type Message = {
    chat: { id: number; type: string };
    from: TgUser;
    text?: string;
    photo?: { file_id: string }[];
    users_shared?: { users: { user_id: number }[] };
};

export type Update = {
    update_id: number;
    message?: Message;
    managed_bot?: { user: TgUser; bot: TgUser };
    callback_query?: Callback;
};

const COMMANDS = new Set(["New Barbara", "My Barbaras", "Cancel"]);

// The answer to a settings question; anything else drops the question.
async function answer(message: Message) {
    const from = message.from;
    const user = userOf(from.id);
    const { kind, botId } = user.asking ?? {};
    const b = user.barbaras.find((x) => x.botId === botId);
    if (!b) return false;
    ask(from, undefined);
    if (kind === "people" && message.users_shared) {
        await addPeople(
            from,
            b,
            message.users_shared.users.map((u) => u.user_id),
        );
        return true;
    }
    if (kind === "photo" && message.photo) {
        await setPhoto(
            from,
            b,
            message.photo[message.photo.length - 1].file_id,
        );
        return true;
    }
    const text = message.text ?? "";
    if (
        kind === "name" &&
        text &&
        !COMMANDS.has(text) &&
        !text.startsWith("/")
    ) {
        await rename(from, b, text);
        return true;
    }
    if (text === "Cancel") {
        await say(from.id, "OK, nothing changed.", MENU);
        return true;
    }
    return false;
}

async function handle(update: Update) {
    if (update.managed_bot)
        return setUp(update.managed_bot.user, update.managed_bot.bot);
    if (update.callback_query) return onButton(update.callback_query);
    const message = update.message;
    if (message?.chat.type !== "private") return;
    if (await answer(message)) return;
    // Service messages, such as "bot created", have no text.
    const text = message.text;
    if (!text) return;
    if (text === "My Barbaras" || text === "/list") return list(message.from);
    if (text === "/signin") return signIn(message.from);
    if (text === "New Barbara" || text === "/start" || text === "/new") {
        return userOf(message.from.id).key
            ? askForBot(message.from)
            : signIn(message.from);
    }
    return say(
        message.from.id,
        "I set up Barbaras: your own assistant on Telegram, running on your Pollinations account. Tap New Barbara to make one, or My Barbaras to see and change yours.",
        MENU,
    );
}

// Telegram checks this against the secret the webhook was set with
// (webhook.ts), derived from the token so there's no second secret.
export async function webhookSecret() {
    const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`webhook:${TOKEN}`),
    );
    return Buffer.from(hash).toString("hex");
}

export async function onUpdate(update: Update) {
    try {
        await handle(update);
    } catch (error) {
        console.error("update", update.update_id, error);
        const chat = update.message?.from.id ?? update.callback_query?.from.id;
        if (chat)
            await say(
                chat,
                `That didn't work: ${error instanceof Error ? error.message : error}`,
                MENU,
            ).catch(() => {});
    }
}
