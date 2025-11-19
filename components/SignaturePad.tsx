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

  const resizeCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    const pad = signaturePadRef.current;
    if (!canvas || !pad) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.offsetWidth || canvas.parentElement?.clientWidth || 0;
    const height = canvas.offsetHeight || canvas.parentElement?.clientHeight || 0;
    if (!width || !height) return;

    if (canvas.width === width * ratio && canvas.height === height * ratio) return;

    const data = pad.toData();

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
    }

    pad.clear();
    pad.fromData(data);
  }, []);

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
    resizeCanvas();

    return () => {
      pad.off();
      // Note: We don't destroy the instance explicitly as SignaturePad doesn't have a destroy method that cleans up DOM,
      // but off() removes listeners.
    };
  }, [penColor, resizeCanvas]); // Removed onBegin/onEnd from dependencies to prevent canvas wipe on parent re-render

  // Handle Resizing (CRITICAL for mobile/retina displays)
  useLayoutEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      resizeCanvas();
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
  }, [resizeCanvas]);

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
            width: canvas?.offsetWidth || canvas?.clientWidth || 0,
            height: canvas?.offsetHeight || canvas?.clientHeight || 0,
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
