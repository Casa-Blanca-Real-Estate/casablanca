// The workspace header's sub line (the handoff): "Seller · Jordan and Sam · No sq ft · 3 bd · 3 ba · Fl 17".
// A part with no value is left out; the size says "No sq ft" when the home has none.
import type { Brief, Intake, SendState } from '../../../workspace/state.ts';
import { sqft } from '../../../workspace/format.ts';

export function clientNameOf(brief: Brief, send: SendState): string {
  return (brief.clientName?.value ?? send.clientName?.value ?? '').trim();
}

export function homeSubLine(input: { side: 'buyer' | 'seller'; brief: Brief; send: SendState; intake: Intake; sf: boolean }): string {
  const { side, brief, send, intake, sf } = input;
  const area = intake.areaSqft;
  const size = sf && area ? `${sqft(area.value, area.approx)}${area.estimate ? ' est.' : ''}` : 'No sq ft';
  const count = (n: number | undefined, unit: string) => (n === undefined || !Number.isFinite(n) ? '' : `${n} ${unit}`);
  return [
    side === 'seller' ? 'Seller' : 'Buyer',
    clientNameOf(brief, send),
    size,
    count(intake.beds?.value, 'bd'),
    count(intake.baths?.value, 'ba'),
    intake.floor ? `Fl ${intake.floor.value}` : '',
  ].filter(Boolean).join(' · ');
}
