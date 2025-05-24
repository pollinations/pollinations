// Import file system module to read the HTML file
import * as fs from 'fs';
import * as path from 'path';

// Read the HTML file
const htmlPath = path.join(__dirname, 'test-client.html');
const TEST_CLIENT_HTML = fs.readFileSync(htmlPath, 'utf-8');

module.exports = { TEST_CLIENT_HTML };
