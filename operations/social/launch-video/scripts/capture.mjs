// Captures the new website (staging) for the video: a viewport shot and a
// full-page shot of each route, in dark and light.
import { chromium } from "playwright";

const BASE = "https://staging.pollinations.ai";
const ROUTES = {
    home: "/",
    play: "/play",
    apps: "/apps",
    community: "/community",
};

const browser = await chromium.launch();
for (const scheme of ["dark", "light"]) {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: scheme,
    });
    for (const [name, path] of Object.entries(ROUTES)) {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        // Let lazy images and live counters settle, then scroll through once
        // so below-the-fold images load before the full-page shot.
        await page.waitForTimeout(1500);
        // Advance the featured-apps carousel past its first slide.
        if (name === "apps") {
            await page
                .getByRole("button", { name: "Next featured app" })
                .click();
            await page.waitForTimeout(900);
        }
        await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += 600) {
                window.scrollTo(0, y);
                await new Promise((r) => setTimeout(r, 150));
            }
            window.scrollTo(0, 0);
        });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `public/site/${name}-${scheme}.png` });
        await page.screenshot({
            path: `public/site/${name}-${scheme}-full.png`,
            fullPage: true,
        });
        console.log("captured", name, scheme);
    }
    await page.close();
}
await browser.close();
