/**
 * Step 3's backdrop: a plain retro pattern instead of the outrun road. A
 * drifting violet grid, halftone dots rising from the bottom, two striped
 * corners and a few 80s shapes floating slowly, quiet enough that the
 * tickets carry the stage.
 */
const shape = (style: Record<string, string>) => style as React.CSSProperties;

export default function GGPatternScene() {
  return (
    <div aria-hidden className="gg-pattern">
      <div className="gg-pattern-grid" />
      <div className="gg-pattern-stripes" />
      <div className="gg-pattern-stripes is-left" />
      <div className="gg-pattern-dots" />
      <svg className="gg-shape" style={shape({ left: "7%", top: "16%", "--dur": "8s", "--turn": "10deg" })} width="70" height="62" viewBox="0 0 70 62">
        <path d="M35 4 L66 58 L4 58 Z" fill="none" stroke="#ff2bd6" strokeWidth="4" strokeLinejoin="round" opacity=".55" />
      </svg>
      <svg className="gg-shape" style={shape({ right: "9%", bottom: "20%", "--dur": "10s", "--turn": "-6deg" })} width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="26" fill="none" stroke="#22e5ff" strokeWidth="4" opacity=".5" />
        <circle cx="32" cy="32" r="12" fill="#22e5ff" opacity=".18" />
      </svg>
      <svg className="gg-shape" style={shape({ left: "15%", bottom: "16%", "--dur": "11s", "--turn": "7deg" })} width="120" height="30" viewBox="0 0 120 30">
        <path d="M4 15 Q 18 0 32 15 T 60 15 T 88 15 T 116 15" fill="none" stroke="#ffb347" strokeWidth="4" strokeLinecap="round" opacity=".5" />
      </svg>
      <svg className="gg-shape" style={shape({ right: "22%", top: "12%", "--dur": "9s", "--turn": "14deg" })} width="40" height="40" viewBox="0 0 40 40">
        <path d="M20 4 V36 M4 20 H36" stroke="#b46bff" strokeWidth="5" strokeLinecap="round" opacity=".55" />
      </svg>
      <svg className="gg-shape" style={shape({ left: "38%", top: "6%", "--dur": "12s", "--turn": "-9deg" })} width="96" height="24" viewBox="0 0 96 24">
        <path d="M4 20 L16 4 L28 20 L40 4 L52 20 L64 4 L76 20 L88 4" fill="none" stroke="#22e5ff" strokeWidth="3" strokeLinejoin="round" opacity=".4" />
      </svg>
      <svg className="gg-shape" style={shape({ right: "4%", top: "48%", "--dur": "7s", "--turn": "20deg" })} width="44" height="44" viewBox="0 0 44 44">
        <rect x="8" y="8" width="28" height="28" fill="none" stroke="#ff2bd6" strokeWidth="4" opacity=".45" />
      </svg>
    </div>
  );
}
