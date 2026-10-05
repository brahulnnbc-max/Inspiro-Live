import React, { useRef, useState, useEffect } from 'react';
import { Trash2, Download, Eraser, Pen, Undo } from 'lucide-react';

interface Props {
  className?: string;
}

export const Scratchpad: React.FC<Props> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#38bdf8');
  const [lineWidth, setLineWidth] = useState(2);
  const [mode, setMode] = useState<'pen' | 'eraser'>('pen');
  const [history, setHistory] = useState<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Initial dark slate canvas background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    saveState();
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-10), imgData]);
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = history.slice(0, -1);
    const last = newHistory[newHistory.length - 1];
    if (last) {
      ctx.putImageData(last, 0, 0);
      setHistory(newHistory);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (mode === 'eraser') {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = lineWidth * 5;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    saveState();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);
    saveState();
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `jee-rough-scratchpad-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg ${className}`}>
      {/* Control bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/70 text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMode('pen')}
            className={`p-1.5 rounded transition-colors ${
              mode === 'pen' ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Pen"
          >
            <Pen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode('eraser')}
            className={`p-1.5 rounded transition-colors ${
              mode === 'eraser' ? 'bg-slate-700 text-amber-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Eraser"
          >
            <Eraser className="w-4 h-4" />
          </button>

          {/* Color palette */}
          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            {['#38bdf8', '#34d399', '#fbbf24', '#f87171', '#f1f5f9'].map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  setMode('pen');
                }}
                className={`w-4 h-4 rounded-full border transition-transform ${
                  color === c && mode === 'pen' ? 'scale-125 border-white' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c }}
                title={`Color ${c}`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
            {[2, 4, 6].map((w) => (
              <button
                key={w}
                onClick={() => setLineWidth(w)}
                className={`w-5 h-5 flex items-center justify-center rounded text-[10px] ${
                  lineWidth === w ? 'bg-slate-800 text-white font-bold' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {w}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={history.length <= 1}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:pointer-events-none rounded"
            title="Undo"
          >
            <Undo className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearCanvas}
            className="p-1.5 text-slate-400 hover:text-amber-400 rounded transition-colors"
            title="Clear all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={downloadCanvas}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded transition-colors"
            title="Save PNG"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-[220px] bg-slate-900 cursor-crosshair touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full block"
        />
        <div className="absolute bottom-2 right-3 pointer-events-none text-[10px] text-slate-400 font-mono select-none">
          JEE Rough Workpad
        </div>
      </div>
    </div>
  );
};
