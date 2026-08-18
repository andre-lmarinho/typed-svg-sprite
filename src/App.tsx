import { useState } from "react";
import { Icon, iconNames } from "./icon";
const COLORS = ["#0f172a", "#2563eb", "#16a34a", "#dc2626", "#d97706", "#9333ea"];

export function App() {
  const [size, setSize] = useState(32);
  const [color, setColor] = useState(COLORS[1]);

  return (
    <main className="page">
      <header className="hero">
        <div className="hero__title">
          <Icon name="layout-dashboard" size={36} />
          <h1>typed-svg-sprite</h1>
        </div>
        <p className="hero__tagline">
          One cached sprite. One <code>&lt;Icon name="…" /&gt;</code> with full
          TypeScript autocomplete. List the icons you want from{" "}
          <a href="https://lucide.dev" target="_blank" rel="noreferrer">Lucide</a>,
          run the build, done.
        </p>
        <p className="hero__credit">
          Idea &amp; pattern by{" "}
          <a href="https://github.com/calcom/cal.diy" target="_blank" rel="noreferrer">
            calcom/cal.diy
          </a>
          . This repo is a minimal showcase.
        </p>
      </header>

      <section className="controls" aria-label="Icon controls">
        <label className="control">
          <span>Size: {size}px</span>
          <input
            type="range"
            min={16}
            max={72}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
        <div className="control">
          <span>Color (via <code>currentColor</code>)</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${c === color ? " swatch--active" : ""}`}
                style={{ background: c }}
                aria-label={`Use color ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      </section>

      <p className="hint">{iconNames.length} icons in one sprite.</p>

      <section aria-label="Icons">
        <ul className="grid" style={{ color }}>
          {iconNames.map((name) => (
            <li key={name} className="tile">
              <Icon name={name} size={size} />
              <code className="tile__name">{name}</code>
            </li>
          ))}
        </ul>
      </section>

      <section className="usage" aria-label="Usage in context">
        <h2 className="section-title">In context</h2>
        <p className="hint">
          Icons inherit text color and size, so they sit inline with text and buttons.
        </p>
        <div className="usage__row">
          <button type="button" className="btn btn--primary">
            <Icon name="check-circle" size={18} /> Save changes
          </button>
          <button type="button" className="btn">
            <Icon name="settings" size={18} /> Settings
          </button>
          <button type="button" className="btn btn--ghost">
            <Icon name="bell" size={18} /> Notify
          </button>
        </div>
        <p className="usage__inline">
          Icons inherit text color and size, so they sit inline with text like the{" "}
          <Icon name="calendar" size={16} /> calendar and{" "}
          <Icon name="users" size={16} /> people next to them.
        </p>
      </section>

      <footer className="footer">
        <p>
          Edit <code>src/icon/icon-list.ts</code>, run{" "}
          <code>npm run build:icons</code>, and the gallery + types update automatically.
        </p>
      </footer>
    </main>
  );
}
