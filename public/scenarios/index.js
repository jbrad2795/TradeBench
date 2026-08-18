// Registry of available scenario packs. Add a pack here and it appears in the
// play-room dropdown and is selectable by --scenario in the headless runner.
import s1 from "./s1-article-xxviii-steel.js";
import { placeholderPacks } from "./placeholders.js";

export const packs = [s1, ...placeholderPacks];

export const getPack = (id) => packs.find((p) => p.id === id);
export const defaultPackId = s1.id;

/** Lightweight list for the dropdown - no prompt text. */
export const packIndex = () =>
  packs.map((p) => ({
    id: p.id,
    label: p.label,
    version: p.version,
    status: p.status,
    seats: p.seats.length,
    rounds: p.rounds,
    placeholder: Boolean(p.placeholder),
    // Labels only - never any brief text.
    seatList: p.seats.map((s) => ({ id: s.id, label: s.label, party: s.party, partyName: s.partyName })),
    dispositions: Object.keys(p.dispositions || {}),
  }));
