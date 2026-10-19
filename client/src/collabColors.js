// Curated palette of 12 accessible, vibrant colors for live collaborator cursors and badges
export const COLLAB_PALETTE = [
  { hex: "#4f46e5", name: "Indigo", bgLight: "#e0e7ff" },
  { hex: "#0891b2", name: "Cyan", bgLight: "#cffafe" },
  { hex: "#db2777", name: "Pink", bgLight: "#fce7f3" },
  { hex: "#16a34a", name: "Emerald", bgLight: "#d1fae5" },
  { hex: "#ea580c", name: "Orange", bgLight: "#ffedd5" },
  { hex: "#7c3aed", name: "Purple", bgLight: "#ede9fe" },
  { hex: "#2563eb", name: "Blue", bgLight: "#dbeafe" },
  { hex: "#e11d48", name: "Rose", bgLight: "#ffe4e6" },
  { hex: "#0d9488", name: "Teal", bgLight: "#ccfbf1" },
  { hex: "#d97706", name: "Amber", bgLight: "#fef3c7" },
  { hex: "#9333ea", name: "Violet", bgLight: "#fae8ff" },
  { hex: "#059669", name: "Mint", bgLight: "#d1fae5" },
];

/**
 * Deterministically generates a consistent cursor color for any user identifier (id, email, or name)
 * @param {string} identifier - User ID, email, or name
 * @returns {string} Hex color string
 */
export function getUserColor(identifier = "User") {
  const str = String(identifier || "User");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLAB_PALETTE.length;
  return COLLAB_PALETTE[index].hex;
}

/**
 * Returns light tint for selection highlighting
 * @param {string} hex - Hex color
 * @returns {string} rgba color string
 */
export function getSelectionColor(hex) {
  return `${hex}40`; // 25% opacity
}
