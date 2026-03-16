const fs = require('fs');

const path = './apps/chat/src/components/MessageArea.jsx';
let code = fs.readFileSync(path, 'utf8');

const scrollLogic = `
  const scrollContainerRef = useRef(null);
  const isUserScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    isUserScrolledUp.current = distanceToBottom > 150;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!isUserScrolledUp.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);
`;

code = code.replace(/  const scrollToBottom = useCallback\(\(\) => {[\s\S]*?\}, \[\]\);/, scrollLogic);

// now add onScroll to the main container, wait what is the main container?
//  <main className="messages-area"
code = code.replace(/<main className="messages-area"/, `<main className="messages-area" ref={scrollContainerRef} onScroll={handleScroll}`);

fs.writeFileSync(path, code);
console.log("Patched Safe Scroll");
