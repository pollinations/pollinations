const fs = require('fs');
const path = './apps/chat/src/components/ChatInput.jsx';
let code = fs.readFileSync(path, 'utf8');

const target = `<div className="chatbar-left">`;

const modeToggles = `
                            <div className="mode-quick-toggles">
                                <button type="button" className={\`mode-toggle-btn \${!isImagineMode && !isVideoMode && !isCanvasMode ? 'active' : ''}\`} onClick={() => {
                                    setInputValue(inputValue.replace(/\\/(imagine|video|code)\\s*/g, ''));
                                    if (onModeChange) onModeChange('chat');
                                }} title="Chat Mode">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                </button>
                                <button type="button" className={\`mode-toggle-btn \${isImagineMode ? 'active' : ''}\`} onClick={() => {
                                    handleImageGen();
                                }} title="Image Mode">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                                </button>
                                <button type="button" className={\`mode-toggle-btn \${isVideoMode ? 'active' : ''}\`} onClick={() => {
                                    handleVideoGen();
                                }} title="Video Mode">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,9 16,12 10,15"/></svg>
                                </button>
                                <button type="button" className={\`mode-toggle-btn \${isCanvasMode ? 'active' : ''}\`} onClick={() => {
                                    setInputValue("/code ");
                                    if (onModeChange) onModeChange('code');
                                    inputRef.current?.focus();
                                }} title="Canvas Mode">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M16 13H8m8 4H8m2-8H8" /></svg>
                                </button>
                            </div>
`;

code = code.replace(target, target + modeToggles);
fs.writeFileSync(path, code);
console.log('Added Mode Quick Toggles');
