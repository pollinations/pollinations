import type { FC } from "react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import faqMarkdown from "../../../POLLEN_FAQ.md?raw";
import { Button } from "./button.tsx";
import { PollenExamples } from "./pricing/pollen-examples.tsx";
import { Card } from "./ui/card.tsx";
import { Panel } from "./ui/panel.tsx";

type FAQItem = {
    question: string;
    answer: string;
};

// Generate URL-friendly slug from question text
const generateSlug = (text: string): string => {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "") // Remove special chars
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/-+/g, "-") // Replace multiple hyphens with single
        .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
        .trim();
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

    // Auto-expand FAQ item when navigating via anchor link
    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.slice(1); // Remove #
            if (hash) {
                const index = faqData.findIndex(
                    (item) => generateSlug(item.question) === hash,
                );
                if (index !== -1) {
                    // Expand the FAQ item
                    setOpenIndices((prev) => {
                        const next = new Set(prev);
                        next.add(index);
                        return next;
                    });

                    // Scroll to the element after a brief delay to ensure it's rendered
                    setTimeout(() => {
                        const element = document.getElementById(hash);
                        if (element) {
                            element.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                            });
                        }
                    }, 500);
                }
            }
        };

        // Check on mount
        handleHashChange();

        // Listen for hash changes
        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, []);

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between gap-3">
                <h2 className="font-bold flex-1">FAQ</h2>
                <div className="flex gap-3">
                    <Button
                        as="a"
                        href="https://github.com/pollinations/pollinations/blob/master/enter.pollinations.ai/POLLEN_FAQ.md"
                        target="_blank"
                        rel="noopener noreferrer"
                        color="violet"
                        weight="light"
                    >
                        View on GitHub
                    </Button>
                </div>
            </div>
            <Panel color="violet" className="p-8">
                <div className="flex flex-col gap-4">
                    {faqData.map((item, index) => {
                        const questionId = generateSlug(item.question);
                        return (
                            <div
                                key={item.question}
                                id={questionId}
                                className="pb-4 last:pb-0 scroll-mt-20"
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleQuestion(index)}
                                    className="w-full text-left flex justify-between items-start gap-4 text-violet-950 hover:text-violet-800 transition-colors"
                                >
                                    <span
                                        className="flex-1 text-pink-500"
                                        style={{ fontWeight: 700 }}
                                    >
                                        {item.question}
                                    </span>
                                    <span className="text-2xl flex-shrink-0 font-normal">
                                        {openIndices.has(index) ? "−" : "+"}
                                    </span>
                                </button>
                                {openIndices.has(index) && (
                                    <Card
                                        color="violet"
                                        bg="bg-white/30"
                                        className="mt-3 text-gray-600 leading-relaxed prose prose-sm max-w-none prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-2 prose-li:text-gray-600 prose-p:mb-3 prose-a:text-purple-600 prose-a:underline prose-a:font-medium hover:prose-a:text-purple-800"
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                        >
                                            {item.answer}
                                        </ReactMarkdown>
                                        {item.question.includes(
                                            "What can I create with Pollen",
                                        ) && <PollenExamples />}
                                    </Card>
                                )}
                            </div>
                        );
                    })}
                </div>
            </Panel>
        </div>
    );
};
