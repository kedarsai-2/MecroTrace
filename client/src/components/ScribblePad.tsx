import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, PenLine, RotateCcw, Minus, Plus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  recognizeHandwriting,
  getHandwritingRecognitionDebounceMs,
  type HandwritingStroke,
} from '@/lib/handwritingRecognition';

interface ScribblePadProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (initials: string, quantity: number) => void;
}

type Stroke = HandwritingStroke;

const ScribblePad = ({ open, onClose, onConfirm }: ScribblePadProps) => {
  const [initials, setInitials] = useState('');
  const [quantity, setQuantity] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeStatus, setRecognizeStatus] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [drawingPreview, setDrawingPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const drawTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStroke = useRef<Stroke>({ xs: [], ys: [], ts: [] });
  const strokeStartTime = useRef(0);
  const recognitionAbortRef = useRef<AbortController | null>(null);
  const recognitionGenerationRef = useRef(0);
  const [canvasHeight, setCanvasHeight] = useState(320);

  const abortRecognition = useCallback(() => {
    recognitionAbortRef.current?.abort();
    recognitionAbortRef.current = null;
  }, []);

  // Canvas height: mobile/tablet 320px, desktop 280px; update on resize
  useEffect(() => {
    const update = () => setCanvasHeight(window.innerWidth >= 1024 ? 280 : 320);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Resize canvas to match container
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = canvasHeight;
    };
    const t = setTimeout(resize, 50);
    window.addEventListener('resize', resize);
    return () => { clearTimeout(t); window.removeEventListener('resize', resize); };
  }, [open, canvasHeight]);

  const doRecognition = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;

    abortRecognition();
    const myGen = ++recognitionGenerationRef.current;
    const ac = new AbortController();
    recognitionAbortRef.current = ac;
    const strokesSnapshot = strokesRef.current.map(s => ({
      xs: [...s.xs],
      ys: [...s.ys],
      ts: [...s.ts],
    }));

    setRecognizing(true);
    setRecognizeStatus('Recognizing...');
    setCandidates([]);
    setDrawingPreview(null);

    try {
      const results = await recognizeHandwriting(
        strokesSnapshot,
        canvas.width,
        canvas.height,
        ac.signal
      );

      if (ac.signal.aborted) return;

      if (results.length > 0) {
        const best = results[0].trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
        if (best) {
          setInitials(best.slice(0, 5));
          setRecognizeStatus(`Detected: ${best.slice(0, 5)}`);
          const alts = results.slice(0, 5)
            .map(r => r.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, ''))
            .filter((r, i, arr) => r && arr.indexOf(r) === i)
            .slice(0, 4);
          setCandidates(alts);
          setDrawingPreview(canvas.toDataURL('image/jpeg', 0.82));
        } else {
          setRecognizeStatus('Could not detect — type manually');
        }
      } else {
        setRecognizeStatus('Could not detect — type manually');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('Handwriting recognition failed:', err);
      setRecognizeStatus('Recognition failed — type manually');
    } finally {
      if (myGen === recognitionGenerationRef.current) setRecognizing(false);
    }
  }, [abortRecognition]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    abortRecognition();
    isDrawing.current = true;
    const pos = getPos(e);
    lastPos.current = pos;
    strokeStartTime.current = Date.now();
    currentStroke.current = { xs: [pos.x], ys: [pos.y], ts: [0] };
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
    setRecognizeStatus('');
    setCandidates([]);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#7B61FF';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(123, 97, 255, 0.3)';
    ctx.shadowBlur = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    lastPos.current = pos;

    // Record stroke data
    currentStroke.current.xs.push(pos.x);
    currentStroke.current.ys.push(pos.y);
    currentStroke.current.ts.push(Date.now() - strokeStartTime.current);
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    // Save completed stroke
    if (currentStroke.current.xs.length > 1) {
      strokesRef.current.push({ ...currentStroke.current });
    }
    currentStroke.current = { xs: [], ys: [], ts: [] };

    // Auto-recognize shortly after user lifts pen.
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
    drawTimeout.current = setTimeout(() => {
      doRecognition();
    }, getHandwritingRecognitionDebounceMs());
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    currentStroke.current = { xs: [], ys: [], ts: [] };
    setDrawingPreview(null);
    setInitials('');
    setRecognizeStatus('');
    setCandidates([]);
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
    abortRecognition();
  };

  const adjustQty = (delta: number) => {
    const current = parseInt(quantity) || 0;
    const next = Math.max(1, current + delta);
    setQuantity(String(next));
  };

  const handleConfirm = () => {
    if (!initials.trim() || !quantity || parseInt(quantity) <= 0) return;
    onConfirm(initials.trim().toUpperCase(), parseInt(quantity));
    setInitials('');
    setQuantity('');
    setDrawingPreview(null);
    strokesRef.current = [];
    setRecognizeStatus('');
    setCandidates([]);
    clearCanvas();
  };

  const handleClose = () => {
    setInitials('');
    setQuantity('');
    setDrawingPreview(null);
    strokesRef.current = [];
    setRecognizeStatus('');
    setCandidates([]);
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
    abortRecognition();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            ref={containerRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-[540px] bg-card/95 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-white/20 overflow-hidden max-h-[90dvh] overflow-y-auto"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-muted-foreground/25" />
            </div>

            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <PenLine className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-lg">Scribble Pad</h3>
                    <p className="text-[11px] text-muted-foreground">Draw buyer mark · Auto-recognized</p>
                  </div>
                </div>
                <button onClick={handleClose} className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Canvas area */}
              <div className="relative mb-3 rounded-2xl overflow-hidden border-2 border-dashed border-violet-400/30 bg-white dark:bg-slate-50">
                <canvas
                  ref={canvasRef}
                  className="w-full touch-none cursor-crosshair"
                  style={{ height: canvasHeight }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={endDraw}
                />
                <button
                  onClick={clearCanvas}
                  className="absolute top-2.5 right-2.5 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-sm border border-border/30"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <p className="absolute bottom-2.5 left-3 text-[11px] text-muted-foreground/40 italic pointer-events-none select-none">
                  ✎ Write initials clearly · Auto-reads when you stop
                </p>
              </div>

              {/* Recognized result */}
              <div className="mb-4 rounded-xl bg-muted/30 border border-violet-400/15 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recognized Mark</p>
                  {recognizing ? (
                    <div className="flex items-center gap-1.5 text-violet-500">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-[10px] font-medium">{recognizeStatus || 'Reading...'}</span>
                    </div>
                  ) : recognizeStatus ? (
                    <span className="text-[10px] font-medium text-muted-foreground">{recognizeStatus}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {drawingPreview ? (
                    <div className="w-14 h-14 rounded-xl bg-white dark:bg-card border border-violet-400/20 overflow-hidden flex-shrink-0">
                      <img src={drawingPreview} alt="Drawn mark" className="w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-muted/40 border border-dashed border-muted-foreground/20 flex items-center justify-center flex-shrink-0">
                      <PenLine className="w-5 h-5 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="flex-1">
                    <Input
                      value={initials}
                      onChange={e => setInitials(e.target.value.toUpperCase())}
                      placeholder="Auto-detected or type"
                      maxLength={5}
                      className="h-14 rounded-2xl text-center text-2xl font-bold tracking-[0.25em] bg-white/60 dark:bg-card/60 border-violet-400/20 focus:border-violet-400 focus:ring-violet-400/30"
                    />
                  </div>
                </div>

                {/* Alternate candidates */}
                {candidates.length > 1 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 pt-2 border-t border-border/20"
                  >
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Did you mean?
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {candidates.map(c => (
                        <button
                          key={c}
                          onClick={() => { setInitials(c.slice(0, 5)); setRecognizeStatus(`Selected: ${c.slice(0, 5)}`); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            initials === c
                              ? 'bg-violet-500 text-white shadow-md'
                              : 'bg-muted/50 text-foreground hover:bg-muted'
                          }`}
                        >
                          {c.slice(0, 5)}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Quantity */}
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Quantity (Bags)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => adjustQty(-1)}
                    className="w-14 h-14 rounded-l-2xl bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors flex-shrink-0"
                  >
                    <Minus className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder="0"
                    min={1}
                    className="h-14 rounded-none text-center text-2xl font-bold bg-muted/30 border-violet-400/20 focus:border-violet-400 focus:ring-violet-400/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => adjustQty(1)}
                    className="w-14 h-14 rounded-r-2xl bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors flex-shrink-0"
                  >
                    <Plus className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  onClick={handleConfirm}
                  disabled={!initials.trim() || !quantity || parseInt(quantity) <= 0 || recognizing}
                  className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-base shadow-lg shadow-violet-500/25 disabled:opacity-40"
                >
                  <Check className="w-5 h-5 mr-2" /> Add Entry
                </Button>
                <Button onClick={handleClose} variant="outline" className="h-14 rounded-2xl px-6 text-base">
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ScribblePad;
