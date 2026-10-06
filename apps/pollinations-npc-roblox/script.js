// Copy the Luau sample to the clipboard when the button is clicked.
document.addEventListener("DOMContentLoaded", () => {
    var copyBtn = document.getElementById("copy-btn");
    if (!copyBtn) {
        return;
    }

    copyBtn.addEventListener("click", () => {
        var targetId = copyBtn.getAttribute("data-target");
        var target = document.getElementById(targetId);
        if (!target) {
            return;
        }

        var text = target.innerText || target.textContent;
        var done = () => {
            copyBtn.textContent = "Copied!";
            setTimeout(() => {
                copyBtn.textContent = "Copy code";
            }, 1500);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, () => {
                fallbackCopy(text, done);
            });
        } else {
            fallbackCopy(text, done);
        }
    });

    function fallbackCopy(text, done) {
        var textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            done();
        } catch {
            copyBtn.textContent = "Copy failed";
        }
        document.body.removeChild(textarea);
    }
});
