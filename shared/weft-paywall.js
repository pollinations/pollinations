// Shared browser guidance for the legacy image and text x402 routes.
export const weftPaywall = {
    generateHtml: () => `<!DOCTYPE html>
<html lang="en">
    <head>
        <title>Payment Required - Pollinations</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { margin: 0; color: #171717; background: #fff; font-family: system-ui, -apple-system, sans-serif; }
            main { max-width: 600px; margin: 50px auto; padding: 20px; }
            .setup { margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem; }
            code { display: block; padding: 1rem; background: #fff; border-radius: 0.25rem; overflow-wrap: anywhere; }
            a { color: #1d4ed8; }
        </style>
    </head>
    <body>
        <main>
            <h1>Payment Required</h1>
            <p>This resource is protected by the x402 payment protocol.</p>
            <section class="setup" aria-label="Set up Weft">
                <p><strong>Get started with Weft</strong></p>
                <p>Paste this command into your AI agent:</p>
                <code>set up https://weft.network/setup.md</code>
                <p>Create a Weft account and verify your email to get <strong>$3 in free credit</strong> to use Pollinations.</p>
                <a href="https://weft.network/setup.md">Read the setup instructions</a>
            </section>
        </main>
    </body>
</html>`,
};
