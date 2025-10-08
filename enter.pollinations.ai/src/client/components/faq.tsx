import type { FC } from "react";
import { useState } from "react";

type FAQItem = {
    question: string;
    answer: string;
};

// Hardcoded FAQ data from POLLEN_FAQ.md
// Source: https://github.com/pollinations/pollinations/blob/master/enter.pollinations.ai/POLLEN_FAQ.md
const faqData: FAQItem[] = [
    {
        question: "What is Pollen?",
        answer: "Pollen is our prepaid credit system. $1 = 1 Pollen (beta). You spend it on API calls. Free models cost 0 Pollen — we just track usage for stats.",
    },
    {
        question: "How do I get Pollen?",
        answer: "Two ways:<br />• <strong>Buy packs</strong> with your credit card — goes straight to your wallet, never expires<br />• <strong>Redeem sponsorship coupons</strong> — temporary Pollen that gets used first, expires 24h after you claim it",
    },
    {
        question: "What payment methods do you accept?",
        answer: "Credit cards for now. We're looking into crypto and other options for people in countries with payment restrictions.",
    },
    {
        question: "Is there a monthly subscription?",
        answer: 'Not yet, but we\'re considering it based on community feedback. Check out the <a href="https://github.com/pollinations/pollinations/issues/2202" target="_blank" rel="noopener noreferrer" class="underline">voting issue</a> to share your thoughts or join our <a href="https://discord.gg/pollinations" target="_blank" rel="noopener noreferrer" class="underline">Discord</a> for updates.',
    },
    {
        question: "Can I try it without signing up or paying?",
        answer: "Yep! Just hit the API — no signup needed. Free models work instantly, no Pollen required.",
    },
    {
        question: "What changes when I register?",
        answer: "You keep the free models (with rate limits) and unlock paid models (no rate limits, just costs Pollen). Plus you get daily free Pollen grants.",
    },
    {
        question: "How do daily grants work?",
        answer: "Every day at 00:00 UTC, registered users get free Pollen. It's spent before your purchased balance.<br /><br />We have three tiers: <strong>Seed</strong> (default), <strong>Flower</strong>, and <strong>Nectar</strong>. Higher tiers get more daily Pollen. You can request an upgrade in your dashboard.",
    },
    {
        question: "How much Pollen do models use?",
        answer: "Each model uses different amounts of Pollen based on what it costs us to run. We'll have a Pollen cost page launching soon where you can see what each model uses. Free models always cost 0 Pollen.",
    },
    {
        question: "Will free models always be free?",
        answer: "Yes! Free models remain free forever for all users. We're committed to keeping AI accessible. Paid options only apply to premium models that offer additional capabilities.",
    },
    {
        question: "How does my wallet work?",
        answer: "One wallet for all your apps. Top up anytime, use it anywhere.",
    },
    {
        question: "What's coming next?",
        answer: "• <strong>In-app purchases</strong> (early 2026) — let your users buy Pollen in your app, you get a bonus<br />• <strong>More models</strong> — video, real-time audio, expanding the catalog<br />• <strong>Ads plugin</strong> (2026) — earn Pollen when users see ads<br />• <strong>Quests</strong> — earn Pollen by starring projects, building cool stuff, etc.<br /><br />(Plans may change based on what the community needs)",
    },
];

export const FAQ: FC = () => {
    const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

    const toggleQuestion = (index: number) => {
        setOpenIndices((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2 justify-between items-center">
                <h2>Pollen FAQ</h2>
                <a 
                    href="https://github.com/pollinations/pollinations/blob/master/enter.pollinations.ai/POLLEN_FAQ.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                    View on GitHub →
                </a>
            </div>
            <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
                <div className="flex flex-col gap-4">
                    {faqData.map((item, index) => (
                        <div key={index} className="border-b border-emerald-200 last:border-b-0 pb-4 last:pb-0">
                            <button
                                onClick={() => toggleQuestion(index)}
                                className="w-full text-left flex justify-between items-start gap-4 text-green-950 hover:text-green-800 transition-colors"
                            >
                                <span className="flex-1" style={{ fontWeight: 700 }}>{item.question}</span>
                                <span className="text-2xl flex-shrink-0 font-normal">{openIndices.has(index) ? "−" : "+"}</span>
                            </button>
                            {openIndices.has(index) && (
                                <div 
                                    className="mt-3 text-gray-600 leading-relaxed prose prose-sm max-w-none"
                                    dangerouslySetInnerHTML={{ __html: item.answer }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
