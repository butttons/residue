/**
 * Text formatting helpers for chart labels and tooltips.
 */

/** "3 commits" / "1 commit" */
const pluralize = ({
	count,
	singular,
}: {
	count: number;
	singular: string;
}): string => `${count} ${count === 1 ? singular : `${singular}s`}`;

export { pluralize };
