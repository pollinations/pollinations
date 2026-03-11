const fs = require('fs');
const path = './apps/chat/src/components/ChatInput.jsx';
let code = fs.readFileSync(path, 'utf8');

// Update placeholders based on mode
code = code.replace(/placeholder="Type your message here..."/, `placeholder={
                                isImagineMode
                                    ? "Describe the image you want to create..."
                                    : isVideoMode
                                    ? "Describe the video you want to generate..."
                                    : isCanvasMode
                                    ? "What should we code?"
                                    : "Type your message here..."
                            }`);

// Add Close X buttons on the tags
const imageTagMatch = code.match(/<div className="image-mode-tag">[\s\S]*?<span>Image<\/span>\s*<\/div>/);
if (imageTagMatch) {
    const updated = imageTagMatch[0].replace(/<\/div>$/, `  <button className="tag-close-btn" onClick={() => setInputValue(inputValue.replace('/imagine ', '').replace('/imagine', ''))}>×</button></div>`);
    code = code.replace(imageTagMatch[0], updated);
}

const videoTagMatch = code.match(/<div className="video-mode-tag">[\s\S]*?<span>Video<\/span>\s*<\/div>/);
if (videoTagMatch) {
    const updated = videoTagMatch[0].replace(/<\/div>$/, `  <button className="tag-close-btn" onClick={() => setInputValue(inputValue.replace('/video ', '').replace('/video', ''))}>×</button></div>`);
    code = code.replace(videoTagMatch[0], updated);
}

const canvasTagMatch = code.match(/<div className="canvas-mode-tag">[\s\S]*?<span>Canvas<\/span>\s*<\/div>/);
if (canvasTagMatch) {
    const updated = canvasTagMatch[0].replace(/<\/div>$/, `  <button className="tag-close-btn" onClick={() => setInputValue(inputValue.replace('/code ', '').replace('/code', ''))}>×</button></div>`);
    code = code.replace(canvasTagMatch[0], updated);
}

fs.writeFileSync(path, code);
console.log('Patched tags & placeholders');
