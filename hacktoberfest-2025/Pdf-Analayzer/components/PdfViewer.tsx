"use client";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { useEffect, useRef } from "react";

GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

export default function PdfViewer({ file }: { file: File }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const hasRendered = useRef(false);

    useEffect(() => {
        if (!file || file.size === 0) return;
        if (hasRendered.current) return; 

        hasRendered.current = true; 
        const container = containerRef.current;
        if (!container) return;

        const renderPDF = async () => {
            container.innerHTML = ""; 

            // Render PDF
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await getDocument({ data: arrayBuffer }).promise;

            // Render each page
            for (let i = 1; i <= pdf.numPages; i++) {
                // Render page
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.2 });

                // Create canvas
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d")!;
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // Render page
                await page.render({ canvasContext: context, viewport }).promise;

                // Add canvas to container
                canvas.id = `page_${i}`;
                container.appendChild(canvas);
            }
        };
        // Render PDF
        renderPDF();

        return () => {
            // Clear on unmount
            if (container) container.innerHTML = "";
        };
    }, [file]);

    return (
        // Render PDF
        <div
            ref={containerRef}
            className="pdf-container overflow-auto h-full shadow-xl"
        />
    );
}
