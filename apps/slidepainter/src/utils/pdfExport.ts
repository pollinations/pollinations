import { PDFDocument } from 'pdf-lib';
import type { ClientImageConfig } from './clientImageConfig';
import { RENDER_SIZE_PRESETS } from './clientImageConfig';
import type { RenderSize } from './clientImageConfig';

const MAX_PT = 720; // 10 inches on longest side

export async function exportSlidesPdf(config: ClientImageConfig): Promise<void> {
  const sections = [...config.sections].sort((a, b) => a.order - b.order);

  const slidesWithImages = sections.filter(s => {
    const images = config.imageSelections[s.id];
    return images && images.length > 0 && images[0];
  });

  if (slidesWithImages.length === 0) {
    throw new Error('No slides with images to export');
  }

  const doc = await PDFDocument.create();

  for (let i = 0; i < slidesWithImages.length; i++) {
    const section = slidesWithImages[i];
    const imageUrl = config.imageSelections[section.id][0];
    const preset = RENDER_SIZE_PRESETS[(section.renderSize as RenderSize) || '1024x1024']
      || RENDER_SIZE_PRESETS['1024x1024'];
    const scale = MAX_PT / Math.max(preset.width, preset.height);
    const w = preset.width * scale;
    const h = preset.height * scale;

    const page = doc.addPage([w, h]);

    try {
      const response = await fetch(imageUrl);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || '';

      const image = contentType.includes('png')
        ? await doc.embedPng(bytes)
        : await doc.embedJpg(bytes);

      page.drawImage(image, { x: 0, y: 0, width: w, height: h });
    } catch (error) {
      console.warn(`Failed to fetch image for slide ${i + 1}:`, error);
    }
  }

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'slides.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
