import { getDomain } from "tldts";

/**
 * Shared mail providers are never recorded with a sign-up. Exact domains only: a
 * look-alike on another suffix (gmail.xyz) is anyone's to register.
 */
const PUBLIC_MAIL_DOMAINS = new Set([
    "gmail.com",
    "googlemail.com",
    "outlook.com",
    "outlook.fr",
    "outlook.de",
    "outlook.es",
    "outlook.it",
    "outlook.jp",
    "outlook.com.br",
    "hotmail.com",
    "hotmail.co.uk",
    "hotmail.fr",
    "hotmail.de",
    "hotmail.es",
    "hotmail.it",
    "hotmail.com.br",
    "live.com",
    "live.co.uk",
    "live.fr",
    "live.de",
    "live.it",
    "live.com.mx",
    "msn.com",
    "yahoo.com",
    "yahoo.co.uk",
    "yahoo.fr",
    "yahoo.de",
    "yahoo.es",
    "yahoo.it",
    "yahoo.co.jp",
    "yahoo.co.in",
    "yahoo.com.br",
    "ymail.com",
    "rocketmail.com",
    "aol.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "proton.me",
    "protonmail.com",
    "pm.me",
    "tutanota.com",
    "tutanota.de",
    "tuta.io",
    "tuta.com",
    "tutamail.com",
    "fastmail.com",
    "fastmail.fm",
    "hey.com",
    "duck.com",
    "mailbox.org",
    "posteo.de",
    "posteo.net",
    "zoho.com",
    "mail.com",
    "gmx.com",
    "gmx.net",
    "gmx.de",
    "gmx.at",
    "gmx.ch",
    "web.de",
    "t-online.de",
    "freenet.de",
    "orange.fr",
    "free.fr",
    "laposte.net",
    "sfr.fr",
    "wanadoo.fr",
    "libero.it",
    "virgilio.it",
    "seznam.cz",
    "wp.pl",
    "o2.pl",
    "interia.pl",
    "onet.pl",
    "yandex.ru",
    "yandex.com",
    "yandex.ua",
    "ya.ru",
    "mail.ru",
    "bk.ru",
    "inbox.ru",
    "list.ru",
    "rambler.ru",
    "qq.com",
    "foxmail.com",
    "163.com",
    "126.com",
    "yeah.net",
    "sina.com",
    "sina.cn",
    "sohu.com",
    "aliyun.com",
    "139.com",
    "naver.com",
    "hanmail.net",
    "daum.net",
    "kakao.com",
    "rediffmail.com",
    "uol.com.br",
    "bol.com.br",
    "terra.com.br",
    "att.net",
    "comcast.net",
    "verizon.net",
    "sbcglobal.net",
    "bellsouth.net",
    "cox.net",
    // Shared forwarding and private-address hosts: many unrelated people
    // sign up through each, so a busy day would hold all of them.
    "github.com", // users.noreply.github.com
    "appleid.com", // privaterelay.appleid.com (Hide My Email)
    "mozmail.com", // Firefox Relay
    "simplelogin.com",
    "simplelogin.co",
    "simplelogin.fr",
    "simplelogin.io",
    "aleeas.com",
    "slmail.me",
    // SimpleLogin's shared alias pools (mail goes to mx1.simplelogin.co).
    "8shield.net",
    "slmails.com",
    "8alias.com",
    "dralias.com",
    "silomails.com",
    "pass2mail.com",
    "addy.io",
    "anonaddy.com",
    "anonaddy.me",
    "passmail.net", // Proton Pass
    "passmail.com",
    "passinbox.com",
    "passfwd.com",
]);

/**
 * The domain a registrant controls (Public Suffix List), so subdomains
 * (a1.farm.com, a2.farm.com) count as one. Null when the host has none
 * (co.uk, an IP): such sign-ups are never recorded.
 */
export function registrableDomain(email: string): string | null {
    let host: string;
    try {
        // ASCII (punycode) form, so a non-Latin domain is counted too.
        host = new URL(
            `http://${email.slice(email.lastIndexOf("@") + 1)}`,
        ).hostname.replace(/\.+$/, "");
    } catch {
        return null;
    }
    const domain = getDomain(host, { validateHostname: false });
    // Domains reach Discord and maintainers' commands: letters, digits,
    // dots and hyphens only.
    return domain && /^[a-z0-9.-]+$/.test(domain) ? domain : null;
}

/**
 * The email domain a sign-up is recorded with, so infra-watch can spot many
 * new accounts on one domain: its registrable domain when private. Public
 * mail providers and hosts without one record nothing.
 */
export function signupEmailDomain(email: string): string | undefined {
    const domain = registrableDomain(email);
    return domain && !PUBLIC_MAIL_DOMAINS.has(domain) ? domain : undefined;
}
