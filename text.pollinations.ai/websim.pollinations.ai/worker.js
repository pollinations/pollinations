const systemPrompt = `You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for.
The HTML should be valid, self-contained, and ready to be rendered in a browser.

Include all necessary CSS inline within a <style> tag in the head section.
Include all necessary JavaScript within <script> tags, preferably at the end of the body.
Make the design clean, modern, and responsive.
Write the code in a sequence that lets the browser already render something meaningful while it is being transmitted.
Feel free to incrementally show the UI.
Imagine you are coding for a demoscene challenge where code should be short and elegant.
Use images from src="https://image.pollinations.ai/prompt/[urlencoded prompt]?width=[width]&height=[height]"
Links to subpages should always be relative without a leading slash.
You are targeting modern browsers.`;

export default {
  async fetch(request) {
    const url   = new URL(request.url);
    const path  = decodeURIComponent(url.pathname);

    // --- quick filters -----------------------------------------------------
    if (path === '/favicon.ico' || path.startsWith('/.'))
      return new Response('Not found', { status: 404 });

    // Enforce trailing slash for all paths except the root
    if (path !== '/' && !path.endsWith('/')) {
      const redirectUrl = new URL(request.url);
      redirectUrl.pathname += '/';
      return Response.redirect(redirectUrl.toString(), 301);
    }

    const prompt = path.slice(1, path.endsWith('/') ? -1 : undefined);
    if (!prompt)
      return new Response('Pass a prompt after /', { status: 400 });

    // --- upstream request --------------------------------------------------
    const upstream = await fetch('https://text.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   'openai-large',
        stream:  true,
        messages:[
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: prompt }
        ]
      })
    });
    if (!upstream.ok || !upstream.body)
      return new Response(`Upstream error ${upstream.status}`, { status: 502 });

    // --- transform: SSE  ➜  raw HTML --------------------------------------
    const sseToHtml = new TransformStream({
      start() { this.buf=''; },
      transform(chunk, ctrl) {
        this.buf += chunk;
        const lines = this.buf.split('\n');
        this.buf = lines.pop();
        for (let l of lines) {
          l = l.trim();
          if (!l || l === 'data: [DONE]') continue;
          if (l.startsWith('data:')) l = l.slice(5).trim();
          try {
            const html = JSON.parse(l).choices?.[0]?.delta?.content;
            if (html) ctrl.enqueue(html);
          } catch {}
        }
      }
    });

    // --- transform: buffer until <html>, stop after </html> ---------------
    const htmlGate = new TransformStream({
      start() {
        this.prefixBuf = '';
        this.afterOpen = false;
        this.done      = false;
        this.tailBuf   = '';
      },
      transform(chunk, ctrl) {
        if (this.done) return;                        // ignore the rest

        let text = chunk;
        if (!this.afterOpen) {
          this.prefixBuf += text;
          const lower = this.prefixBuf.toLowerCase();
          const idx   = lower.indexOf('<html');
          if (idx === -1) return;                     // still waiting
          // found <html …>
          this.afterOpen = true;
          text = this.prefixBuf.slice(idx);           // drop everything before it
          this.prefixBuf = null;
        }

        // already streaming; emit chunk
        ctrl.enqueue(text);

        // keep last few KB to look for closing tag
        this.tailBuf = (this.tailBuf + text).slice(-8192);
        if (this.tailBuf.toLowerCase().includes('</html>'))
          this.done = true;                           // stop further output
      }
    });

    const htmlStream = upstream.body
      .pipeThrough(new TextDecoderStream())  // bytes ➜ text
      .pipeThrough(sseToHtml)
      .pipeThrough(htmlGate)
      .pipeThrough(new TextEncoderStream()); // text ➜ bytes

    return new Response(htmlStream, {
      headers: {
        'Content-Type':     'text/html; charset=utf-8',
        'Content-Encoding': 'identity',
        'Cache-Control':    'no-cache'
      }
    });
  }
}
