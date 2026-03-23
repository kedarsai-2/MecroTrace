import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, PenLine, RotateCcw, Minus, Plus, Loader2, Sparkles, Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BottomNav from '@/components/BottomNav';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import useUnsavedChangesGuard from '@/hooks/useUnsavedChangesGuard';

interface Stroke {
  xs: number[];
  ys: number[];
  ts: number[];
}

interface ScribbleEntry {
  id: string;
  initials: string;
  quantity: number;
  createdAt: string;
}

async function recognizeHandwriting(
  strokes: Stroke[],
  canvasWidth: number,
  canvasHeight: number
): Promise<string[]> {
  const ink = strokes.map(s => [s.xs, s.ys, s.ts]);
  const payload = {
    options: 'enable_pre_space',
    requests: [{
      writing_guide: { writing_area_width: canvasWidth, writing_area_height: canvasHeight },
      ink,
      language: 'en',
    }],
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

const ScribblePadPage = () => {
  const navigate = useNavigate();
  const [initials, setInitials] = useState('');
  const [quantity, setQuantity] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeStatus, setRecognizeStatus] = useState('');
  const [candidates, setCandidates] = useState<string[]>([]);
  const [drawingPreview, setDrawingPreview] = useState<string | null>(null);
  const [entries, setEntries] = useState<ScribbleEntry[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const drawTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStroke = useRef<Stroke>({ xs: [], ys: [], ts: [] });
  const strokeStartTime = useRef(0);

  // In-memory only; no localStorage for business data. TODO: backend API for scribble entries if persistence needed.
  const saveEntries = (newEntries: ScribbleEntry[]) => setEntries(newEntries);

  const isScribbleDirty =
    entries.length > 0 ||
    initials.trim() !== '' ||
    quantity.trim() !== '' ||
    drawingPreview != null ||
    candidates.length > 0;

  const { UnsavedChangesDialog } = useUnsavedChangesGuard({
    when: isScribbleDirty,
  });

  // Resize canvas
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 220;
    };
    const t = setTimeout(resize, 50);
    window.addEventListener('resize', resize);
    return () => { clearTimeout(t); window.removeEventListener('resize', resize); };
  }, []);

  const doRecognition = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || strokesRef.current.length === 0) return;
    setDrawingPreview(canvas.toDataURL('image/png'));
    setRecognizing(true);
    setRecognizeStatus('Recognizing...');
    setCandidates([]);
    try {
      const results = await recognizeHandwriting(strokesRef.current, canvas.width, canvas.height);
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
        } else {
          setRecognizeStatus('Could not detect — type manually');
        }
      } else {
        setRecognizeStatus('Could not detect — type manually');
      }
    } catch {
      setRecognizeStatus('Recognition failed — type manually');
    } finally {
      setRecognizing(false);
    }
  }, []);

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
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(123, 97, 255, 0.3)';
    ctx.shadowBlur = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
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
    drawTimeout.current = setTimeout(() => { doRecognition(); }, 800);
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
  };

  const adjustQty = (delta: number) => {
    const current = parseInt(quantity) || 0;
    setQuantity(String(Math.max(1, current + delta)));
  };

  const handleConfirm = () => {
    if (!initials.trim() || !quantity || parseInt(quantity) <= 0) return;
    const newEntry: ScribbleEntry = {
      id: crypto.randomUUID(),
      initials: initials.trim().toUpperCase(),
      quantity: parseInt(quantity),
      createdAt: new Date().toISOString(),
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    toast.success(`Added: ${newEntry.initials} × ${newEntry.quantity} bags`);
    setInitials('');
    setQuantity('');
    setDrawingPreview(null);
    strokesRef.current = [];
    setRecognizeStatus('');
    setCandidates([]);
    clearCanvas();
  };

  const removeEntry = (id: string) => {
    saveEntries(entries.filter(e => e.id !== id));
    toast.success('Entry removed');
  };

  return (
    <div className="mobile-app-shell min-h-[100dvh] bg-gradient-to-b from-background via-background to-blue-50/30 dark:to-blue-950/10 pb-28 lg:pb-6">
      <UnsavedChangesDialog />
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-500 via-fuchsia-500 to-purple-600 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-[2rem] relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25)_0%,transparent_50%)]" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(8)].map((_, i) => (
            <motion.div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full"
              style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%` }}
              animate={{ y: [-10, 10], opacity: [0.2, 0.6, 0.2] }}
              transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
            />
          ))}
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/home')} aria-label="Go back" className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <PenLine className="w-5 h-5" /> Scribble Pad
              </h1>
              <p className="text-white/70 text-xs">Quick buyer mark entry · Auto-recognized</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* Canvas */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Draw Buyer Mark</p>
            <button onClick={clearCanvas} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/50 text-muted-foreground text-[10px] font-semibold hover:bg-muted/70 transition-colors">
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          </div>

          <div className="relative rounded-2xl overflow-hidden border-2 border-dashed border-violet-400/30 bg-white dark:bg-slate-50">
            <canvas
              ref={canvasRef}
              className="w-full h-[220px] touch-none cursor-crosshair"
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
            />
            <p className="absolute bottom-2.5 left-3 text-[11px] text-muted-foreground/40 italic pointer-events-none select-none">
              ✎ Write initials clearly · Auto-reads when you stop
            </p>
          </div>

          {/* Recognized result */}
          <div className="mt-3 rounded-xl bg-muted/30 border border-violet-400/15 p-3">
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

            {candidates.length > 1 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 pt-2 border-t border-border/20">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Did you mean?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map(c => (
                    <button key={c} onClick={() => { setInitials(c.slice(0, 5)); setRecognizeStatus(`Selected: ${c.slice(0, 5)}`); }}
                      className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                        initials === c ? 'bg-violet-500 text-white shadow-md' : 'bg-muted/50 text-foreground hover:bg-muted')}>
                      {c.slice(0, 5)}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Quantity + Add */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-2xl p-3">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Quantity (Bags)
          </label>
          <div className="flex items-center gap-1 mb-3">
            <button onClick={() => adjustQty(-1)} className="w-14 h-14 rounded-l-2xl bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors flex-shrink-0">
              <Minus className="w-5 h-5 text-muted-foreground" />
            </button>
            <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" min={1}
              className="h-14 rounded-none text-center text-2xl font-bold bg-muted/30 border-violet-400/20 focus:border-violet-400 focus:ring-violet-400/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
            <button onClick={() => adjustQty(1)} className="w-14 h-14 rounded-r-2xl bg-muted/40 flex items-center justify-center hover:bg-muted/60 transition-colors flex-shrink-0">
              <Plus className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <Button onClick={handleConfirm}
            disabled={!initials.trim() || !quantity || parseInt(quantity) <= 0 || recognizing}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-base shadow-lg shadow-violet-500/25 disabled:opacity-40">
            <Check className="w-5 h-5 mr-2" /> Add Scribble Entry
          </Button>
        </motion.div>

        {/* Entries List */}
        {entries.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Entries · {entries.length}
              </p>
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-bold text-foreground">{entries.reduce((s, e) => s + e.quantity, 0)} bags</span>
              </p>
            </div>
            <div className="space-y-2">
              {entries.map((entry, i) => (
                <motion.div key={entry.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                  className="glass-card rounded-2xl p-3 flex items-center gap-3 border-l-4 border-l-violet-500">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-md flex-shrink-0">
                    <span className="text-white font-bold text-xs">{entry.initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">[{entry.initials}]</p>
                    <p className="text-xs text-muted-foreground">{entry.quantity} bags · {new Date(entry.createdAt).toLocaleTimeString()}</p>
                  </div>
                  <button onClick={() => removeEntry(entry.id)} className="p-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default ScribblePadPage;
