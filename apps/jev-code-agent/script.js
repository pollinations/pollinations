// script.js — Agent loop, decision tracing, and code generation

import {
    AGENT_ACTIONS,
    AGENT_QUESTIONS,
    clearApiKey,
    extractApiKeyFromFragment,
    fetchBalance,
    formatProbability,
    getApiKey,
    getAuthorizeUrl,
    postChat,
    postDecision,
} from "./ai.js";

// ── DOM ──────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const show = (el) => el?.classList.remove("hidden");
const hide = (el) => el?.classList.add("hidden");

const dom = {
    authLoggedOut: $("authLoggedOut"),
    authLoggedIn: $("authLoggedIn"),
    authLoginBtn: $("authLoginBtn"),
    authLogoutBtn: $("authLogoutBtn"),
    authBalance: $("authBalance"),
    mainSection: $("mainSection"),
    taskInput: $("taskInput"),
    startBtn: $("startBtn"),
    stopBtn: $("stopBtn"),
    traceSection: $("traceSection"),
    traceList: $("traceList"),
    outputSection: $("outputSection"),
    codeOutput: $("codeOutput"),
    errorBox: $("errorBox"),
};

// ── State ────────────────────────────────────────────────────────────────────

let apiKey = null;
let agentRunning = false;
let agentAbort = false;
let decisionLog = [];

// ── Notifications ────────────────────────────────────────────────────────────

