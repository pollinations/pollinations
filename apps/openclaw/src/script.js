
        const OPENCLAW_APP_KEY = "pk_6qmH5idGyIiJdbgA";

        function copyCode(id) {
            const el = document.getElementById(id);
            const inner = el.querySelector('.code-inner') || el;
            const text = inner.textContent.trim();
            navigator.clipboard.writeText(text).then(() => {
                const btn = el.querySelector('.copy-btn');
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
            });
        }

        function toggleManual() {
            const el = document.getElementById('manual-config');
            el.classList.toggle('open');
            el.previousElementSibling.textContent = el.classList.contains('open') ? 'Manual JSON config ▴' : 'Manual JSON config ▾';
        }

        function startAuthorize() {
            const redirectUrl = encodeURIComponent(window.location.origin + window.location.pathname);
            const models = encodeURIComponent('kimi,kimi-k2.6,deepseek,deepseek-pro,glm,gemini-search,perplexity-fast,claude-fast,claude-large,gemini-large');
            const params = `redirect_url=${redirectUrl}&models=${models}`;
            // Only attach app_key when a real publishable key is configured.
            // Sending a non-pk_ value would 400; sending nothing falls back
            // to the unverified-app consent UI, which is the safe default.
            const appKey = OPENCLAW_APP_KEY.startsWith("pk_")
                ? `&app_key=${encodeURIComponent(OPENCLAW_APP_KEY)}`
                : "";
            window.location.href = `https://enter.pollinations.ai/authorize?${params}${appKey}`;
        }

        function switchTab(tab, btn) {
            document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); });
            document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); });
            document.getElementById(`tab-${tab}`).classList.add('active');
            btn.classList.add('active');
        }

        function injectApiKey(apiKey) {
            // Show connected state
            document.getElementById('step-connect').style.display = 'none';
            document.getElementById('step-connected').style.display = 'block';
            document.getElementById('key-display').textContent = apiKey;

            // Update setup command placeholder
            var placeholder = document.getElementById('key-placeholder');
            placeholder.textContent = apiKey;
            placeholder.classList.add('key-injected');

            // Update JSON config and agent message placeholders
            document.querySelectorAll('.key-in-json').forEach(span => {
                span.textContent = apiKey;
                span.classList.add('key-injected');
            });
        }

        // Check for API key in URL fragment on page load
        (() => {
            const match = window.location.hash.match(/api_key=([^&]+)/);
            if (match) {
                const apiKey = decodeURIComponent(match[1]);
                history.replaceState(null, '', window.location.pathname + window.location.search);
                injectApiKey(apiKey);
            }
        })();
