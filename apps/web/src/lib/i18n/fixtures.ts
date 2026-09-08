// Pseudolocale + long-text fixtures (t_alt_fnd_011).
//
// Test-only helpers that prove the UI survives translations it has not
// shipped yet: accented/length-expanded pseudolocales catch clipped
// layouts and concatenated strings, while long-text fixtures exercise
// wrapping, truncation, and overflow in stories and unit tests. Product
// code never imports this module (tests and stories only).

const PSEUDO_ACCENTS: Record<string, string> = {
	a: "à",
	b: "ƀ",
	c: "ç",
	d: "ď",
	e: "ë",
	g: "ğ",
	h: "ĥ",
	i: "ï",
	j: "ĵ",
	k: "ķ",
	l: "ľ",
	m: "ɱ",
	n: "ñ",
	o: "ö",
	p: "ƥ",
	q: "ʠ",
	r: "ř",
	s: "š",
	t: "ť",
	u: "ü",
	v: "ṽ",
	w: "ŵ",
	x: "ẋ",
	y: "ÿ",
	z: "ž",
	A: "À",
	B: "Ɓ",
	C: "Ç",
	D: "Ď",
	E: "Ë",
	H: "Ĥ",
	I: "Ï",
	N: "Ñ",
	O: "Ö",
	R: "Ř",
	S: "Š",
	T: "Ť",
	U: "Ü",
	Y: "Ÿ",
	Z: "Ž",
};

/**
 * Deterministic pseudolocalization: wrap in ⟦⟧, accent Latin letters,
 * and pad with "～" to ~140% length so suites catch truncation and
 * overflow the way a real long translation would. Placeholders
 * (`{name}`) pass through untouched so interpolation still works.
 */
export function toPseudolocale(source: string): string {
	const segments = source.split(/(\{[A-Za-z0-9_]+\})/g);
	const accented = segments
		.map((segment) => {
			if (/^\{[A-Za-z0-9_]+\}$/.test(segment)) {
				return segment;
			}
			return Array.from(segment)
				.map((char) => PSEUDO_ACCENTS[char] ?? char)
				.join("");
		})
		.join("");
	const targetLength = Math.ceil(source.length * 1.4) + 2;
	const padding = Math.max(0, targetLength - (accented.length + 2));
	return `⟦${accented}${"～".repeat(padding)}⟧`;
}

/** Pseudolocalize every value of a message dictionary (shape-preserving). */
export function pseudolocalizeDictionary(dict: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(dict)) {
		out[key] = toPseudolocale(value);
	}
	return out;
}

/** Long-text fixtures for wrapping/overflow suites and stories. */
export const LONG_TEXT_FIXTURES = {
	short: "An unexpectedly long navigation label that keeps going past any reasonable sidebar width",
	medium:
		"Notification preferences live here, including every channel, schedule, threshold, and digest option your household could ever configure across devices and timezones.",
	paragraph:
		"Dies ist eine absichtlich überlange Beispielbeschreibung, damit umbrechende Layouts, abgeschnittene Schaltflächenbeschriftungen und überlaufende Karteninhalte bereits im englischen Ausgangszustand sichtbar werden, lange bevor die erste echte Übersetzung eintrifft.",
	balanceLabel:
		"Total balance across every connected checking, savings, and investment account (updated 2 minutes ago)",
} as const;

export type LongTextFixtureName = keyof typeof LONG_TEXT_FIXTURES;
