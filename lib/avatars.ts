// Deterministic avatar generator for SketchDuel
// Maps a player ID string → one of 8 face designs × one of 6 background colors
// Pure SVG, no external dependencies.

const BG_COLORS = [
    '#FDE68A', // yellow
    '#86EFAC', // green
    '#93C5FD', // blue
    '#FCA5A5', // red/pink
    '#C4B5FD', // purple
    '#FDB96E', // orange
];

// Simple djb2-style hash — deterministic across sessions for same playerId
function hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
        h = h >>> 0; // keep 32-bit unsigned
    }
    return h;
}

export function getAvatarSeed(playerId: string): { faceIndex: number; colorIndex: number } {
    const h = hashString(playerId);
    return {
        faceIndex: h % 8,
        colorIndex: (h >> 8) % 6,
    };
}

export function getAvatarBg(playerId: string): string {
    const { colorIndex } = getAvatarSeed(playerId);
    return BG_COLORS[colorIndex];
}

// Returns a complete <svg> string for the avatar
// size: rendered pixel size (the svg viewBox is always 88×88)
export function getAvatarSvg(playerId: string, size = 40): string {
    const { faceIndex, colorIndex } = getAvatarSeed(playerId);
    const bg = BG_COLORS[colorIndex];
    const face = FACES[faceIndex];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 88 88">
  <circle cx="44" cy="44" r="44" fill="${bg}"/>
  ${face}
</svg>`;
}

// React-friendly: returns props for an inline <svg> element
export function getAvatarProps(playerId: string, size = 40) {
    const { faceIndex, colorIndex } = getAvatarSeed(playerId);
    return { faceIndex, bg: BG_COLORS[colorIndex], size };
}

// --- Face inner SVG strings (viewBox 88×88, circle at cx=44 cy=44 r=44) ---
// All faces use fill="#1c1917" for features on the colored bg.

const FACES: string[] = [
    // 0: Sunny — big eyes, arched brows, open smile
    `<circle cx="30" cy="37" r="7" fill="#fff"/>
   <circle cx="58" cy="37" r="7" fill="#fff"/>
   <circle cx="32" cy="38" r="4" fill="#1c1917"/>
   <circle cx="60" cy="38" r="4" fill="#1c1917"/>
   <circle cx="33" cy="36" r="1.5" fill="#fff"/>
   <circle cx="61" cy="36" r="1.5" fill="#fff"/>
   <path d="M24 28 Q30 24 36 28" stroke="#1c1917" stroke-width="2.2" fill="none" stroke-linecap="round"/>
   <path d="M52 28 Q58 24 64 28" stroke="#1c1917" stroke-width="2.2" fill="none" stroke-linecap="round"/>
   <path d="M28 54 Q44 66 60 54" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

    // 1: Breezy — squint eyes, big grin, rosy cheeks
    `<path d="M22 36 Q30 30 38 36" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>
   <path d="M50 36 Q58 30 66 36" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>
   <path d="M24 54 Q44 68 64 54" stroke="#1c1917" stroke-width="2.5" fill="#fff" stroke-linecap="round"/>
   <ellipse cx="20" cy="52" rx="9" ry="6" fill="#f87171" opacity="0.35"/>
   <ellipse cx="68" cy="52" rx="9" ry="6" fill="#f87171" opacity="0.35"/>
   <path d="M22 26 Q30 21 38 26" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>
   <path d="M50 26 Q58 21 66 26" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>`,

    // 2: Chill — half-open eyes, easy smirk
    `<ellipse cx="31" cy="39" rx="8" ry="5" fill="#fff"/>
   <ellipse cx="57" cy="39" rx="8" ry="5" fill="#fff"/>
   <ellipse cx="32" cy="40" rx="5" ry="4" fill="#1c1917"/>
   <ellipse cx="58" cy="40" rx="5" ry="4" fill="#1c1917"/>
   <path d="M23 37 Q31 33 39 37" stroke="#1c1917" stroke-width="2" fill="none"/>
   <path d="M49 37 Q57 33 65 37" stroke="#1c1917" stroke-width="2" fill="none"/>
   <path d="M30 55 Q44 60 58 52" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

    // 3: Wowza — wide round eyes, O mouth, shocked brows
    `<circle cx="30" cy="37" r="10" fill="#fff"/>
   <circle cx="58" cy="37" r="10" fill="#fff"/>
   <circle cx="30" cy="37" r="6" fill="#1c1917"/>
   <circle cx="58" cy="37" r="6" fill="#1c1917"/>
   <circle cx="27" cy="34" r="2.2" fill="#fff"/>
   <circle cx="55" cy="34" r="2.2" fill="#fff"/>
   <ellipse cx="44" cy="58" rx="7" ry="8" fill="#1c1917"/>
   <ellipse cx="44" cy="59" rx="5" ry="6" fill="#7f1d1d"/>
   <path d="M20 25 Q30 19 40 24" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>
   <path d="M48 24 Q58 19 68 25" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

    // 4: Smug — confident narrow eyes, one-sided smirk, asymmetric brows
    `<ellipse cx="31" cy="38" rx="8" ry="6" fill="#fff"/>
   <ellipse cx="57" cy="38" rx="8" ry="6" fill="#fff"/>
   <ellipse cx="32" cy="39" rx="5" ry="4" fill="#1c1917"/>
   <ellipse cx="58" cy="39" rx="5" ry="4" fill="#1c1917"/>
   <circle cx="34" cy="37" r="1.8" fill="#fff"/>
   <circle cx="60" cy="37" r="1.8" fill="#fff"/>
   <path d="M30 54 Q40 60 58 50" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>
   <path d="M22 29 Q30 25 38 29" stroke="#1c1917" stroke-width="2" fill="none" stroke-linecap="round"/>
   <path d="M50 27 Q58 25 66 31" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

    // 5: Hyped — star eyes, giant smile
    `<path d="M31 37 L32.5 31 L34 37 L40 37 L35 40 L36.5 46 L31 43 L25.5 46 L27 40 L22 37 Z" fill="#1c1917"/>
   <path d="M57 37 L58.5 31 L60 37 L66 37 L61 40 L62.5 46 L57 43 L51.5 46 L53 40 L48 37 Z" fill="#1c1917"/>
   <path d="M22 56 Q44 72 66 56" stroke="#1c1917" stroke-width="2.5" fill="#fff" stroke-linecap="round"/>`,

    // 6: Brainy — glasses, dots for eyes, slight smile
    `<rect x="18" y="30" width="20" height="16" rx="6" fill="none" stroke="#1c1917" stroke-width="2.2"/>
   <rect x="50" y="30" width="20" height="16" rx="6" fill="none" stroke="#1c1917" stroke-width="2.2"/>
   <line x1="38" y1="38" x2="50" y2="38" stroke="#1c1917" stroke-width="2.2"/>
   <line x1="18" y1="38" x2="10" y2="40" stroke="#1c1917" stroke-width="1.8"/>
   <line x1="70" y1="38" x2="78" y2="40" stroke="#1c1917" stroke-width="1.8"/>
   <circle cx="28" cy="38" r="4.5" fill="#1c1917"/>
   <circle cx="60" cy="38" r="4.5" fill="#1c1917"/>
   <circle cx="30" cy="36" r="1.8" fill="#fff"/>
   <circle cx="62" cy="36" r="1.8" fill="#fff"/>
   <path d="M32 56 Q44 62 56 56" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,

    // 7: Bashful — dot eyes, big blush, lashes, tiny smile
    `<circle cx="31" cy="37" r="5.5" fill="#1c1917"/>
   <circle cx="57" cy="37" r="5.5" fill="#1c1917"/>
   <circle cx="33" cy="35" r="2" fill="#fff"/>
   <circle cx="59" cy="35" r="2" fill="#fff"/>
   <ellipse cx="18" cy="53" rx="11" ry="8" fill="#f87171" opacity="0.38"/>
   <ellipse cx="70" cy="53" rx="11" ry="8" fill="#f87171" opacity="0.38"/>
   <path d="M36 56 Q44 62 52 56" stroke="#1c1917" stroke-width="2.5" fill="none" stroke-linecap="round"/>
   <line x1="26" y1="30" x2="23" y2="25" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round"/>
   <line x1="31" y1="29" x2="31" y2="24" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round"/>
   <line x1="36" y1="30" x2="39" y2="25" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round"/>
   <line x1="52" y1="30" x2="49" y2="25" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round"/>
   <line x1="57" y1="29" x2="57" y2="24" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round"/>
   <line x1="62" y1="30" x2="65" y2="25" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round"/>`,
];

// React component helper — renders the avatar as an inline SVG
// Usage: <Avatar playerId={id} size={32} />
export function avatarData(playerId: string, size = 40): {
    bg: string;
    faceIndex: number;
    size: number;
    svgInner: string;
} {
    const { faceIndex, colorIndex } = getAvatarSeed(playerId);
    return {
        bg: BG_COLORS[colorIndex],
        faceIndex,
        size,
        svgInner: FACES[faceIndex],
    };
}

export { FACES, BG_COLORS };