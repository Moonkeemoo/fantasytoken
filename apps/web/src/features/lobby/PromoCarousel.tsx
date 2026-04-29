import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Label } from '../../components/ui/Label.js';

const ROTATE_MS = 7_000;

/**
 * Auto-rotating promo carousel sitting above the contest tabs. Hosts the
 * Featured contest slide + Invite slide (and any future promos). Pauses
 * rotation while the user is interacting (touch, dot tap) so they don't
 * fight the timer.
 *
 * Heart of the layout: each slide gets a full-bleed slot, dots indicator
 * floats top-right, header label top-left ("FOR YOU · N PROMOS").
 */
export function PromoCarousel({ slides }: { slides: ReactNode[] }) {
  const [idx, setIdx] = useState(0);
  const pausedRef = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  // Auto-advance unless paused (touch interaction). Reset timer when the
  // active slide changes via dot tap so the new slide gets a full window.
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setIdx((v) => (v + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length, idx]);

  // Touch handlers: pause during interaction, resume + snap on release.
  const startX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    pausedRef.current = true;
    startX.current = e.touches[0]!.clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    pausedRef.current = false;
    if (startX.current === null) return;
    const dx = e.changedTouches[0]!.clientX - startX.current;
    startX.current = null;
    const SWIPE = 40;
    if (dx > SWIPE) setIdx((v) => (v - 1 + slides.length) % slides.length);
    else if (dx < -SWIPE) setIdx((v) => (v + 1) % slides.length);
  };

  if (slides.length === 0) return null;

  return (
    <div className="px-3 pt-2">
      <div className="flex items-center justify-between pb-1">
        <Label>
          ★ for you · {slides.length} promo{slides.length === 1 ? '' : 's'}
        </Label>
        {slides.length > 1 && (
          <div className="flex items-center gap-[6px]">
            {slides.map((_, i) => (
              <button
                key={i}
                aria-label={`promo ${i + 1}`}
                onClick={() => setIdx(i)}
                className={`h-[6px] rounded-full transition-all ${
                  i === idx ? 'w-[18px] bg-ink' : 'w-[6px] bg-ink/30'
                }`}
              />
            ))}
          </div>
        )}
      </div>
      <div
        ref={trackRef}
        className="overflow-hidden rounded-[6px]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-full shrink-0">
              {slide}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
