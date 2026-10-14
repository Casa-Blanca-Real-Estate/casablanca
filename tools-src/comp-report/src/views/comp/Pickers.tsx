// The handoff's tag chips and feature pickers (Dispatch 14), shared by the
// home's details, the add-comps form and Sort's cards. A feature the home has
// too is outlined in lavender; a chosen one is ink.
import { FEATURE_GROUPS, TAGS, toggleFeature, type FeatureKey, type Features } from '../../../workspace/features.ts';

/** The 18 tags, in the handoff's order; several can be on. */
export function TagPicker({ value, onChange, disabled, label = 'Tags' }: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {TAGS.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            className={`chip${on ? ' on' : ''}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The five feature rows: Outdoor space and Unit condition take one, the others
 * several. `home` outlines the options the home has too (on a comp's form);
 * leave it out for the home's own pickers.
 */
export function FeaturePicker({ value, onChange, home, disabled, only }: {
  value: Features;
  onChange: (next: Features) => void;
  home?: Features;
  disabled?: boolean;
  /** Just these groups (Edit details shows them all; a card can show fewer). */
  only?: FeatureKey[];
}) {
  return (
    <div className="feature-rows">
      {FEATURE_GROUPS.filter((g) => !only || only.includes(g.key)).map((g) => (
        <div key={g.key} className="feature-row" role="group" aria-label={g.label}>
          <span className="feature-label">{g.label}</span>
          <span className="chips small">
            {g.options.map((o) => {
              const on = (value[g.key] ?? []).includes(o);
              const shared = !on && Boolean(home?.[g.key]?.includes(o));
              return (
                <button
                  key={o}
                  type="button"
                  className={`chip${on ? ' on' : ''}${shared ? ' home' : ''}`}
                  aria-pressed={on}
                  title={shared ? 'The home has this too' : undefined}
                  disabled={disabled}
                  onClick={() => onChange(toggleFeature(value, g.key, o))}
                >
                  {o}
                </button>
              );
            })}
          </span>
        </div>
      ))}
    </div>
  );
}
