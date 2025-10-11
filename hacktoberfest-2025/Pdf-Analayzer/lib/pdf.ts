import PDFParser from "pdf2json";

export default async function extractChunksFromPDF(fileBuffer: Buffer) {
  return new Promise<{ id: string; text: string }[]>((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataReady", () => {
      // Get the full text from the parsed PDF
      const text = pdfParser.getRawTextContent();

      // Chunk the text
      const chunks = text
        .split(/\n\s*\n/)
        .filter((chunk) => chunk.trim().length > 30)
        .map((text, idx) => ({ id: `chunk_${idx}`, text: text.trim() }));

      resolve(chunks);
    });

    pdfParser.on("pdfParser_dataError", (err) => reject(err));

    // Parse directly from buffer
    pdfParser.parseBuffer(fileBuffer);
  });
}
