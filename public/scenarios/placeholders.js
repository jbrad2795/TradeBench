// Placeholder packs. These reserve their slot in the dropdown and in the run
// matrix; they carry no prompt text yet and cannot be run. Fill in the blocks
// from a prompts doc the same way S1 was built, then delete `placeholder: true`.

const stub = (id, label, note) => ({
  id,
  label,
  version: "0.0",
  status: note,
  placeholder: true,
  rounds: 3,
  facts: "",
  rules: "",
  dispositions: {},
  seats: [],
  speakingOrder: [],
  schemas: {},
  proposal: { statusValues: [], settlementTerms: [] },
});

export const placeholderPacks = [
  stub(
    "s2-synthetic-twin",
    "S2 - Synthetic twin of S1 (not yet written)",
    "Placeholder. Structurally matched to S1 - same decision architecture, different commodity, parties and numbers. Used as the contamination control.",
  ),
  stub(
    "s3-tbd",
    "S3 - To be defined (not yet written)",
    "Placeholder. Reserved for a third scenario.",
  ),
];
