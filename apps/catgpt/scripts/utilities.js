// Utility Functions

export function getURLPrompt() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("prompt");
}

export function setURLPrompt(prompt) {
    const url = new URL(window.location);
    if (prompt) {
        url.searchParams.set("prompt", prompt);
    } else {
        url.searchParams.delete("prompt");
    }
    window.history.replaceState({}, "", url);
}

export function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === "success" ? "#05ffa1" : type === "error" ? "#ff61d8" : "#ffcc00"};
        color: #000;
        border-radius: 10px;
        font-weight: 600;
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = "slideOut 0.3s ease-in";
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

export function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
