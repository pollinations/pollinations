import type { FC } from "react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import faqMarkdown from "../../../POLLEN_FAQ.md?raw";

type FAQItem = {
    question: string;
    answer: string;
};

// Parse markdown content into FAQ items
const parseFAQFromMarkdown = (markdown: string): FAQItem[] => {
    const items: FAQItem[] = [];
    const lines = markdown.split("\n");
    
    let currentQuestion = "";
    let currentAnswer: string[] = [];
    
    for (const line of lines) {
        // Check if line is a H2 heading (question)
        if (line.startsWith("## ")) {
            // Save previous FAQ item if exists
            if (currentQuestion && currentAnswer.length > 0) {
                items.push({
                    question: currentQuestion,
                    answer: currentAnswer.join("\n").trim(),
                });
            }
            // Start new question
            currentQuestion = line.replace("## ", "").trim();
            currentAnswer = [];
        } else if (currentQuestion) {
            // Add to current answer
            currentAnswer.push(line);
        }
    }
    
    // Don't forget the last item
    if (currentQuestion && currentAnswer.length > 0) {
        items.push({
            question: currentQuestion,
            answer: currentAnswer.join("\n").trim(),
        });
    }
    
    return items;
};

const faqData = parseFAQFromMarkdown(faqMarkdown);

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
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="font-bold flex-1">FAQ</h2>
                <div className="flex gap-3">
                    <a 
                        href="https://github.com/pollinations/pollinations/blob/master/enter.pollinations.ai/POLLEN_FAQ.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full px-[14px] pt-[4px] pb-[6px] bg-purple-200 text-purple-900 font-medium hover:bg-purple-300 transition-colors cursor-pointer"
                    >
                        View on GitHub
                    </a>
                </div>
            </div>
            <div className="bg-emerald-100 rounded-2xl p-8 border border-pink-300">
                <div className="flex flex-col gap-4">
                    {faqData.map((item, index) => (
                        <div key={index} className="pb-4 last:pb-0">
                            <button
                                onClick={() => toggleQuestion(index)}
                                className="w-full text-left flex justify-between items-start gap-4 text-green-950 hover:text-green-800 transition-colors"
                            >
                                <span className="flex-1 text-pink-500" style={{ fontWeight: 700 }}>{item.question}</span>
                                <span className="text-2xl flex-shrink-0 font-normal">{openIndices.has(index) ? "−" : "+"}</span>
                            </button>
                            {openIndices.has(index) && (
                                <div className="mt-3 text-gray-600 leading-relaxed prose prose-sm max-w-none prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-2 prose-li:text-gray-600 prose-p:mb-3 prose-a:text-purple-600 prose-a:underline prose-a:font-medium hover:prose-a:text-purple-800">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {item.answer}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
