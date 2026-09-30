// script.js — UI, state, and decision API logic for Jev Decisions App

import {
    clearApiKey,
    extractApiKeyFromFragment,
    fetchBalance,
    formatProbability,
    formatScore,
    getApiKey,
    getAuthorizeUrl,
    postDecision,
    QUESTION_TYPES,
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
    mainSection: $("generatorSection"),
    stateInput: $("stateInput"),
    questionsContainer: $("questionsContainer"),
    addQuestionBtn: $("addQuestionBtn"),
    submitBtn: $("submitBtn"),
    errorBox: $("errorBox"),
    resultSection: $("resultSection"),
    resultModel: $("resultModel"),
    resultTokens: $("resultTokens"),
    answersContainer: $("answersContainer"),
    newDecisionBtn: $("newDecisionBtn"),
};

// ── State ────────────────────────────────────────────────────────────────────

let apiKey = null;

// ── Notifications ────────────────────────────────────────────────────────────

function notify(message, type = "info") {
    const existing = document.querySelector(".notification");
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.className = `notification ${type}`;
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function handleAuthRedirect() {
    const key = extractApiKeyFromFragment();
    if (!key) return;
    // extractApiKeyFromFragment stores in memory; clear URL fragment
    window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.search,
    );
    notify("Connected! Your Pollen will be used for decisions.", "success");
}

