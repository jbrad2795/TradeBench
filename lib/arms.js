// Disposition arms.
//
// Disposition is delegation posture, not individual temperament: "all four seats
// firm" is a government negotiating from a firm posture - capital instructs
// firmly, post executes firmly - not four people who happen to share a mood.
//
// Arms name seats here because an arm is a configuration choice. Engine routing
// still keys only off level and country.

const all = (key) => (pack) => Object.fromEntries(pack.seats.map((s) => [s.id, key]));

export const ARMS = {
  firm: {
    label: "Firm (whole table)",
    description: "Every seat carries the firm posture.",
    assign: all("firm"),
  },
  accommodating: {
    label: "Accommodating (whole table)",
    description: "Every seat carries the accommodating posture.",
    assign: all("accommodating"),
  },
  control: {
    label: "Control (no disposition)",
    description: "Block 3 omitted entirely for every seat. No filler.",
    assign: () => ({}),
  },
  focal_firm_ukgva: {
    label: "Focal: UK Geneva firm",
    description:
      "Exactly one seat tagged. Lets within-run adaptation be read, because every " +
      "other seat is untagged in both this arm and the control baseline.",
    assign: () => ({ "uk-geneva": "firm" }),
  },
  focal_firm_eugva: {
    label: "Focal: EU Geneva firm",
    description:
      "Mirror of focal_firm_ukgva with the EU post seat tagged instead of the UK's - " +
      "exactly one seat tagged, everything else untagged in both this arm and the " +
      "control baseline, so within-run adaptation can be read from either side of the table.",
    assign: () => ({ "eu-geneva": "firm" }),
  },
};

export const ARM_KEYS = Object.keys(ARMS);

/**
 * @returns {Record<string,string|null>} seat id -> disposition key, or absent for none
 */
export function dispositionsForArm(pack, armKey) {
  const arm = ARMS[armKey];
  if (!arm) throw new Error(`Unknown arm "${armKey}". Known: ${ARM_KEYS.join(", ")}`);
  const map = arm.assign(pack);
  // A disposition named by an arm must exist on the pack.
  for (const [seatId, key] of Object.entries(map)) {
    if (key && !pack.dispositions?.[key]) {
      throw new Error(`Arm "${armKey}" assigns disposition "${key}" to ${seatId}, but the pack has no such disposition`);
    }
  }
  return map;
}
