import React, { useState, useRef, useEffect } from 'react';
import './CanvasCodeGenerator.css';

const CanvasCodeGenerator = ({ onCodeGenerated, onClose }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [generatedCode, setGeneratedCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setGeneratedCode('');
    setShowCode(false);
  };

  const generateCode = async () => {
    setIsGenerating(true);
    
    try {
      // In a real implementation, this would send the canvas data to an API
      // For now, we'll simulate with a timeout
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Get canvas data
      const canvas = canvasRef.current;
      const dataUrl = canvas.toDataURL('image/png');
      
      // Simulate code generation based on the drawing
      const mockCode = `// Generated code from your drawing
function drawPattern() {
  const canvas = document.getElementById('myCanvas');
  const ctx = canvas.getContext('2d');
  
  // Set background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw your pattern
  ctx.strokeStyle = '${color}';
  ctx.lineWidth = ${brushSize};
  ctx.lineCap = 'round';
  
  // Add your drawing logic here
  // This is a placeholder for your actual drawing
  ctx.beginPath();
  ctx.moveTo(50, 50);
  ctx.lineTo(200, 100);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(150, 150, 50, 0, 2 * Math.PI);
  ctx.stroke();
}

// Call the function to draw
drawPattern();`;
      
      setGeneratedCode(mockCode);
      setShowCode(true);
      onCodeGenerated(mockCode);
    } catch (error) {
      console.error('Error generating code:', error);
      setGeneratedCode('// Error generating code. Please try again.');
      setShowCode(true);
      // Show toast notification for error
      if (window?.showToast) window.showToast("Error generating code: " + error.message, "error");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="canvas-code-generator">
      <div className="canvas-header">
        <h2>Canvas Code Generator</h2>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      
      <div className="canvas-controls">
        <div className="control-group">
          <label>Color:</label>
          <input 
            type="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)} 
          />
        </div>
        
        <div className="control-group">
          <label>Brush Size:</label>
          <input 
            type="range" 
            min="1" 
            max="20" 
            value={brushSize} 
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span>{brushSize}px</span>
        </div>
        
        <div className="control-group">
          <button onClick={clearCanvas}>Clear Canvas</button>
          <button 
            onClick={generateCode} 
            disabled={isGenerating}
            className="generate-btn"
          >
            {isGenerating ? 'Generating...' : 'Generate Code'}
          </button>
        </div>
      </div>
      
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={600}
          height={400}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          className="drawing-canvas"
        />
      </div>
      
      {showCode && (
        <div className="code-output">
          <h3>Generated Code:</h3>
          <pre className="code-block">
            <code>{generatedCode}</code>
          </pre>
          <button 
            onClick={() => navigator.clipboard.writeText(generatedCode)}
            className="copy-btn"
          >
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
};

export default CanvasCodeGenerator;