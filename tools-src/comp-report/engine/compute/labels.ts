// How the engine names a property in what it writes: "200 Chambers Street #10A".

import type { PropertyIdentity } from '../types.ts';

export function propertyLabel(identity: PropertyIdentity, fallback: string): string {
  const street = identity.address.street;
  const unit = identity.unit.raw;
  return street ? `${street}${unit ? ` ${unit.startsWith('#') ? unit : `#${unit}`}` : ''}` : fallback;
}
