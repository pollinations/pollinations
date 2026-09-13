export const illustrations: Record<string, string> = {
    "github-handoff":
        '<h3>Continue on GitHub</h3><p>GitHub handles sign-in, account creation and any required approval.</p><p>You return to Pollinations when finished.</p><div class="external-button">Return to Pollinations</div>',
    "github-login":
        '<div class="symbol">GH</div><h3>Sign in to GitHub</h3><div class="mock-form"><label>Username or email address</label><div class="mock-field">Your GitHub login</div><label>Password / other sign-in method</label><div class="mock-field">Sign in on GitHub</div></div><div class="external-button">Sign in</div><p>New to GitHub? Create an account.</p>',
    "github-signup":
        '<h3>Create a GitHub account</h3><p>External provider handoff</p><p>Complete signup and any required checks on GitHub. These pages are managed by GitHub.</p><div class="external-button">Continue after signup</div>',
    "github-authorize":
        '<div class="symbol">GH</div><h3>Authorize Pollinations</h3><p>Signed into GitHub as <strong>example-user</strong></p><div class="mock-permissions"><strong>Pollinations requests</strong><p>Read your GitHub profile<br>Read your email addresses</p></div><div class="external-button">Authorize Pollinations</div><p>This connects GitHub to Pollinations. It does not approve a developer app’s Pollen spending.</p>',
    device: '<div class="symbol">›_</div><h3>Connect your device</h3><p>Open the verification address in your browser:</p><p class="address">enter.pollinations.ai/device</p><div class="code">ABCD-EFGH</div><p>The device waits for approval.</p>',
    "device-done":
        '<div class="symbol">✓</div><h3>Device connected</h3><div class="result-card">The device has its approved key</div><p style="margin-top:18px">Use the device within the key’s permissions, budget and lifetime.</p>',
};
