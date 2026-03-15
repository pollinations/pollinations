const fs = require('fs');

const path = './apps/chat/src/components/MessageArea.css';
let code = fs.readFileSync(path, 'utf8');

// Replace fadeIn with slideInUp
code = code.replace(/animation: fadeIn 0.3s ease-out;/, "animation: slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;");

// check if slideInUp exists in globals.css, if not add it
const globalPath = './apps/chat/src/globals.css';
let globals = fs.readFileSync(globalPath, 'utf8');
if (!globals.includes('@keyframes slideInUp')) {
    globals += `
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;
    fs.writeFileSync(globalPath, globals);
}

fs.writeFileSync(path, code);
console.log('Applied slideInUp animation');
