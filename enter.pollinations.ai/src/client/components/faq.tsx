import type { FC } from "react";
import { useState, useMemo } from "react";
import { html } from "../../../POLLEN_FAQ.md";

type FAQItem = {
    question: string;
    answer: string;
};

// Parse markdown HTML into FAQ items
const parseFAQFromHTML = (htmlContent: string): FAQItem[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const items: FAQItem[] = [];
    
    const h2Elements = doc.querySelectorAll("h2");
    
    h2Elements.forEach((h2) => {
        const question = h2.textContent || "";
        const answerParts: string[] = [];
        
        let nextElement = h2.nextElementSibling;
        while (nextElement && nextElement.tagName !== "H2") {
            answerParts.push(nextElement.outerHTML);
            nextElement = nextElement.nextElementSibling;
        }
        
        if (question) {
            items.push({
                question,
                answer: answerParts.join(""),
            });
        }
    });
    
    return items;
};

const faqData = parseFAQFromHTML(html);

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
