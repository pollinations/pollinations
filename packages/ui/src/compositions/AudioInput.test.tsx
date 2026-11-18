import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AudioInput } from "./AudioInput.tsx";

const clip = new File(["sample"], "sample.wav", { type: "audio/wav" });

it("keeps replacement available in a single-clip field", () => {
    const html = renderToStaticMarkup(
        <AudioInput value={[clip]} onChange={() => {}} maxSizeBytes={1024} />,
    );
    expect(html).toContain("Replace file");
    expect(html).toContain('aria-label="Remove sample.wav"');
    expect(html).not.toContain("multiple");
});

it("offers additional imports only while the multi-clip field has room", () => {
    function render(files: File[]) {
        return renderToStaticMarkup(
            <AudioInput
                value={files}
                onChange={() => {}}
                maxFiles={2}
                maxSizeBytes={1024}
            />,
        );
    }
    expect(render([clip])).toMatch(/<input[^>]*multiple/);
    const full = render([
        clip,
        new File(["second"], "recording.wav", { type: "audio/wav" }),
    ]);
    expect(full).not.toContain('type="file"');
    expect(full).toContain('aria-label="Remove recording.wav"');
});
