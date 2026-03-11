const fs = require('fs');

const path = './apps/chat/src/components/MessageArea.jsx';
let code = fs.readFileSync(path, 'utf8');

// Add import
code = code.replace(/import ThinkingProcess from '\.\/ThinkingProcess';/, "import ThinkingProcess from './ThinkingProcess';\nimport MediaLightbox from './MediaLightbox';");

// Add state for lightbox
code = code.replace(/const \[expandedErrors, setExpandedErrors\] = useState\(\{\}\);/, "const [expandedErrors, setExpandedErrors] = useState({});\n  const [lightboxData, setLightboxData] = useState({ isOpen: false, src: null, type: 'image' });");

// Update image click
code = code.replace(/<img\s*src=\{message.imageUrl\}\s*alt=\{message.imagePrompt \|\| 'Generated image'\}\s*className="message-image"\s*loading="lazy"\s*\/>/, 
  `<img src={message.imageUrl} alt={message.imagePrompt || 'Generated image'} className="message-image cursor-pointer" loading="lazy" onClick={() => setLightboxData({ isOpen: true, src: message.imageUrl, type: 'image' })} style={{cursor: 'pointer'}} />`
);

// Update video click
code = code.replace(/<video\s*src=\{message.videoUrl\}\s*controls\s*className="message-video"\s*loop=\{false\}\s*\/>/g, 
  `<video src={message.videoUrl} controls className="message-video cursor-pointer" loop={false} onClick={(e) => { e.preventDefault(); setLightboxData({ isOpen: true, src: message.videoUrl, type: 'video' }); }} style={{cursor: 'pointer'}} />`
);

// Render lightbox at bottom
code = code.replace(/<\/main>/, `<MediaLightbox isOpen={lightboxData.isOpen} src={lightboxData.src} type={lightboxData.type} onClose={() => setLightboxData({ isOpen: false, src: null, type: 'image' })} />\n    </main>`);

fs.writeFileSync(path, code);
console.log("Patched MessageArea with Lightbox!");
