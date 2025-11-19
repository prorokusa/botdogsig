import React, { useEffect, useRef, useLayoutEffect } from 'react';
import SignaturePad from 'signature_pad';

interface SignaturePadProps {
  onBegin?: () => void;
  onEnd?: () => void;
  penColor?: string;
}

// Expose a ref interface to the parent to allow clearing and getting data
export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  toData: () => any;
  getCanvasMeta: () => { width: number; height: number; ratio: number; pen_width: number };
}

const SignatureCanvas = React.forwardRef<SignaturePadRef, SignaturePadProps>(({ onBegin, onEnd, penColor = "#1F5AA6" }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs for callbacks to ensure useEffect doesn't re-run when parent state updates (which recreates these functions)
  const onBeginRef = useRef(onBegin);
  const onEndRef = useRef(onEnd);

  // Always keep refs up to date with the latest props
  onBeginRef.current = onBegin;
  onEndRef.current = onEnd;

  // Initialize SignaturePad
  useEffect(() => {
    if (!canvasRef.current) return;

    const pad = new SignaturePad(canvasRef.current, {
      penColor: penColor,
      backgroundColor: "rgba(255,255,255,0)", // Transparent
      velocityFilterWeight: 0.5,
      minWidth: 1.2,
      maxWidth: 2.2,
      minDistance: 0.4,
      throttle: 0,
    });

    // Use internal wrappers that delegate to the current ref value
    // This prevents the need to re-initialize the pad (and wipe the canvas) when callbacks change
    pad.addEventListener("beginStroke", () => onBeginRef.current?.());
    pad.addEventListener("endStroke", () => onEndRef.current?.());

    signaturePadRef.current = pad;

    return () => {
      pad.off();
      // Note: We don't destroy the instance explicitly as SignaturePad doesn't have a destroy method that cleans up DOM,
      // but off() removes listeners.
    };
  }, [penColor]); // Removed onBegin/onEnd from dependencies to prevent canvas wipe on parent re-render

  // Handle Resizing (CRITICAL for mobile/retina displays)
  useLayoutEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !signaturePadRef.current || !containerRef.current) return;

      const canvas = canvasRef.current;
      const container = containerRef.current;
      
      // Get the computed style width/height of the container
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const width = container.clientWidth;
      const height = container.clientHeight;

      // If dimensions haven't changed, don't do anything
      if (canvas.width === width * ratio && canvas.height === height * ratio) return;

      // Store current data to restore after resize
      const data = signaturePadRef.current.toData();

      // This clears the canvas content
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
        ctx.scale(ratio, ratio);
      }
      
      // CRITICAL FIX: Restore the data immediately so the signature doesn't disappear
      signaturePadRef.current.clear(); // Reset internal state
      signaturePadRef.current.fromData(data); // Redraw lines
    };

    // Use ResizeObserver for robust size detection
    const observer = new ResizeObserver(() => {
      handleResize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    // Initial call
    handleResize();

    return () => {
      observer.disconnect();
    };
  }, []);

  // Expose methods to parent
  React.useImperativeHandle(ref, () => ({
    clear: () => {
      signaturePadRef.current?.clear();
      onEndRef.current?.(); // Trigger state update in parent if needed
    },
    isEmpty: () => signaturePadRef.current?.isEmpty() ?? true,
    toData: () => signaturePadRef.current?.toData(),
    getCanvasMeta: () => {
        const pad = signaturePadRef.current;
        const canvas = canvasRef.current;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        return {
            width: canvas?.clientWidth || canvas?.width || 0,
            height: canvas?.clientHeight || canvas?.height || 0,
            ratio,
            pen_width: pad ? ((pad.minWidth + pad.maxWidth) / 2) * ratio : 2,
        };
    }
  }));

  return (
    <div ref={containerRef} className="w-full h-[220px] relative border-2 border-dashed border-indigo-300/50 rounded-xl bg-white dark:bg-gray-800 touch-none overflow-hidden">
       <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair touch-none"
        aria-label="Signature Pad"
      />
    </div>
  );
});

SignatureCanvas.displayName = "SignatureCanvas";
export default SignatureCanvas;
