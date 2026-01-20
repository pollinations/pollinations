import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar, Pie, Scatter } from 'react-chartjs-2';
import './ChartRenderer.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

const getCssVariable = (name, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const styles = getComputedStyle(document.body);
  const value = styles.getPropertyValue(name);
  return value ? value.trim() : fallback;
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  let value = hex.replace('#', '').trim();
  if (![3, 4, 6, 8].includes(value.length)) return null;
  if (value.length === 3 || value.length === 4) {
    value = value.split('').map(ch => ch + ch).join('');
  }
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b };
};

const withAlpha = (color, alpha) => {
  if (!color) return `rgba(255, 255, 255, ${alpha})`;
  const trimmed = color.trim();
  if (trimmed.toLowerCase() === 'transparent') return 'transparent';

  const rgbaMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map(part => part.trim());
    const [r, g, b] = parts;
    const red = Number(r);
    const green = Number(g);
    const blue = Number(b);
    if ([red, green, blue].some(Number.isNaN)) return trimmed;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  if (trimmed.startsWith('#')) {
    const rgb = hexToRgb(trimmed);
    if (!rgb) return trimmed;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  return trimmed;
};

const ChartRenderer = ({ chartData }) => {
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // Simulate a brief loading state for better UX
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [chartData]);

  if (!chartData) return null;

  // Support both old format and new Nuxt-style format
  const isNuxtFormat = chartData.output && chartData.output.data;
  const resolvedType = isNuxtFormat
    ? chartData.output.chartType || chartData.output.type
    : chartData.chartType || chartData.type;
  const normalizedType = ['line', 'bar', 'pie', 'scatter'].includes(resolvedType)
    ? resolvedType
    : 'line';

  const { chartType, title, data } = isNuxtFormat ? {
    chartType: normalizedType,
    title: chartData.output.title,
    data: chartData.output
  } : chartData;

  if (!data) return null;

  const effectiveChartType = chartType || 'line';
  const textPrimary = getCssVariable('--text-primary', '#1f2937');
  const textSecondary = getCssVariable('--text-secondary', '#64748b');
  const gridColorBase = getCssVariable('--border-color', 'rgba(148, 163, 184, 0.25)');
  const gridColor = withAlpha(gridColorBase, 0.2);

  ChartJS.defaults.color = textSecondary;
  ChartJS.defaults.borderColor = gridColor;
  ChartJS.defaults.font.family = 'Inter, "SF Pro Text", "Segoe UI", system-ui, sans-serif';

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: textPrimary,
          padding: 15,
          font: {
            size: 13
          }
        }
      },
      title: {
        display: !!title,
        text: title,
        color: textPrimary,
        font: {
          size: 18,
          weight: 'bold'
        },
        padding: {
          top: 10,
          bottom: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        padding: 12,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        }
      }
    },
    scales: effectiveChartType !== 'pie' ? {
      x: {
        title: {
          display: !!data.xLabel,
          text: data.xLabel || '',
          color: textSecondary,
          font: {
            size: 13,
            weight: 'bold'
          }
        },
        ticks: { 
          color: textSecondary,
          font: {
            size: 12
          }
        },
        grid: { 
          color: gridColor,
          drawBorder: false
        }
      },
      y: {
        title: {
          display: !!data.yLabel,
          text: data.yLabel || '',
          color: textSecondary,
          font: {
            size: 13,
            weight: 'bold'
          }
        },
        ticks: { 
          color: textSecondary,
          font: {
            size: 12
          }
        },
        grid: { 
          color: gridColor,
          drawBorder: false
        }
      }
    } : undefined
  };

  // Prepare chart data with colors
  let preparedData;

  if (isNuxtFormat) {
    // Nuxt-style format: data is array of objects, series define the keys
    const { data: chartData, series, xKey } = data;
    const labels = chartData.map(item => item[xKey] || '');
    
    preparedData = {
      labels,
      datasets: series.map((serie, index) => {
        const colors = [
          'rgba(74, 222, 128, 0.8)',
          'rgba(96, 165, 250, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(244, 114, 182, 0.8)',
          'rgba(165, 180, 252, 0.8)',
          'rgba(251, 191, 36, 0.8)'
        ];
        const color = serie.color || colors[index % colors.length];
        
        return {
          label: serie.name,
          data: chartData.map(item => item[serie.key] || 0),
          backgroundColor: color,
          borderColor: color.replace('0.8', '1'),
          borderWidth: 2,
          tension: 0.3
        };
      })
    };
  } else {
    // Original format: data.labels and data.datasets
    preparedData = {
      labels: data.labels,
      datasets: data.datasets.map((dataset, index) => {
        const colors = [
          'rgba(74, 222, 128, 0.8)',
          'rgba(96, 165, 250, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(244, 114, 182, 0.8)',
          'rgba(165, 180, 252, 0.8)',
          'rgba(251, 191, 36, 0.8)'
        ];
        const color = colors[index % colors.length];
        
        return {
          ...dataset,
          backgroundColor: effectiveChartType === 'pie' 
            ? colors.map(c => c.replace('0.8', '0.6'))
            : color,
          borderColor: color.replace('0.8', '1'),
          borderWidth: 2,
          tension: effectiveChartType === 'line' ? 0.3 : 0
        };
      })
    };
  }

  const renderChart = () => {
    switch (effectiveChartType) {
      case 'line':
        return <Line options={chartOptions} data={preparedData} />;
      case 'bar':
        return <Bar options={chartOptions} data={preparedData} />;
      case 'pie':
        return <Pie options={chartOptions} data={preparedData} />;
      case 'scatter':
        return <Scatter options={chartOptions} data={preparedData} />;
      default:
        return <div>Unsupported chart type: {chartType}</div>;
    }
  };

  return (
    <div className="chart-container">
      <div className="chart-wrapper">
        {isLoading ? (
          <div className="chart-loading">
            <div className="chart-loading-spinner"></div>
            <span>Preparing chart...</span>
          </div>
        ) : (
          renderChart()
        )}
      </div>
    </div>
  );
};

export default ChartRenderer;
