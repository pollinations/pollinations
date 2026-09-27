import type { Page } from "playwright";

// Preserve the rendered page's layout and native scrolling without running its
// application again. Every preview is produced by the isolated real runtime.
export function captureDocument(page: Page) {
    return page.evaluate(() => {
        const copy = document.documentElement.cloneNode(true) as HTMLElement;
        copy.removeAttribute("inert");
        copy.querySelector("body")?.removeAttribute("inert");

        const originals = document.querySelectorAll(
            "input, textarea, select, canvas",
        );
        const copies = copy.querySelectorAll("input, textarea, select, canvas");
        originals.forEach((original, index) => {
            const target = copies[index];
            if (original instanceof HTMLInputElement) {
                if (original.type === "hidden") {
                    target.remove();
                    return;
                }
                target.setAttribute(
                    "value",
                    original.type === "password" ? "" : original.value,
                );
                target.toggleAttribute("checked", original.checked);
            } else if (original instanceof HTMLTextAreaElement) {
                target.textContent = original.value;
            } else if (original instanceof HTMLSelectElement) {
                target
                    .querySelectorAll("option")
                    .forEach((option, optionIndex) => {
                        option.toggleAttribute(
                            "selected",
                            original.options[optionIndex].selected,
                        );
                    });
            } else if (original instanceof HTMLCanvasElement) {
                const image = document.createElement("img");
                for (const attribute of target.attributes)
                    image.setAttribute(attribute.name, attribute.value);
                image.src = original.toDataURL();
                target.replaceWith(image);
            }
        });
        copy.querySelectorAll(
            "script, iframe, object, embed, base, link:not([rel='stylesheet']), meta[http-equiv]",
        ).forEach((element) => {
            element.remove();
        });
        for (const element of [copy, ...copy.querySelectorAll("*")]) {
            for (const attribute of [...element.attributes]) {
                if (attribute.name.startsWith("on"))
                    element.removeAttribute(attribute.name);
            }
        }
        // Inert controls keep their actual styling; disabled would gray them out.
        copy.querySelectorAll(
            "a, button, input, textarea, select, [role='button'], [contenteditable]",
        ).forEach((element) => {
            element.setAttribute("inert", "");
        });
        const base = document.createElement("base");
        base.href = `${location.origin}${location.pathname}`;
        const head = copy.querySelector("head");
        head?.insertBefore(base, head.firstChild);
        return `<!doctype html>${copy.outerHTML}`;
    });
}
