// The handoff's tag chips and feature pickers (Dispatch 14), shared by the
// home's details, the add-comps form and Sort's cards. A feature the home has
// too is outlined in lavender; a chosen one is ink.
//
// Dispatch 20: the tags show in their groups (Size and Multi-floor take one
// choice), with a practice agent's "from the data" chips (NB-9 C) and the
// agent's own tags (DP-6) after them; the feature groups are the ones that
// apply to the type, and Unit condition carries its ⓘ.
import { useId, useState } from 'react';
import type { PropertyType } from '../../../engine/index.ts';
import type { DerivedTag } from '../../../workspace/derived-tags.ts';
import {
  CONDITION_INFO, groupsFor, isTag, TAG_GROUPS, toggleTag, toggleFeature, type FeatureKey, type Features, type Tag,
} from '../../../workspace/features.ts';
import { freeTagProblem, MAX_FREE_TAG, MAX_TAGS, normalizeFreeTag } from '../../../workspace/free-tags.ts';
import { Info } from '../newcomp/Frame.tsx';
import '../../styles/compform.css';

/** "From the data": a suggested tag's chip, and why, for its title. */
export function DataChip({ d, onAdd, disabled }: { d: DerivedTag; onAdd: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="chip data" title={`From the data: ${d.because}`} disabled={disabled} onClick={onAdd}>
      + {d.tag}<span className="data-mark">from the data</span>
    </button>
  );
}

/**
 * The tags, in their groups (NW-045): one choice in Size and Multi-floor,
 * several elsewhere. `suggested` are the data's tags a practice agent adds with
 * one click; `hidden` are tags the facts rule out ("First floor" on floor 12).
 * The agent's own tags follow, with a field to add one.
 */
export function TagPicker({ value, onChange, disabled, label = 'Tags', suggested = [], hidden = [], own = true }: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  label?: string;
  suggested?: DerivedTag[];
  hidden?: readonly Tag[];
  /** Offer the agent's own tags (DP-6). */
  own?: boolean;
}) {
  const ids = useId();
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const mine = value.filter((t) => !isTag(t));
  const full = value.length >= MAX_TAGS;

  const addOwn = () => {
    const why = freeTagProblem(typed) ?? (full ? `A comp can have up to ${MAX_TAGS} tags.` : null);
    if (why) return setProblem(why);
    const t = normalizeFreeTag(typed);
    if (!value.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setTyped('');
    setProblem(null);
  };

  return (
    <div className="tag-groups" role="group" aria-label={label}>
      {TAG_GROUPS.map((g) => {
        const tags = g.tags.filter((t) => !hidden.includes(t) || value.includes(t));
        const chips = suggested.filter((d) => (g.tags as readonly string[]).includes(d.tag) && !value.includes(d.tag));
        return (
          <div key={g.key} className="tag-group" role={g.single ? 'radiogroup' : 'group'} aria-labelledby={`${ids}-${g.key}`}>
            <span className="tag-group-label" id={`${ids}-${g.key}`}>{g.label}{g.single && <span className="tag-group-one"> · one</span>}</span>
            <span className="chips small">
              {tags.map((t) => {
                const on = value.includes(t);
                const data = chips.find((d) => d.tag === t);
                if (data) return <DataChip key={t} d={data} disabled={disabled} onAdd={() => onChange(toggleTag(value, t))} />;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`chip${on ? ' on' : ''}`}
                    {...(g.single ? { role: 'radio', 'aria-checked': on } : { 'aria-pressed': on })}
                    disabled={disabled}
                    onClick={() => onChange(toggleTag(value, t))}
                  >
                    {t}
                  </button>
                );
              })}
            </span>
          </div>
        );
      })}
      {own && (
        <div className="tag-group" role="group" aria-labelledby={`${ids}-own`}>
          <span className="tag-group-label" id={`${ids}-own`}>Your own</span>
          <span className="chips small">
            {mine.map((t) => (
              <span key={t} className="chip on own">
                {t}
                <button type="button" className="own-x" aria-label={`Remove the tag ${t}`} disabled={disabled} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
              </span>
            ))}
            <span className="own-add">
              <input
                className="own-input"
                aria-label="A tag of your own"
                value={typed}
                maxLength={MAX_FREE_TAG + 10}
                placeholder="Add your own"
                disabled={disabled || full}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOwn();
                  }
                }}
              />
              {typed.trim() && <button type="button" className="link own-go" disabled={disabled} onClick={addOwn}>Add</button>}
            </span>
          </span>
          {problem && <span className="own-problem" role="alert">{problem}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * The feature rows that apply to the type (NW-039 a): Outdoor space and Unit
 * condition take one, the others several. `home` outlines the options the home
 * has too (on a comp's form); leave it out for the home's own pickers.
 */
export function FeaturePicker({ value, onChange, home, disabled, only, type }: {
  value: Features;
  onChange: (next: Features) => void;
  home?: Features;
  disabled?: boolean;
  /** Just these groups (Edit details shows them all; a card can show fewer). */
  only?: FeatureKey[];
  /** The home's or the comp's type: groups and options that don't apply to it are hidden. Unknown: all. */
  type?: PropertyType | null;
}) {
  return (
    <div className="feature-rows">
      {groupsFor(type).filter((g) => !only || only.includes(g.key)).map((g) => (
        <div key={g.key} className="feature-row" role="group" aria-label={g.label}>
          <span className="feature-label nr-label-line">
            {g.label}
            {g.key === 'condition' && <Info label="About unit condition" text={CONDITION_INFO} align="left" />}
          </span>
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
