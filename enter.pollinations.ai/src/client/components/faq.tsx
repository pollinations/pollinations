import type { FC } from "react";
import { useState } from "react";

type FAQItem = {
    question: string;
    answer: string;
};

const faqData: FAQItem[] = [
    {
        question: "What is Pollen?",
        answer: "Pollen is our credit system. $1 = 1 Pollen. You spend it on API calls. Free models cost 0 Pollen (we just track usage for stats).",
    },
    {
        question: "How do I get Pollen?",
        answer: "Two ways:\n• Buy packs with your credit card — goes straight to your wallet, never expires\n• Redeem sponsorship coupons — temporary Pollen that gets used first, expires 24h after you claim it",
    },
    {
        question: "What payment methods do you accept?",
        answer: "Credit cards for now. We're looking into crypto and other options for people in countries with payment restrictions.",
    },
    {
        question: "Is there a monthly subscription?",
        answer: "Not yet, but we're considering it based on community feedback. Join our Discord for updates.",
    },
    {
        question: "Can I try it without signing up or paying?",
        answer: "Yep! Just hit the API — no signup needed. Free models work instantly, no Pollen required."
    },
    {
        question: "What changes when I register?",
        answer: "You keep the free models (with rate limits) and unlock paid models (no rate limits, just costs Pollen). Plus you get daily free Pollen grants.",
    },
    {
        question: "How do daily grants work?",
        answer: "Every day at 00:00 UTC, you get free Pollen. It's spent before your purchased balance.\n\n• Seed (default): 1 Pollen/day\n• Flower (request upgrade): 5 Pollen/day\n• Nectar (request upgrade): 10 Pollen/day",
    },
    {
        question: "How is pricing set?",
        answer: "We set prices based on what models actually cost us to run. Check the pricing page to see each model's rate.",
    },
    {
        question: "How much does each model cost?",
        answer: "It varies by model. Check your dashboard or the pricing page for current rates. Free models are always 0 Pollen.",
    },
    {
        question: "Do free models consume Pollen?",
        answer: "Nope! They're sponsored and just have rate limits instead.",
    },
    {
        question: "Will free models always be free?",
        answer: "Yes! We're committed to keeping basic models free and accessible. Only premium models cost Pollen.",
    },
    {
        question: "How does my wallet work?",
        answer: "One wallet for all your apps. Top up anytime, use it anywhere.",
    },
    {
        question: "What's coming next?",
        answer: "• In-app purchases (early 2026) — let your users buy Pollen in your app, you get a bonus\n• More models — video, real-time audio, expanding the catalog\n• Ads plugin (2026) — earn Pollen when users see ads\n• Quests — earn Pollen by starring projects, building cool stuff, etc.\n\n(Plans may change based on what the community needs)",
    },
];

export const FAQ: FC = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleQuestion = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2 justify-between">
                <h2>FAQ</h2>
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
                                <span className="text-2xl flex-shrink-0 font-normal">{openIndex === index ? "−" : "+"}</span>
                            </button>
                            {openIndex === index && (
                                <div className="mt-3 text-gray-600 leading-relaxed whitespace-pre-line">
                                    {item.answer}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
