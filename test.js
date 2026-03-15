const dom = require("jsdom");
const { JSDOM } = dom;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const data = { title: "Test", html: "<h1>Test</h1>" };
const encoded = escapeHtml(JSON.stringify(data));
const htmlStr = `<div id="test" data-preview='${encoded}'></div>`;

const domInstance = new JSDOM(htmlStr);
const div = domInstance.window.document.getElementById("test");
console.log("dataset.preview:", div.dataset.preview);
try {
  console.log("Parsed:", JSON.parse(div.dataset.preview));
} catch(e) {
  console.error("Error:", e);
}
