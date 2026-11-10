/**
 * The clock field of the game (PC) evaluates a small formula, so "100/3" is both quicker to type and more exact than
 * the "33.3334" it stores for a third. This finds the fraction a player would type, if a short one fits.
 */
export class ClockFraction
{

	/**
	 * Denominators that Satisfactory ratios produce (recipe cycles of 2-60 s, outputs of 1-20). A four-decimal value
	 * carries too little information to tell a rounded fraction from a plain decimal, so allowing every denominator
	 * would dress ordinary decimals up as "2279/26".
	 */
	private static readonly DENOMINATORS: readonly number[] = [3, 6, 7, 9, 11, 12, 13, 14, 15, 18, 21, 24, 27];

	/** In percentage points: the game and the planner keep four decimals, so a true fraction is within one unit. */
	private static readonly TOLERANCE = 0.0001;

	/** Values that are already exact at this many decimals stay decimals (100, 62.5, 12.25). */
	private static readonly CLEAN_DECIMALS = 2;

	private static readonly CLEAN_TOLERANCE = 1e-9;

	/** "a/b" in lowest terms, or null when the plain decimal is the better text. */
	public static of(clockSpeed: number): string | null
	{
		if (!isFinite(clockSpeed)) {
			return null;
		}
		const scale = Math.pow(10, ClockFraction.CLEAN_DECIMALS);
		if (Math.abs(clockSpeed - Math.round(clockSpeed * scale) / scale) <= ClockFraction.CLEAN_TOLERANCE) {
			return null;
		}
		// Smallest denominator first: it is the shortest formula, and its numerator/denominator pair is already reduced.
		for (const denominator of ClockFraction.DENOMINATORS) {
			const numerator = Math.round(clockSpeed * denominator);
			if (numerator === 0 || Math.abs(clockSpeed - numerator / denominator) > ClockFraction.TOLERANCE) {
				continue;
			}
			if (ClockFraction.gcd(Math.abs(numerator), denominator) !== 1) {
				continue;
			}
			return `${numerator}/${denominator}`;
		}
		return null;
	}

	private static gcd(a: number, b: number): number
	{
		while (b !== 0) {
			const rest = a % b;
			a = b;
			b = rest;
		}
		return a;
	}

}
