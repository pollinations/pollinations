import { formatMessage } from '../src/utils/markdown.js';

const chartData = {
  type: 'chart',
  chartType: 'bar',
  title: 'Q1 Sales',
  data: { labels: ['Jan','Feb'], datasets: [{ label: 'Sales', data: [100,150] } ] }
};
const message = `Here is the chart:\n\n__CHART__${JSON.stringify(chartData)}__CHART__`;
const html = formatMessage(message);
console.log('rendered HTML snippet:\n', html);
