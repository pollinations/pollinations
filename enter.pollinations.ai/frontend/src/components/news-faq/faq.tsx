import { Markdown, Surface } from "@pollinations/ui";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { FC } from "react";
import { useEffect, useState } from "react";
import faqMarkdown from "../../../../POLLEN_FAQ.md?raw";
import { PollenExamples } from "../models/pollen-examples.tsx";

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

type FAQProps = {
    showTitle?: boolean;
};

export const FAQ: FC<FAQProps> = ({ showTitle = true }) => {
    const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());
    const hash = useRouterState({ select: (state) => state.location.hash });
    const navigate = useNavigate();

    const toggleQuestion = (index: number) => {
        const slug = generateSlug(faqData[index]?.question ?? "");
        const isOpen = openIndices.has(index);
        setOpenIndices((prev) => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
        if (!isOpen || hash === slug) {
            void navigate({
                to: "/news",
                hash: isOpen ? "" : slug,
            });
        }
    };

    // Auto-expand FAQ item when navigating via anchor link
    useEffect(() => {
        if (!hash) return;
        const index = faqData.findIndex(
            (item) => generateSlug(item.question) === hash,
        );
        if (index === -1) return;

        setOpenIndices((prev) => new Set(prev).add(index));
        const timeout = window.setTimeout(() => {
            document.getElementById(hash)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }, 500);
        return () => window.clearTimeout(timeout);
    }, [hash]);

    return (
        <>
            {showTitle && (
                <h2 className="px-1 text-left text-lg font-semibold text-theme-text-strong sm:text-xl">
                    FAQ
                </h2>
            )}
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
                                className="w-full text-left flex justify-between items-start gap-4 text-theme-text-soft hover:text-theme-text-strong transition-colors"
                            >
                                <span className="flex-1">{item.question}</span>
                                <span className="text-2xl flex-shrink-0 font-normal">
                                    {openIndices.has(index) ? "−" : "+"}
                                </span>
                            </button>
                            {openIndices.has(index) && (
                                <Surface
                                    variant="card"
                                    className="mt-3 flex flex-col gap-3 text-theme-text-base"
                                >
                                    <Markdown>{item.answer}</Markdown>
                                    {item.question.includes(
                                        "What can I create with Pollen",
                                    ) && <PollenExamples />}
                                </Surface>
                            )}
                        </div>
                    );
                })}
            </div>
        </>
    );
};
