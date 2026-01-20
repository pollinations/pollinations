import React, { memo, useEffect, useRef } from 'react';
import { formatMessage } from '../utils/markdown';
import ChartRenderer from './ChartRenderer';

const MemoizedMessageContent = memo(({ content }) => {
  const html = formatMessage(content);
  const containerRef = useRef(null);
  const [charts, setCharts] = React.useState([]);

  useEffect(() => {
    if (containerRef.current) {
      const chartDiv = containerRef.current.querySelector('[data-charts]');
      if (chartDiv) {
        const chartsAttr = chartDiv.getAttribute('data-charts');
        if (chartsAttr) {
          try {
            const parsedCharts = JSON.parse(chartsAttr.replace(/&apos;/g, "'"));
            setCharts(parsedCharts);
            chartDiv.remove(); // Remove the data div from DOM
          } catch (e) {
            console.error('Failed to parse charts attribute:', e);
          }
        }
      }
    }
  }, [html]);

  return (
    <>
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
      {charts.map((chartData, index) => (
        <ChartRenderer key={index} chartData={chartData} />
      ))}
    </>
  );
});

export default MemoizedMessageContent;
