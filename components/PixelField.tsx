"use client";

import { useEffect, useRef } from "react";

type Pixel = {
  x: number;
  y: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  pulse: number;
  depth: number;
};

/**
 * A small, dependency-free star/pixel field for the opening screen.
 * It renders at a capped device-pixel ratio and stops when the page is hidden.
 */
export default function PixelField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let pixels: Pixel[] = [];
    let animationFrame = 0;
    let previousTime = performance.now();

    // Stable pseudo-random values keep the first frame consistent across redraws.
    let seed = 0x7f4a7c15;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const makePixel = (initial = false): Pixel => {
      const depth = 0.25 + random() * 0.75;
      // Concentrate part of the field in a soft diagonal river like the reference.
      const inRiver = random() < 0.58;
      const riverY = height * (0.78 - random() * 0.52);
      const y = inRiver
        ? Math.max(0, Math.min(height, riverY + (random() - 0.5) * height * 0.2))
        : random() * height;
      return {
        x: random() * width,
        y: initial ? y : height + random() * 24,
        size: 0.45 + depth * 1.55 + (random() > 0.985 ? 2.2 : 0),
        speed: 3 + depth * 11,
        drift: (random() - 0.5) * (2 + depth * 5),
        phase: random() * Math.PI * 2,
        pulse: 0.35 + random() * 1.4,
        depth,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      seed = 0x7f4a7c15;
      const count = Math.min(520, Math.max(180, Math.round((width * height) / 3400)));
      pixels = Array.from({ length: count }, () => makePixel(true));
    };

    const draw = (time: number) => {
      const delta = Math.min(40, time - previousTime) / 1000;
      previousTime = time;
      context.clearRect(0, 0, width, height);

      const still = reduceMotion.matches;
      for (let index = 0; index < pixels.length; index += 1) {
        const pixel = pixels[index]!;
        if (!still) {
          pixel.y -= pixel.speed * delta;
          pixel.x += pixel.drift * delta;
          if (pixel.y < -8 || pixel.x < -8 || pixel.x > width + 8) {
            pixels[index] = makePixel(false);
            continue;
          }
        }

        const twinkle = still ? 0.72 : 0.5 + Math.sin(time * 0.001 * pixel.pulse + pixel.phase) * 0.32;
        const alpha = Math.max(0.12, twinkle) * (0.35 + pixel.depth * 0.62);
        const blue = Math.round(210 + pixel.depth * 45);
        context.fillStyle = `rgba(${Math.round(165 + pixel.depth * 85)}, ${blue}, 255, ${alpha})`;
        context.fillRect(pixel.x, pixel.y, pixel.size, pixel.size);

        if (pixel.size > 2.8) {
          context.fillStyle = `rgba(207, 229, 255, ${alpha * 0.32})`;
          context.fillRect(pixel.x - pixel.size * 1.7, pixel.y + pixel.size * 0.4, pixel.size * 4.4, 0.7);
          context.fillRect(pixel.x + pixel.size * 0.4, pixel.y - pixel.size * 1.7, 0.7, pixel.size * 4.4);
        }
      }

      if (!still && !document.hidden) animationFrame = requestAnimationFrame(draw);
    };

    const restart = () => {
      cancelAnimationFrame(animationFrame);
      previousTime = performance.now();
      animationFrame = requestAnimationFrame(draw);
    };
    const handleVisibility = () => {
      if (document.hidden) cancelAnimationFrame(animationFrame);
      else restart();
    };

    const observer = new ResizeObserver(() => {
      resize();
      restart();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibility);
    reduceMotion.addEventListener("change", restart);
    resize();
    restart();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      reduceMotion.removeEventListener("change", restart);
    };
  }, []);

  return <canvas ref={canvasRef} className="opening-pixels" aria-hidden="true" />;
}
