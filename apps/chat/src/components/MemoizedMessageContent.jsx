import React, { memo, useEffect, useRef } from "react";
import { formatMessage } from "../utils/markdown";
import ChartRenderer from "./ChartRenderer";

const MemoizedMessageContent = memo(({ content }) => {
    const html = formatMessage(content);
    const containerRef = useRef(null);
    const [charts, setCharts] = React.useState([]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: content prop change triggers re-render and should re-run DOM mutation
    useEffect(() => {
        if (containerRef.current) {
            // Add copy buttons to code blocks
            const blocks =
                containerRef.current.querySelectorAll("pre.code-block");
            for (const block of blocks) {
                if (block.querySelector(".copy-btn")) continue;
                const btn = document.createElement("button");
                btn.className = "copy-btn";
                btn.innerHTML = "📋 Copy";
                btn.onclick = () => {
                    const codeEl = block.querySelector("code");
                    if (codeEl) {
                        navigator.clipboard
                            .writeText(codeEl.innerText)
                            .then(() => {
                                btn.innerHTML = "✅ Copied!";
                                setTimeout(() => {
                                    btn.innerHTML = "📋 Copy";
                                }, 2000);
                            })
                            .catch((err) => {
                                if (window?.showToast)
                                    window.showToast(
                                        `Failed to copy: ${err.message}`,
                                        "error",
                                    );
                            });
                    }
                };
                block.style.position = "relative";
                block.appendChild(btn);
            }

            // Parse chart data
            const chartDiv =
                containerRef.current.querySelector("[data-charts]");
            if (chartDiv) {
                const chartsAttr = chartDiv.getAttribute("data-charts");
                if (chartsAttr) {
                    try {
                        const parsedCharts = JSON.parse(
                            chartsAttr.replace(/&apos;/g, "'"),
                        );
                        setCharts(parsedCharts);
                        chartDiv.remove(); // Remove the data div from DOM
                    } catch (e) {
                        console.error("Failed to parse charts attribute:", e);
                    }
                }
            }
        }
    }, [content]);

    return (
        <>
            <div
                ref={containerRef}
                dangerouslySetInnerHTML={{ __html: html }}
            />
            {charts.map((chartData, index) => (
                <ChartRenderer
                    key={`${chartData.output?.title ?? "chart"}-${index}`}
                    chartData={chartData}
                />
            ))}
        </>
    );
});

export default MemoizedMessageContent;
