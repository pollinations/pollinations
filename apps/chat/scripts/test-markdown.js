import assert from "node:assert/strict";
import {
    formatMessage,
    formatStreamingMessage,
} from "../src/utils/markdown.js";

const chartData = {
    type: "chart",
    chartType: "bar",
    title: "Q1 Sales",
    data: {
        labels: ["Jan", "Feb"],
        datasets: [{ label: "Sales", data: [100, 150] }],
    },
};
const message = `Here is the chart:\n\n__CHART__${JSON.stringify(chartData)}__CHART__`;
const html = formatMessage(message);
assert.match(html, /data-charts=/);

const streamingHtml = formatStreamingMessage("[x](javascript:alert(1))");
assert.equal(streamingHtml.includes("javascript:"), false);
assert.match(streamingHtml, /href="#"/);

const dataUrlHtml = formatStreamingMessage(
    "[x](data:text/html,<script>alert(1)</script>)",
);
assert.equal(dataUrlHtml.includes("data:text/html"), false);
assert.match(dataUrlHtml, /href="#"/);

const normalLinkHtml = formatStreamingMessage("[x](https://example.test)");
assert.match(normalLinkHtml, /href="https:\/\/example\.test"/);

console.log("markdown formatter checks passed");
