/**
 * Lathe profiles ([radius, y] from top to bottom, metres) for procedural garments.
 * Shared by the seed GLB generator and the client-side fallback geometry, so a product
 * without a model still hangs on the rail with a believable silhouette.
 */
export type Profile = [radius: number, y: number][];

export const GARMENT_PROFILES: Record<string, Profile> = {
  DRESS: [
    [0.02, 1.5], [0.12, 1.49], [0.16, 1.44], [0.17, 1.36], [0.15, 1.24], [0.13, 1.1], [0.16, 1.0], [0.22, 0.8], [0.3, 0.55], [0.38, 0.3], [0.42, 0.18],
  ],
  COAT: [
    [0.03, 1.52], [0.14, 1.5], [0.22, 1.44], [0.23, 1.3], [0.21, 1.1], [0.2, 0.95], [0.22, 0.7], [0.25, 0.45], [0.27, 0.3],
  ],
  JACKET: [
    [0.03, 1.5], [0.14, 1.49], [0.22, 1.43], [0.22, 1.28], [0.2, 1.1], [0.19, 0.95], [0.2, 0.85],
  ],
  TOP: [
    [0.03, 1.5], [0.12, 1.49], [0.19, 1.44], [0.19, 1.3], [0.17, 1.15], [0.18, 1.0], [0.19, 0.92],
  ],
  SHIRT: [
    [0.03, 1.5], [0.13, 1.49], [0.2, 1.44], [0.2, 1.28], [0.18, 1.1], [0.19, 0.95], [0.2, 0.86],
  ],
  KNIT: [
    [0.04, 1.5], [0.13, 1.49], [0.21, 1.42], [0.22, 1.28], [0.21, 1.1], [0.2, 0.98], [0.18, 0.9],
  ],
  SKIRT: [
    [0.13, 1.05], [0.15, 1.0], [0.2, 0.8], [0.27, 0.6], [0.32, 0.45],
  ],
  TROUSERS: [
    [0.15, 1.05], [0.17, 0.95], [0.16, 0.75], [0.14, 0.5], [0.12, 0.25], [0.11, 0.1],
  ],
};

/** Front-to-back flattening so lathe shapes read as garments rather than vases. */
export const GARMENT_DEPTH = 0.62;
/** Vertical offset applied so the garment top sits just under the rail. */
export const GARMENT_Y_OFFSET = -0.9;
