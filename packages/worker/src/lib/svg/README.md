# `lib/svg` -- Server-Side SVG Chart Library

A collection of pure utilities for building SVG visualizations rendered as Hono JSX on the server. No client-side charting libraries. Everything is server-rendered HTML/SVG.

## Architecture

```
lib/svg/
  index.ts            Barrel export -- import everything from here
  colors.ts           Color palettes, heatmap scales, series cycling
  dates.ts            UTC date formatting, month labels, week-start
  math.ts             Grid ticks, value-to-pixel, label spacing
  text.ts             Pluralization
  primitives.tsx      Generic SVG elements: Rect, Circle, Line, Text
  tooltip.tsx         Popover-based tooltip component
  hooks/
    index.ts          Barrel for hooks
    useHeatmapLayout.ts     GitHub-style activity grid
    useBarChartLayout.ts    Weekly paired bar chart
    useCommitGraphLayout.ts Git-style commit graph with session lanes
```

The design has three layers:

1. **Utilities** (`colors`, `dates`, `math`, `text`) -- pure functions with no JSX. Reusable across any chart.
2. **Primitives** (`primitives`, `tooltip`) -- generic SVG JSX elements. They know nothing about charts. They accept all styling as props.
3. **Hooks** (`hooks/*`) -- layout functions that take raw data and return fully positioned layout objects. Components render what hooks return with zero inline math.

## Usage

Import everything from the barrel:

```tsx
import { useHeatmapLayout, Rect, Text, Tooltip, zinc } from "@/lib/svg";
```

Or import from specific modules:

```tsx
import { heatmapColor, zinc } from "@/lib/svg/colors";
import { useHeatmapLayout } from "@/lib/svg/hooks/useHeatmapLayout";
```

### Building a chart

The pattern is always the same:

1. Call a hook with your data. It returns a layout object with every position, size, color, and label pre-computed.
2. Render the layout using primitives. No math in JSX.

```tsx
const MyChart: FC<{ dailyCounts: DailyActivityCount[] }> = ({ dailyCounts }) => {
  const layout = useHeatmapLayout({ dailyCounts });

  return (
    <div>
      <svg width={layout.svgWidth} height={layout.svgHeight}>
        {layout.cells.map((cell) => (
          <Rect
            x={cell.x}
            y={cell.y}
            width={layout.cellSize}
            height={layout.cellSize}
            fill={cell.fill}
            rx={2}
            tooltipId={cell.tooltipId}
            isInteractive
          />
        ))}
      </svg>

      {layout.cells.map((cell) => (
        <Tooltip id={cell.tooltipId} title={cell.tooltipTitle} body={cell.tooltipBody} />
      ))}
    </div>
  );
};
```

## Module Reference

### `colors.ts`

| Export | Description |
|--------|------------|
| `zinc` | Zinc gray scale object (`zinc[800]` -> `"#27272a"`) |
| `palette` | Named chart colors (`palette.blue`, `palette.amber`, etc.) |
| `seriesColors` | Ordered color array for series/lane assignment |
| `pickSeriesColor({ index })` | Pick from series colors by index (wraps around) |
| `heatmapStops` | 4-stop amber intensity scale (`empty`, `low`, `medium`, `high`, `max`) |
| `heatmapColor({ value, max })` | Map a value to a heatmap color string |

### `dates.ts`

| Export | Description |
|--------|------------|
| `MONTH_LABELS` | `["Jan", "Feb", ..., "Dec"]` |
| `toDateStr({ date })` | `Date` -> `"YYYY-MM-DD"` in UTC |
| `formatLong({ dateStr })` | `"2025-03-14"` -> `"Mar 14, 2025"` |
| `formatShort({ dateStr })` | `"2025-03-14"` -> `"Mar 14"` |
| `monthIndex({ dateStr })` | 0-based month from date string |
| `weekStart({ dateStr })` | Sunday week-start date string |

### `math.ts`

