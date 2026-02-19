/**
 * Computes a fully positioned commit graph with trunk line, session lanes,
 * lane dots, and horizontal connectors.
 *
 * Returns arrays of lines and dots with all coordinates resolved.
 * The component just iterates and renders -- no math in JSX.
 */
import { zinc } from "@/lib/svg/colors";

type CommitGraphLine = {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	stroke: string;
	strokeWidth: number;
	strokeOpacity?: number;
	isDashed?: boolean;
	dashArray?: string;
};

type CommitGraphDot = {
	cx: number;
	cy: number;
	r: number;
	fill: string;
};

type CommitGraphLayout = {
	lines: CommitGraphLine[];
	dots: CommitGraphDot[];
	svgWidth: number;
	totalHeight: number;
	rowHeight: number;
	contentLeftPad: number;
};

type CommitGraphInput = {
	commitCount: number;
	lanes: {
		lane: number;
		color: string;
		startRow: number;
		endRow: number;
		commitRows: number[];
	}[];
	laneCount: number;
};

const ROW_HEIGHT = 60;
const LANE_SPACING = 20;
const DOT_RADIUS = 4;
const LANE_DOT_RADIUS = 3.5;
const LINE_WIDTH = 2;
const TRUNK_GAP = 14;
const FIRST_LINE_OFFSET = 12;

const laneX = ({ lane }: { lane: number }): number =>
	lane * LANE_SPACING + LANE_SPACING / 2;

const rowY = ({ row }: { row: number }): number =>
	row * ROW_HEIGHT + FIRST_LINE_OFFSET;

const trunkX = ({ laneCount }: { laneCount: number }): number =>
	laneCount > 0 ? laneCount * LANE_SPACING + TRUNK_GAP : DOT_RADIUS + 2;

const graphWidth = ({ laneCount }: { laneCount: number }): number =>
	trunkX({ laneCount }) + DOT_RADIUS + 4;

const useCommitGraphLayout = ({
	data,
}: {
	data: CommitGraphInput;
}): CommitGraphLayout => {
	const { commitCount, lanes, laneCount } = data;
	const trunk = trunkX({ laneCount });
	const width = graphWidth({ laneCount });
	const totalHeight = commitCount * ROW_HEIGHT;

	const lines: CommitGraphLine[] = [];
	const dots: CommitGraphDot[] = [];

	/** Trunk line (dashed, subtle). */
	if (commitCount > 1) {
		lines.push({
			x1: trunk,
			y1: rowY({ row: 0 }),
			x2: trunk,
			y2: rowY({ row: commitCount - 1 }),
			stroke: zinc[800],
			strokeWidth: LINE_WIDTH,
			isDashed: true,
			dashArray: "3,4",
		});
	}

	/** Lane vertical lines. */
	for (const lane of lanes) {
		lines.push({
			x1: laneX({ lane: lane.lane }),
			y1: rowY({ row: lane.startRow }),
			x2: laneX({ lane: lane.lane }),
			y2: rowY({ row: lane.endRow }),
			stroke: lane.color,
			strokeWidth: LINE_WIDTH,
			strokeOpacity: 0.5,
		});
	}

	/** Horizontal connectors from lane dots to trunk. */
	if (laneCount > 0) {
		for (const lane of lanes) {
			for (const row of lane.commitRows) {
				lines.push({
					x1: laneX({ lane: lane.lane }) + LANE_DOT_RADIUS + 1,
					y1: rowY({ row }),
					x2: trunk - DOT_RADIUS - 1,
					y2: rowY({ row }),
					stroke: lane.color,
					strokeWidth: 1,
					strokeOpacity: 0.25,
					isDashed: true,
				});
			}
		}
	}

	/** Lane dots. */
	for (const lane of lanes) {
		for (const row of lane.commitRows) {
			dots.push({
				cx: laneX({ lane: lane.lane }),
				cy: rowY({ row }),
				r: LANE_DOT_RADIUS,
				fill: lane.color,
			});
		}
	}

	/** Trunk dots (small, muted). */
	for (let i = 0; i < commitCount; i++) {
		dots.push({
			cx: trunk,
			cy: rowY({ row: i }),
			r: 2,
			fill: zinc[700],
		});
	}

	return {
		lines,
		dots,
		svgWidth: width,
		totalHeight,
		rowHeight: ROW_HEIGHT,
		contentLeftPad: width + 8,
	};
};

export { useCommitGraphLayout };
export type {
	CommitGraphLayout,
	CommitGraphLine,
	CommitGraphDot,
	CommitGraphInput,
};
