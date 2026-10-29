// All supplier models use the same physical units (100 mm per world unit).
// Keep one camera for the entire catalog so switching products shows their
// actual relative sizes, rather than fitting each product to the viewport.
export function studioView(mobile: boolean) {
  const distanceFactor = 1.14 ** 2 * 0.88; // Two clicks out, then one click in.
  return {
    target: [0, 0.72, 0] as const,
    position: [0, 0.72 + ((mobile ? 1.62 : 1.54) - 0.61) * distanceFactor,
      (mobile ? 3.65 : 3.35) * distanceFactor] as const,
  };
}