| Export | Description |
|--------|------------|
| `gridTicks({ max })` | Compute nice Y-axis tick values from 0 to max |
| `yFromValue({ value, max, top, height })` | Y pixel coordinate for a value |
| `heightFromValue({ value, max, height })` | Pixel height for a bar value |
| `labelStep({ slotWidth, labelWidth, gap? })` | X-axis label interval to avoid overlap |

### `text.ts`

| Export | Description |
|--------|------------|
| `pluralize({ count, singular })` | `"3 commits"` / `"1 commit"` |

### `primitives.tsx`

Generic SVG JSX wrappers. All accept styling as props -- no hardcoded colors.

| Component | Key Props |
|-----------|-----------|
| `Rect` | `x`, `y`, `width`, `height`, `fill`, `rx?`, `opacity?`, `tooltipId?`, `isInteractive?` |
| `Circle` | `cx`, `cy`, `r`, `fill` |
| `Line` | `x1`, `y1`, `x2`, `y2`, `stroke`, `strokeWidth?`, `strokeOpacity?`, `isDashed?`, `dashArray?` |
| `Text` | `x`, `y`, `fill`, `children`, `fontSize?`, `anchor?` |

**`tooltipId`** on `Rect` sets `data-popover-target` for the shared tooltip system.
**`isInteractive`** controls `pointer-events`. Default is `false` (no pointer events).

### `tooltip.tsx`

| Component | Props | Description |
|-----------|-------|-------------|
| `Tooltip` | `id`, `title`, `body` | Popover div with `.activity-tooltip` styling. Pair with a `Rect` that has `tooltipId={id}`. |

The tooltip system uses the HTML Popover API (`popover="manual"`). The shared script in `Layout.tsx` handles positioning and show/hide on hover over elements with `data-popover-target`.

### `hooks/useHeatmapLayout.ts`

```ts
useHeatmapLayout({ dailyCounts: DailyActivityCount[] }) -> HeatmapLayout
```

Returns:
- `cells[]` -- `{ x, y, fill, tooltipId, tooltipTitle, tooltipBody }`
- `monthLabels[]` -- `{ text, x }`
- `dayLabels[]` -- `{ text, y }`
- `svgWidth`, `svgHeight`, `cellSize`
- `summary` -- e.g. `"42 conversations in the last year"`

### `hooks/useBarChartLayout.ts`

```ts
useBarChartLayout({ dailyCounts, commitColor, sessionColor }) -> BarChartLayout | null
```

Returns `null` when there is no data. Otherwise:
- `groups[]` -- each has `hoverX`, `hoverWidth`, `tooltipId/Title/Body`, and `bars[]` (positioned bars with `x`, `y`, `width`, `height`, `fill`)
- `gridLines[]` -- `{ value, y }`
- `xLabels[]` -- `{ text, x }`
- `svgWidth`, `svgHeight`, `topPadding`, `drawableHeight`, `leftGutter`
- `gridLineColor`, `gridLabelColor`, `xLabelColor`, `xLabelY`
- `totalCommits`, `totalSessions`, `commitColor`, `sessionColor`

### `hooks/useCommitGraphLayout.ts`

```ts
useCommitGraphLayout({ data: CommitGraphInput }) -> CommitGraphLayout
```

`CommitGraphInput` has `commitCount`, `lanes[]` (with `lane`, `color`, `startRow`, `endRow`, `commitRows`), and `laneCount`.

Returns:
- `lines[]` -- `{ x1, y1, x2, y2, stroke, strokeWidth, strokeOpacity?, isDashed?, dashArray? }`
- `dots[]` -- `{ cx, cy, r, fill }`
- `svgWidth`, `totalHeight`, `rowHeight`, `contentLeftPad`

## Adding a New Chart

1. Add a hook in `hooks/` that takes raw data and returns a layout object with all positions pre-computed.
2. Export it from `hooks/index.ts` and `svg/index.ts`.
3. Write a component that calls the hook and maps the layout to `Rect`/`Circle`/`Line`/`Text` primitives.
4. Use `Tooltip` for hover popovers (set `tooltipId` on the interactive `Rect`, render `<Tooltip>` below the SVG).
5. Pick colors from `palette` or `zinc` -- never hardcode hex strings in components.
