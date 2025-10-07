import type { FC } from "react";
import { useState } from "react";

type FAQItem = {
    question: string;
    answer: string;
};

const faqData: FAQItem[] = [
    {
        question: "What is Pollen?",
        answer: "Pollen is the prepaid credit that powers the Pollinations backend. $1 = 1 Pollen (beta). Every API call is metered in Pollen; free models meter at 0 for unified telemetry.",
    },
    {
        question: "How do I get Pollen (as a developer)?",
        answer: "Two ways:\n• Purchase packs — added to your wallet; do not expire\n• Sponsorship coupons — grant temporary Pollen; spent first; expire 24h after redemption",
    },
    {
        question: "Can I try the API without an account or buying Pollen?",
        answer: "Yes. Use zero-registration trial endpoints and a limited set of free models. These calls do not consume Pollen. For more flexibily consider redeeming sponsorship coupons."
    },
    {
        question: "What changes when a user registers?",
        answer: "They keep access to the free models (rate‑limited) and unlock the paid model catalog (runs on Pollen, no platform rate limits). They also become eligible for daily grants.",
    },
    {
        question: "How do daily grants work?",
        answer: "Registered users receive sponsored Pollen every day at 00:00. Grants are spent before any purchased balance.\n\n• Seed (default): 1 Pollen/day\n• Flower (request in dashboard): 5 Pollen/day\n• Nectar (requires Flower; request in dashboard): 10 Pollen/day",
    },
    {
        question: "How is pricing set?",
        answer: "Platform‑defined. Pollinations publishes Pollen pricing per model/operation (Unified Price Surface).",
    },
    {
        question: "Do free models consume Pollen?",
        answer: "No. They are sponsored and controlled via rate limits.",
    },
    {
        question: "How does the developer wallet work?",
        answer: "One wallet funds all your apps. Manage balance and top up at any time.",
    },
    {
        question: "What's next? (non‑binding)",
        answer: "• End‑user in‑app purchases (early 2026): integrate the Login & Top‑up Widget so end-users can buy Pollen inside your app. Each purchase granting bonus Pollen to the app owner.\n• More models: video and real‑time audio; expansion of the model catalog.\n• Ads plugin (2026): earn Pollen based on ad performance.",
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
