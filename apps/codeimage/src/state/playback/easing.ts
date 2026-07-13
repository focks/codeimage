/**
 * Easing functions for slide animations. Pure, deterministic maps of a linear
 * progress `t` (0..1) onto an eased progress (0..1).
 *
 * The timeline stays LINEAR in time -> progress (`stateAt`); renderers ease at the
 * point of use, so every frame is still a deterministic pure function of the
 * injected time and exact-frame video export stays seek-exact. Easing is applied
 * inside each renderer (fade/slide/morph/chrome) so preview and export share it.
 *
 * Choices (no easing knob in the UI — good defaults only, Canva-style):
 *   - fade   : easeInOutCubic on opacity
 *   - slide  : easeOutCubic on X-position, easeInOutCubic on opacity
 *   - morph  : easeInOutCubic on both movement and fade
 *   - chrome : easeInOutCubic (padding/radius/background/opacity)
 *   - typewriter stays LINEAR (typing is inherently linear).
 */

/** Clamp a value to the unit interval. */
function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/** Identity easing — no acceleration. Kept for the typewriter reveal + tests. */
export function linear(t: number): number {
  return clamp01(t);
}

/**
 * Cubic ease-out: fast start, decelerating to a soft stop. `1 - (1 - t)^3`.
 * Used for slide X-position so lines rush in then settle without overshoot.
 */
export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

/**
 * Cubic ease-in-out: gentle acceleration, gentle deceleration, symmetric about
 * 0.5. The workhorse curve for opacity/morph/chrome so motion feels smooth rather
 * than mechanical (the "transitions not proper" complaint).
 */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  if (x < 0.5) {
    return 4 * x * x * x;
  }
  const f = 2 * x - 2;
  return 1 + (f * f * f) / 2;
}
