const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Input file
const inputPath = process.argv[2];
console.log(`Input path: ${inputPath}`);
if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('❌ Please provide a valid CSV file path.');
  process.exit(1);
}

async function readCSV(filePath) {
  const x = [], y = [];
  console.log(`Reading CSV file: ${filePath}`);

  return new Promise((resolve) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const keys = Object.keys(row);
        console.log(`Row: ${JSON.stringify(row)}`);
        x.push(row[keys[0]]);
        y.push(parseFloat(row[keys[1]]));
      })
      .on('end', () => {
        console.log(`Finished reading CSV. Data points: ${x.length}`);
        resolve({ x, y });
      })
      .on('error', (err) => {
        console.error(`Error reading CSV: ${err.message}`);
        resolve({ x: [], y: [] });
      });
  });
}

function createSVG(x, y) {
  // SVG dimensions
  const width = 800;
  const height = 400;
  const margin = { top: 30, right: 40, bottom: 60, left: 60 };
  const graphWidth = width - margin.left - margin.right;
  const graphHeight = height - margin.top - margin.bottom;
  
  // Find min and max values
  const maxY = Math.max(...y);
  const minY = 0; // Start from zero
  
  // Set fixed max Y value to 5M for consistent scale
  const fixedMaxY = 5000000;
  
  // Calculate scales
  const xScale = graphWidth / (x.length - 1);
  const yScale = graphHeight / fixedMaxY;
  
  // Create SVG path
  let pathData = '';
  for (let i = 0; i < x.length; i++) {
    const xPos = margin.left + (i * xScale);
    const yPos = height - margin.bottom - (y[i] * yScale);
    
    if (i === 0) {
      pathData += `M ${xPos} ${yPos}`;
    } else {
      pathData += ` L ${xPos} ${yPos}`;
    }
  }
  
  // Create x-axis ticks with month labels (Nov 2024 to Apr 2025)
  const monthIndices = [0, 30, 60, 90, 120, 150, 180]; // Approximate day indices for each month
  const monthLabels = ["Jan 2025", "Feb 2025", "Mar 2025", "Apr 2025", "May 2025"];
  
  let xTicks = '';
  for (let i = 0; i < monthIndices.length - 1; i++) {
    const idx = monthIndices[i];
    if (idx < x.length) {
      const xPos = margin.left + (idx * xScale);
      const yPos = height - margin.bottom;
      xTicks += `
        <line x1="${xPos}" y1="${yPos}" x2="${xPos}" y2="${yPos + 5}" stroke="#555" />
        <text x="${xPos}" y="${yPos + 20}" text-anchor="middle" font-size="13" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${monthLabels[i]}</text>
      `;
    }
  }
  
  // Create y-axis ticks with fixed 1M, 2M, 3M, 4M, 5M markers
  const fixedYValues = [1000000, 2000000, 3000000, 4000000, 5000000];
  let yTicks = '';
  
  for (const value of fixedYValues) {
    const yPos = height - margin.bottom - (value * yScale);
    
    yTicks += `
      <line x1="${margin.left - 5}" y1="${yPos}" x2="${margin.left}" y2="${yPos}" stroke="#555" />
      <text x="${margin.left - 10}" y="${yPos + 5}" text-anchor="end" font-size="13" font-weight="bold" font-family="Arial, Helvetica, sans-serif">${(value / 1000000)}M</text>
    `;
  }
  
  // Build the complete SVG
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
    <!-- Font -->
    <style>
      text {
        font-family: Arial, Helvetica, sans-serif;
        fill: #333;
      }
      .tick-text {
        font-size: 13px;
        font-weight: bold;
      }
    </style>
    
    <!-- Define clip path to prevent overflow -->
    <defs>
      <clipPath id="chart-area">
        <rect x="${margin.left}" y="${margin.top}" width="${graphWidth}" height="${graphHeight}" />
      </clipPath>
    </defs>
    
    <!-- X-Axis -->
    <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#555" stroke-width="1.5" />
    ${xTicks}
    
    <!-- Y-Axis -->
    <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${margin.left}" y2="${margin.top}" stroke="#555" stroke-width="1.5" />
    ${yTicks}
    
    <!-- Data Line - black and bold -->
    <path d="${pathData}" fill="none" stroke="black" stroke-width="3" stroke-linejoin="round" clip-path="url(#chart-area)" />
  </svg>
  `;
  
  return svg;
}

async function createChart() {
  try {
    const { x, y } = await readCSV(inputPath);
    console.log(`X values: ${x.slice(0, 3).join(', ')}...`);
    console.log(`Y values: ${y.slice(0, 3).join(', ')}...`);
    
    if (x.length === 0 || y.length === 0) {
      console.error('❌ No data found in CSV file.');
      return;
    }
    
    // Generate SVG
    console.log('Creating SVG...');
    const svg = createSVG(x, y);
    
    // Write to file
    const base = path.basename(inputPath, path.extname(inputPath));
    const scriptDir = path.dirname(require.main.filename);
    const outputPath = path.join(scriptDir, `${base}.svg`);
    
    console.log(`Writing SVG to: ${outputPath}`);
    fs.writeFileSync(outputPath, svg);
    console.log(`✅ Saved SVG to: ${outputPath}`);
  } catch (error) {
    console.error(`❌ Error creating chart: ${error.message}`);
    console.error(error.stack);
  }
}

createChart();