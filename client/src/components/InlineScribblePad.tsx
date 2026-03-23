import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Loader2, Sparkles, PenLine } from 'lucide-react';

interface Stroke {
  xs: number[];
  ys: number[];
  ts: number[];
}

async function recognizeHandwriting(
  strokes: Stroke[],
  canvasWidth: number,
  canvasHeight: number
): Promise<string[]> {
  const ink = strokes.map(s => [s.xs, s.ys, s.ts]);
  const payload = {
    options: 'enable_pre_space',
    requests: [{ writing_guide: { writing_area_width: canvasWidth, writing_area_height: canvasHeight }, ink, language: 'en' }],
  };
  const response = await fetch(
    'https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  if (!response.ok) throw new Error('Recognition request failed');
  const data = await response.json();
  if (data[0] === 'SUCCESS' && data[1]?.[0]?.[1]) return data[1][0][1] as string[];
  return [];
}

/** Max length for a single recognized segment (and replace-mode full mark). Auctions append mode composes up to this length per stroke. */
export const MAX_MARK_LEN = 20;

export type MarkDetectionMeta = { replaceLastSegment?: boolean };

interface InlineScribblePadProps {
  onMarkDetected: (mark: string, meta?: MarkDetectionMeta) => void;
  className?: string;
  canvasHeight?: number;
  /** When this value changes, the canvas is cleared (e.g. after selecting a contact/mark from list). */
  resetTrigger?: number;
  /** Hide status/candidate row for compact dock usage. */
  showStatus?: boolean;
  /** Fill parent height (used in dock to avoid blank area). */
  fillAvailableHeight?: boolean;
  /**
   * When true, each recognition/candidate selection passes one segment to `onMarkDetected`, then the canvas is cleared
   * so the user can add the next stroke. When false (default), behavior replaces the parent mark with the full recognized string.
   */
  appendMode?: boolean;
}

const InlineScribblePad = ({
  onMarkDetected,
  className,
  canvasHeight = 140,
  resetTrigger,
  showStatus = true,
  fillAvailableHeight = false,
  appendMode = false,
}: InlineScribblePadProps) => {
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeStatus, setRecognizeStatus] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selectedMark, setSelectedMark] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const drawTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStroke = useRef<Stroke>({ xs: [], ys: [], ts: [] });
  const strokeStartTime = useRef(0);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = fillAvailableHeight ? rect.height : canvasHeight;
    };
    const t = setTimeout(resize, 50);
    window.addEventListener('resize', resize);
    return () => { clearTimeout(t); window.removeEventListener('resize', resize); };
  }, [canvasHeight, fillAvailableHeight]);

  // Reset canvas when parent signals (e.g. after selecting contact or mark from list)
  useEffect(() => {
    if (resetTrigger === undefined) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    currentStroke.current = { xs: [], ys: [], ts: [] };
    setSelectedMark('');
    setRecognizeStatus('');
    setCandidates([]);
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
  }, [resetTrigger]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    currentStroke.current = { xs: [], ys: [], ts: [] };
    setSelectedMark('');
    setRecognizeStatus('');
    setCandidates([]);
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
  }, []);

  /** Clears ink only; keeps status/candidates so user can pick an alternate in append mode. */
  const clearStrokeInkOnly = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current = [];
    currentStroke.current = { xs: [], ys: [], ts: [] };
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
  }, []);

  const doRecognition = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;
    setRecognizing(true);
    setRecognizeStatus('Recognizing...');
    setCandidates([]);
    try {
      const results = await recognizeHandwriting(strokesRef.current, canvas.width, canvas.height);
      if (results.length > 0) {
        const best = results[0].trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
        if (best) {
          const mark = best.slice(0, MAX_MARK_LEN);
          setSelectedMark(mark);
          setRecognizeStatus(`Detected: ${mark}`);
          onMarkDetected(mark);
          const alts = results.slice(0, 5)
            .map(r => r.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, ''))
            .filter((r, i, arr) => r && arr.indexOf(r) === i)
            .slice(0, 4);
          setCandidates(alts);
          if (appendMode) clearStrokeInkOnly();
        } else {
          setRecognizeStatus('Could not detect');
        }
      } else {
        setRecognizeStatus('Could not detect');
      }
    } catch {
      setRecognizeStatus('Recognition failed');
    } finally {
      setRecognizing(false);
    }
  }, [onMarkDetected, appendMode, clearStrokeInkOnly]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
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
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    currentStroke.current.xs.push(pos.x);
    currentStroke.current.ys.push(pos.y);
    currentStroke.current.ts.push(Date.now() - strokeStartTime.current);
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentStroke.current.xs.length > 1) {
      strokesRef.current.push({ ...currentStroke.current });
    }
    currentStroke.current = { xs: [], ys: [], ts: [] };
    if (drawTimeout.current) clearTimeout(drawTimeout.current);
    drawTimeout.current = setTimeout(() => doRecognition(), 800);
  };

  const selectCandidate = (c: string) => {
    const mark = c.slice(0, MAX_MARK_LEN);
    setSelectedMark(mark);
    setRecognizeStatus(`Selected: ${mark}`);
    onMarkDetected(mark, appendMode ? { replaceLastSegment: true } : undefined);
    if (appendMode) clearCanvas();
  };

  const handleClearButton = () => {
    clearCanvas();
  };

  return (
    <div className={`${className ?? ''} ${fillAvailableHeight ? 'h-full' : ''}`}>
      {/* Canvas */}
      <div className={`relative rounded-xl overflow-hidden border-2 border-dashed border-violet-400/30 bg-white dark:bg-slate-50 ${fillAvailableHeight ? 'h-full' : ''}`}>
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height: fillAvailableHeight ? '100%' : canvasHeight }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <button
          onClick={handleClearButton}
          className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white/90 backdrop-blur-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-sm border border-border/30"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <p className="absolute bottom-2 left-2.5 text-xs sm:text-sm text-muted-foreground/50 italic pointer-events-none select-none flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" /> Write buyer mark
        </p>
      </div>

      {/* Status + Candidates */}
      {showStatus && (
      <div className="mt-2.5 flex items-center gap-2 flex-wrap min-h-[32px]">
        {recognizing ? (
          <div className="flex items-center gap-1.5 text-violet-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs sm:text-sm font-medium">{recognizeStatus || 'Reading...'}</span>
          </div>
        ) : selectedMark ? (
          <div className="flex items-center gap-1.5">
            <div className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold shadow-sm">
              {selectedMark}
            </div>
            <span className="text-xs text-muted-foreground">{recognizeStatus}</span>
          </div>
        ) : recognizeStatus ? (
          <span className="text-xs sm:text-sm text-muted-foreground">{recognizeStatus}</span>
        ) : null}

        <AnimatePresence>
          {candidates.length > 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 ml-auto flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              {candidates.filter(c => c !== selectedMark).map(c => (
                <button
                  key={c}
                  onClick={() => selectCandidate(c)}
                  className="px-2.5 py-1 rounded-md text-xs sm:text-sm font-bold bg-muted/50 text-foreground hover:bg-muted transition-colors"
                >
                  {c.slice(0, MAX_MARK_LEN)}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
};

export default InlineScribblePad;