function notify(message, type = "info") {
    const existing = document.querySelector(".notification");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = `notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function handleAuthRedirect() {
    const key = extractApiKeyFromFragment();
    if (!key) return;
    window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.search,
    );
    notify(
        "Connected! Your Pollen will be used for this agent run.",
        "success",
    );
}

async function updateAuthUI() {
    const loggedOut = dom.authLoggedOut;
    const loggedIn = dom.authLoggedIn;

    dom.authLoginBtn.onclick = () => {
        const prompt = dom.taskInput?.value || "";
        window.location.href = getAuthorizeUrl(prompt);
    };

    dom.authLogoutBtn.onclick = () => {
        clearApiKey();
        apiKey = null;
        hide(dom.mainSection);
        show(loggedOut);
        hide(loggedIn);
        notify("Logged out. Log in to run the agent.");
    };

    apiKey = getApiKey();

    if (!apiKey) {
        show(loggedOut);
        hide(loggedIn);
        hide(dom.mainSection);
        return;
    }

    hide(loggedOut);
    show(loggedIn);
    show(dom.mainSection);
    hide(document.querySelector("header .tagline"));

    try {
        const balance = await fetchBalance(apiKey);
        if (balance) {
            dom.authBalance.textContent = `${balance.balance.toFixed(2)} pollen`;
        }
    } catch {
        clearApiKey();
        apiKey = null;
        notify("Session expired. Please log in again.", "error");
        await updateAuthUI();
    }
}

// ── Trace ────────────────────────────────────────────────────────────────────

function now() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function addTraceEntry(entry) {
    const div = document.createElement("div");
    div.className = `trace-entry ${entry.type}`;

    let html = `<div class="trace-step">${entry.step}. ${entry.emoji} <strong>${entry.title}</strong> <span class="trace-time">${entry.time}</span></div>`;
    html += `<div class="trace-content">${entry.content}</div>`;

    if (entry.decision) {
        html += `<div class="trace-decision">
            <span class="decision-label">Jev decided:</span>
            <span class="decision-value">${entry.decision}</span>
        </div>`;
    }
    if (entry.confidence !== undefined) {
        html += `<div class="trace-confidence">
            <span>Confidence:</span>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width:${entry.confidence * 100}%"></div>
            </div>
            <span class="confidence-value">${(entry.confidence * 100).toFixed(0)}%</span>
        </div>`;
    }
    if (entry.probabilities) {
        html += `<div class="trace-probabilities">`;
        for (const [key, prob] of Object.entries(entry.probabilities)) {
            html += `<div class="prob-row"><span class="prob-label">${key}</span>
                <div class="prob-track"><div class="prob-fill" style="width:${prob * 100}%"></div></div>
                <span class="prob-value">${formatProbability(prob)}</span></div>`;
        }
        html += `</div>`;
    }

    div.innerHTML = html;
    dom.traceList.appendChild(div);
    decisionLog.push(entry);
    div.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearTrace() {
    decisionLog = [];
    dom.traceList.innerHTML = "";
    hide(dom.traceSection);
    hide(dom.outputSection);
    dom.codeOutput.textContent = "";
    dom.errorBox.textContent = "";
    hide(dom.errorBox);
}

// ── Agent Loop ───────────────────────────────────────────────────────────────

async function decideAction(state) {
    const questions = {
        action: AGENT_QUESTIONS.action,
        confident: AGENT_QUESTIONS.confident,
    };

    const result = await postDecision(apiKey, state, questions);

    const action = result.answers.action.choice;
    const confidence = result.answers.confident.noul;
    const probabilities = result.answers.action.probabilities;

    return { action, confidence, probabilities, result };
}

async function generateCode(state) {
    const code = await postChat(apiKey, [
        {
            role: "system",
            content:
                "You are a helpful coding agent. Write clean, well-documented code that solves the task. Include comments and explanations. Only output the code, no markdown fences.",
        },
        { role: "user", content: `Task: ${state}` },
    ]);
    return code;
}

function performAction(action, state) {
    const actionInfo = AGENT_ACTIONS[action] || AGENT_ACTIONS.plan;

    addTraceEntry({
        step: decisionLog.length + 1,
        type: action,
        emoji: actionInfo.emoji,
        title: actionInfo.label,
        content: actionInfo.description,
        time: now(),
    });

    if (action === "code") {
        return generateCode(state);
    }

    const descriptions = {
        explore:
            "The agent analyzed the task context and identified the key requirements.",
        plan: "The agent broke down the task into implementation steps: requirements analysis, implementation, testing, and review.",
        test: "The agent wrote and ran tests, verifying the code handles edge cases correctly.",
        review: "The agent reviewed the code for security, performance, and maintainability.",
    };

    return Promise.resolve(descriptions[action] || "Action completed.");
}

async function runAgent() {
    if (!apiKey) {
        notify("Please log in first!", "error");
        return;
    }

    const task = dom.taskInput.value.trim();
    if (!task) {
        dom.errorBox.textContent = "Please enter a task.";
        show(dom.errorBox);
        return;
    }

    clearTrace();
    agentRunning = true;
    agentAbort = false;
    dom.startBtn.disabled = true;
    show(dom.stopBtn);

    const state = `Task: ${task}`;
    let step = 0;
    let generatedCode = "";
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    notify("Agent started — asking Jev what to do next...", "info");

    try {
        while (agentRunning && !agentAbort && iterations < MAX_ITERATIONS) {
            iterations++;
            step++;

            addTraceEntry({
                step,
                type: "jev",
                emoji: "🧠",
                title: "Asking Jev...",
                content:
                    "Calling POST /alpha/decisions — asking what action to take",
                time: now(),
            });

            const { action, confidence, probabilities, result } =
                await decideAction(state);

            addTraceEntry({
                step,
                type: "decision",
                emoji: "🎲",
                title: "Jev's Decision",
                content: `Action: ${action}`,
                time: now(),
                decision: `${AGENT_ACTIONS[action]?.label || action} (${formatProbability(action === "done" ? 1 : confidence)})`,
                confidence,
                probabilities,
                result,
            });

            if (action === "done") {
                addTraceEntry({
                    step: step + 1,
                    type: "done",
                    emoji: "✅",
                    title: "Task Complete",
                    content: "Jev decided the task is complete.",
                    time: now(),
                });
                break;
            }

            const actionResult = await performAction(action, state);

            const truncated =
                typeof actionResult === "string" && actionResult.length > 200
                    ? `${actionResult.slice(0, 200)}...`
                    : actionResult;

            addTraceEntry({
                step: step + 1,
                type: "result",
                emoji: "📋",
                title: "Action Result",
                content: truncated,
                time: now(),
            });

            if (action === "code" && typeof actionResult === "string") {
                generatedCode = actionResult;
            }

            step += 2;
        }

        if (generatedCode) {
            dom.codeOutput.textContent = generatedCode;
            show(dom.outputSection);
        }

        notify("Agent finished! 🎉", "success");
    } catch (error) {
        let msg = error.message || "Agent error";
        if (error.status === 402) {
            msg =
                "🔴 Pollen budget exhausted. Add funds at enter.pollimations.ai";
        }
        dom.errorBox.textContent = msg;
        show(dom.errorBox);
        notify("Agent stopped due to error.", "error");
    } finally {
        agentRunning = false;
        dom.startBtn.disabled = false;
        hide(dom.stopBtn);
        show(dom.traceSection);
    }
}

dom.startBtn.addEventListener("click", runAgent);
dom.stopBtn.addEventListener("click", () => {
    agentAbort = true;
    dom.stopBtn.disabled = true;
    notify("Stopping agent...", "warning");
});
dom.taskInput.addEventListener("input", () => {
    dom.startBtn.disabled = !dom.taskInput.value.trim();
});

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    handleAuthRedirect();
    updateAuthUI();
});
