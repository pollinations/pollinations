function copyCode(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const inner = el.querySelector(".code-inner") || el;
    const text = inner.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
        const btn = el.querySelector(".copy-btn");
        if (!btn) return;
        btn.textContent = "Copied!";
        setTimeout(() => {
            btn.textContent = "Copy";
        }, 1500);
    });
}

function switchTab(tab, btn) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("active");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
        p.classList.remove("active");
    });
    document.getElementById(`tab-${tab}`)?.classList.add("active");
    btn.classList.add("active");
}

// Older authorization links returned an api_key fragment. Never display it;
// remove it before the page can retain it in browser history.
if (window.location.hash.includes("api_key=")) {
    history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
    );
}
