// Import the HTML generator from the client folder
import { generateHTML } from './client/html';

// Generate the HTML for the test client
const TEST_CLIENT_HTML = generateHTML();

module.exports = { TEST_CLIENT_HTML };