async function updateAuthUI() {
    const loggedOut = dom.authLoggedOut;
    const loggedIn = dom.authLoggedIn;

    dom.authLoginBtn.onclick = () => {
        const prompt = dom.stateInput?.value || "";
        window.location.href = getAuthorizeUrl(prompt);
    };

    dom.authLogoutBtn.onclick = () => {
        clearApiKey();
        apiKey = null;
        hide(dom.mainSection);
        show(loggedOut);
        hide(loggedIn);
        notify("Logged out. Log in to ask Jev.");
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

    // Fetch balance
    try {
        const balance = await fetchBalance(apiKey);
        if (balance) {
            dom.authBalance.textContent = `${balance.balance.toFixed(2)} pollen`;
        }
    } catch {
        clearApiKey();
        apiKey = null;
        notify("Session expired. Please log in again.", "error");
        updateAuthUI();
    }
}

// ── Question Builder ─────────────────────────────────────────────────────────

function createQuestionCard(id) {
    const type = "noul";
    const card = document.createElement("div");
    card.className = "question-card";
    card.dataset.questionId = String(id);

    card.innerHTML = `
        <div class="question-header">
            <input type="text" class="q-name" placeholder="Question name (e.g. urgent)" value="" />
            <select class="q-type-select" onchange="updateQuestionType(this, ${id})">
                ${QUESTION_TYPES.map((t) => `<option value="${t.value}" ${t.value === type ? "selected" : ""}>${t.emoji} ${t.label}</option>`).join("")}
            </select>
            <button type="button" class="remove-question" onclick="removeQuestion(${id})">×</button>
        </div>
        <div class="q-instructions">
            <textarea class="q-instructions-text" placeholder="What to decide? E.g. 'Is this invoice overdue?'" rows="2"></textarea>
            <p class="hint">The question Jev will answer.</p>
        </div>
        <div class="q-criteria-noul hidden">
            <p class="hint">Optional descriptions for what true/false mean:</p>
            <input type="text" class="q-true" placeholder="True means..." />
            <input type="text" class="q-false" placeholder="False means..." />
        </div>
        <div class="q-criteria-choice hidden">
            <p class="hint">Options — each one is a possible answer. Key = short name, Value = description.</p>
            <div class="criteria-list"></div>
            <button type="button" class="btn btn-outline btn-sm add-criterion" onclick="addChoiceCriterion(${id})">＋ Add Option</button>
        </div>
        <div class="q-criteria-score hidden">
            <p class="hint">Ordered rungs from lowest to highest scale:</p>
            <div class="criteria-list"></div>
            <button type="button" class="btn btn-outline btn-sm add-criterion" onclick="addScoreCriterion(${id})">＋ Add Rung</button>
        </div>
    `;

    return card;
}

window.updateQuestionType = (select, id) => {
    const card = document.querySelector(
        `.question-card[data-question-id="${id}"]`,
    );
    if (!card) return;
    const type = select.value;
    card.querySelectorAll(
        ".q-criteria-noul, .q-criteria-choice, .q-criteria-score",
    ).forEach((el) => {
        hide(el);
    });
    show(card.querySelector(`.q-criteria-${type}`));

    // Add initial criteria for choice/score
    if (type === "choice" || type === "score") {
        const list = card.querySelector(".criteria-list");
        if (list.children.length === 0) {
            for (let i = 0; i < 2; i++) {
                list.appendChild(createCriterionInput(type, id));
            }
        }
    }
};

function createCriterionInput(type, id) {
    if (type === "choice") {
        return createChoiceCriterion(id);
    }
    return createScoreCriterion(id);
}

function createChoiceCriterion(_id) {
    const el = document.createElement("div");
    el.className = "criterion-row";
    el.innerHTML = `
        <input type="text" class="c-key" placeholder="key (e.g. wait)" />
        <input type="text" class="c-value" placeholder="What it means" />
        <button type="button" class="remove-criterion" onclick="removeCriterion(this)">×</button>
    `;
    return el;
}

function createScoreCriterion(_id) {
    const el = document.createElement("div");
    el.className = "criterion-row score";
    el.innerHTML = `
        <input type="text" class="c-value" placeholder="e.g. low" />
        <button type="button" class="remove-criterion" onclick="removeCriterion(this)">×</button>
    `;
    return el;
}

window.addChoiceCriterion = (id) => {
    const card = document.querySelector(
        `.question-card[data-question-id="${id}"]`,
    );
    card?.querySelector(".criteria-list").appendChild(
        createChoiceCriterion(id),
    );
};

window.addScoreCriterion = (id) => {
    const card = document.querySelector(
        `.question-card[data-question-id="${id}"]`,
    );
    card?.querySelector(".criteria-list").appendChild(createScoreCriterion(id));
};

window.removeCriterion = (btn) => {
    btn.closest(".criterion-row")?.remove();
};

window.removeQuestion = (id) => {
    const card = document.querySelector(
        `.question-card[data-question-id="${id}"]`,
    );
    if (card) card.remove();
    updateSubmitButton();
};

let nextQuestionId = 0;

function addQuestion() {
    const id = nextQuestionId++;
    const card = createQuestionCard(id);
    dom.questionsContainer.insertBefore(card, dom.addQuestionBtn);
    setTimeout(
        () => updateQuestionType(card.querySelector(".q-type-select"), id),
        0,
    );
    updateSubmitButton();
}

function updateSubmitButton() {
    const cards = dom.questionsContainer.querySelectorAll(".question-card");
    dom.submitBtn.disabled = cards.length === 0 || !dom.stateInput.value.trim();
}

dom.addQuestionBtn.addEventListener("click", addQuestion);
dom.stateInput.addEventListener("input", updateSubmitButton);
dom.newDecisionBtn.addEventListener("click", () => {
    hide(dom.resultSection);
    dom.stateInput.value = "";
    dom.questionsContainer.querySelectorAll(".question-card").forEach((c) => {
        c.remove();
    });
    dom.errorBox.textContent = "";
    hide(dom.errorBox);
    nextQuestionId = 0;
    updateSubmitButton();
});

// ── Form Collection ──────────────────────────────────────────────────────────

function collectQuestions() {
    const cards = dom.questionsContainer.querySelectorAll(".question-card");
    const result = {};

    for (const card of cards) {
        const nameEl = card.querySelector(".q-name");
        const type = card.querySelector(".q-type-select")?.value || "noul";
        const instructions =
            card.querySelector(".q-instructions-text")?.value.trim() || "";

        if (!nameEl || !nameEl.value.trim()) continue;
        const name = nameEl.value.trim();

        if (!instructions) {
            throw new Error(`Question "${name}" is missing instructions.`);
        }

        const question = { type, instructions };

        if (type === "noul") {
            const trueDesc =
                card.querySelector(".q-true")?.value.trim() || null;
            const falseDesc =
                card.querySelector(".q-false")?.value.trim() || null;
            question.criteria = {};
            if (trueDesc) question.criteria.true = trueDesc;
            if (falseDesc) question.criteria.false = falseDesc;
        } else if (type === "choice") {
            const list = card.querySelector(".criteria-list");
            const rows = list?.querySelectorAll(".criterion-row") || [];
            const criteria = {};
            for (const row of rows) {
                const key = row.querySelector(".c-key")?.value.trim() || "";
                const value =
                    row.querySelector(".c-value")?.value.trim() || null;
                if (key) criteria[key] = value;
            }
            if (Object.keys(criteria).length < 2) {
                throw new Error(
                    `Question "${name}" (Choice) needs at least 2 options.`,
                );
            }
            question.criteria = criteria;
        } else if (type === "score") {
            const list = card.querySelector(".criteria-list");
            const rows = list?.querySelectorAll(".criterion-row") || [];
            const criteria = [];
            for (const row of rows) {
                const value = row.querySelector(".c-value")?.value.trim() || "";
                if (value) criteria.push(value);
            }
            if (criteria.length < 2) {
                throw new Error(
                    `Question "${name}" (Score) needs at least 2 rungs.`,
                );
            }
            question.criteria = criteria;
        }

        result[name] = question;
    }

    return result;
}

// ── Submit ───────────────────────────────────────────────────────────────────

async function handleSubmit() {
    if (!apiKey) {
        notify("Please log in first!", "error");
        return;
    }

    // Collect and validate
    let questions;
    try {
        questions = collectQuestions();
    } catch (e) {
        dom.errorBox.textContent = e.message;
        show(dom.errorBox);
        return;
    }

    if (!Object.keys(questions).length) {
        dom.errorBox.textContent = "Add at least one question.";
        show(dom.errorBox);
        return;
    }

    const state = dom.stateInput.value.trim();
    if (!state) {
        dom.errorBox.textContent = "Please add some context or facts.";
        show(dom.errorBox);
        return;
    }

    hide(dom.errorBox);
    dom.submitBtn.disabled = true;
    dom.submitBtn.textContent = "Asking Jev... 🧠";

    try {
        const data = await postDecision(apiKey, state, questions);
        renderResults(data);
    } catch (error) {
        let msg = error.message || "Failed to get a decision from Jev.";
        if (error.status === 402) {
            msg =
                "🔴 Pollen budget exhausted. Add funds at enter.polliiations.ai";
        }
        dom.errorBox.textContent = msg;
        show(dom.errorBox);
        notify("Decision failed. Check the error below.", "error");
    } finally {
        dom.submitBtn.disabled = false;
        dom.submitBtn.textContent = "Ask Jev";
    }
}

dom.submitBtn.addEventListener("click", handleSubmit);

// ── Results ────────────────────────────────────────────────────────────────────

function renderResults(data) {
    dom.resultModel.textContent = data.model;
    dom.resultTokens.textContent = `${data.usage?.input_tokens || 0} in / ${data.usage?.output_tokens || 0} out tokens`;
    dom.answersContainer.innerHTML = "";

    for (const [key, answer] of Object.entries(data.answers)) {
        const card = document.createElement("div");
        card.className = "answer-card";

        const header = document.createElement("h4");

        const typeEmoji =
            answer.type === "noul"
                ? "❔"
                : answer.type === "choice"
                  ? "👆"
                  : "📊";
        header.innerHTML = `${typeEmoji} ${key}`;

        if (answer.type === "noul") {
            // Yes/No probability
            const pct = (answer.noul * 100).toFixed(0);
            const isTrue = answer.noul >= 0.5;
            card.innerHTML = "";
            card.appendChild(header);
            const div = document.createElement("div");
            div.className = "noul-result";
            div.innerHTML = `
                <div class="noul-prob ${isTrue ? "noul-true" : "noul-false"}">${formatProbability(answer.noul)}</div>
                <div class="noul-label">${isTrue ? "Yes" : "No"} — ${pct}% confident</div>
                <div class="confidence">Confidence: ${(answer.confidence * 100).toFixed(0)}%</div>
            `;
            card.appendChild(div);
        } else if (answer.type === "choice") {
            card.innerHTML = "";
            card.appendChild(header);

            const selected = document.createElement("div");
            selected.className = "choice-result";

            const probs = answer.probabilities || {};
            const selectedText =
                probs[answer.choice] !== undefined
                    ? formatProbability(probs[answer.choice])
                    : answer.choice;

            selected.textContent = `→ ${answer.choice} (${selectedText})`;
            card.appendChild(selected);

            const probContainer = document.createElement("div");
            probContainer.className = "prob-grid";
            for (const [opt, prob] of Object.entries(probs)) {
                const row = document.createElement("div");
                row.className = "prob-row";
                row.innerHTML = `
                    <span class="prob-label">${opt}</span>
                    <div class="prob-track"><div class="prob-fill" style="width:${prob * 100}%"></div></div>
                    <span class="prob-value">${formatProbability(prob)}</span>
                `;
                probContainer.appendChild(row);
            }
            card.appendChild(probContainer);

            if (answer.confidence !== undefined) {
                const conf = document.createElement("div");
                conf.className = "confidence";
                conf.textContent = `Confidence: ${(answer.confidence * 100).toFixed(0)}%`;
                card.appendChild(conf);
            }
        } else if (answer.type === "score") {
            card.innerHTML = "";
            card.appendChild(header);

            const scoreDiv = document.createElement("div");
            scoreDiv.className = "score-result";
            scoreDiv.textContent = `Score: ${formatScore(answer.score, answer.legend || {})} `;
            card.appendChild(scoreDiv);

            // Legend
            const legendDiv = document.createElement("div");
            legendDiv.className = "legend";
            for (const [idx, label] of Object.entries(answer.legend || {})) {
                const item = document.createElement("span");
                item.className = "legend-item";
                item.textContent = `${idx}: ${label}`;
                legendDiv.appendChild(item);
            }
            card.appendChild(legendDiv);

            // Probabilities
            const probContainer = document.createElement("div");
            probContainer.className = "prob-grid";
            for (const [idx, prob] of Object.entries(
                answer.probabilities || {},
            )) {
                const row = document.createElement("div");
                row.className = "prob-row";
                row.innerHTML = `
                    <span class="prob-label">${idx}</span>
                    <div class="prob-track"><div class="prob-fill" style="width:${prob * 100}%"></div></div>
                    <span class="prob-value">${formatProbability(prob)}</span>
                `;
                probContainer.appendChild(row);
            }
            card.appendChild(probContainer);

            if (answer.confidence !== undefined) {
                const conf = document.createElement("div");
                conf.className = "confidence";
                conf.textContent = `Confidence: ${(answer.confidence * 100).toFixed(0)}%`;
                card.appendChild(conf);
            }
        }

        dom.answersContainer.appendChild(card);
    }

    show(dom.resultSection);
    notify("Jev answered! 🎉", "success");
}

// ── CSS for probability grid (injected dynamically) ───────────────────────────

const extraCSS = document.createElement("style");
extraCSS.textContent = `
    .prob-grid { display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.5rem; }
    .prob-row { display: grid; grid-template-columns: 120px 1fr 60px; align-items: center; gap: 0.5rem; }
    .prob-label { font-weight: 600; color: var(--text-secondary); }
    .prob-track { height: 16px; background: var(--bg-primary); border-radius: 8px; overflow: hidden; position: relative; }
    .prob-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #ffd700); border-radius: 8px; min-width: 2px; transition: width 0.5s ease; }
    .prob-value { text-align: right; font-weight: 700; }
`;
document.head.appendChild(extraCSS);

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
    handleAuthRedirect();
    updateAuthUI();
    // Add the first question by default
    setTimeout(() => {
        if (
            dom.questionsContainer.querySelectorAll(".question-card").length ===
            0
        ) {
            addQuestion();
        }
    }, 100);
});
