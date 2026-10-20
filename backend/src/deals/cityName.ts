const aliases = new Map([
  ['ת"א', 'תל אביב-יפו'],
  ['תל אביב', 'תל אביב-יפו'],
  ['תל אביב יפו', 'תל אביב-יפו'],
  ['ב"ש', 'באר שבע'],
  ['מודיעין', 'מודיעין-מכבים-רעות'],
  ['מודיעין מכבים רעות', 'מודיעין-מכבים-רעות'],
])

/** Explicit city aliases and typography only; no fuzzy matching or row mutation. */
export function cityName(value: string): string {
  const normalized = value.normalize('NFKC')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[״“”]/g, '"')
    .replace(/[\-‐‑‒–—־]/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return aliases.get(normalized) ?? normalized
}
