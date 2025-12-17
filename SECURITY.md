## 📢 Security Policy for Pollinations

Hi there! First off, thank you for caring about the stability and safety of Pollinations. We deeply appreciate folks like you who want to help keep our ecosystem healthy. Our team is committed to making Pollinations a safe, privacy-first space for everyone to explore AI creativity.

***

## 🛡️ Reporting Security Vulnerabilities

If you’ve spotted a security vulnerability anywhere in our code, APIs, or infrastructure, here’s how you can help us protect the community:

1. **Reach Out Privately**  
   Please **don’t** make a public GitHub issue, comment, or post in discussions about vulnerabilities! Instead, reach out to us in one of these ways:
   - Email us at [hello@pollinations.ai](mailto:hello@pollinations.ai)
   - Or DM a maintainer directly on [Discord](https://discord.gg/pollinations-ai-885844321461485618).
   
2. **What to Include**  
   The more detail you can provide, the faster we can fix things. Here’s what helps us:
   - A clear description of what you found
   - Proof of Concept or steps to reproduce, if possible
   - Why it matters and what an attacker could potentially do
   - Any ideas for fixes or mitigations (always welcome!)

3. **How We Respond**  
   We do our absolute best to reply within **72 hours** and will keep you updated as we investigate and patch the issue. Once it’s fixed, we’ll publish a public advisory and, with your consent, give you credit for the find.

4. **Recognition**  
   Security-minded contributors keep us strong! With your permission, we’re happy to mention you in our thanks—just let us know if you’d prefer to stay anonymous.

***

## 📋 Scope of This Policy

This policy covers everything in the [`pollinations/pollinations`](https://github.com/pollinations/pollinations) repository, including:
- The main `pollinations.ai` website and React frontend
- Backend and CDN/caching systems for image and text generation
- Model Context Protocol (MCP) server, bots, and direct integration hooks

*If you discover something in third-party code, let their maintainers know unless it’s a problem because of our integration.*

***

## 🏷️ What Counts as a Vulnerability?

We’d especially like to hear about:
- Remote code execution, privilege escalation, or command injection in any system
- Ways to bypass authentication or access control (like APIs or dashboards)
- Leaks of sensitive data, including user input/history, logs, or info in error messages
- API abuse resulting in denial of service, rate limit bypass, or billing manipulation
- Prompt injection/model escape in AI endpoints (especially if it produces unsafe or privileged output)
- Proven supply chain attacks from dependencies
- Misconfigurations (debug endpoints left open, secrets in logs or code)
- Issues with our CI/CD or deployment pipeline security

***

## ⛔ What’s Not in Scope

While we love feedback, these are *not* considered security vulnerabilities for this project:
- Self-XSS (you attacking your own browser)
- DoS from just going past normal API rate limits (unless it’s a new exploit)
- Bugs exclusive to other, unrelated projects
- Social engineering targeting our team/community
- Feature requests, moderation tweaks, or other changes to how the model thinks/responds

***

## 📣 A Note on Conduct

Pollinations thrives on kindness, respect, and constructive collaboration. Please always treat others well. If you suspect someone is acting in bad faith or discover an urgent exploit, contact us privately right away.

For general questions, hop into a GitHub Discussion—but **never** share sensitive security info in public spaces.

***

## 🙏 Thanks

We can’t say this enough: **thank you** for helping make Pollinations a safer hub for creative AI. Every tip, every report, every patch makes a real difference!

— With gratitude,  
The Pollinations Maintainers & Community Team

***

**For truly urgent or sensitive security issues:**  
Always use private contact (email/Discord) as public posts may go unnoticed!

***

*(Last updated: 2025-08-29)*
