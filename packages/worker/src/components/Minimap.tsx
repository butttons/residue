import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import type { Message } from "../types";

type MinimapProps = {
	sessions: MinimapSession[];
};

type MinimapSession = {
	id: string;
	messages: Message[];
};

const ROLE_COLORS: Record<string, string> = {
	human: "#34d399",
	assistant: "#a78bfa",
	tool: "#fbbf24",
};

const DEFAULT_COLOR = "#71717a";

const estimateWeight = (msg: Message): number => {
	let weight = msg.content.length;
	if (msg.thinking) {
		for (const tb of msg.thinking) {
			weight += tb.content.length;
		}
	}
	if (msg.tool_calls) {
		for (const tc of msg.tool_calls) {
			weight += tc.input.length + tc.output.length;
		}
	}
	// Include tool call count as a small weight bump for nesting
	if (msg.tool_calls) {
		weight += msg.tool_calls.length * 100;
	}
	return Math.max(weight, 1);
};

const Minimap: FC<MinimapProps> = ({ sessions }) => {
	if (sessions.length === 0) return <span />;

	// Pre-compute weights for each session so the JS can use them
	const sessionsWithWeights = sessions.map((s) => ({
		...s,
		weights: s.messages.map(estimateWeight),
	}));

	return (
		<div
			id="minimap"
			class="hidden lg:block"
			style="position:fixed;right:12px;top:60px;bottom:60px;width:48px;z-index:40;"
		>
			{/* Viewport indicator */}
			<div
				id="minimap-viewport"
				style="position:absolute;left:-2px;right:-2px;top:0;height:40px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:2px;cursor:grab;z-index:2;pointer-events:auto;"
			/>

			{/* One blocks container per session */}
			{sessionsWithWeights.map((s, sIdx) => (
				<div
					id={`minimap-session-${sIdx}`}
					class="minimap-session"
					data-session-id={s.id}
					style={`position:absolute;top:0;left:0;right:0;bottom:0;overflow:hidden;${sIdx !== 0 ? "display:none;" : ""}`}
				>
					{s.messages.map((msg, mIdx) => {
						const color = ROLE_COLORS[msg.role] ?? DEFAULT_COLOR;
						const hasToolCalls =
							msg.tool_calls !== undefined && msg.tool_calls.length > 0;

						return (
							<div
								class="minimap-block"
								data-msg-index={mIdx}
								data-weight={s.weights[mIdx]}
								data-tool-count={hasToolCalls ? msg.tool_calls!.length : 0}
								data-color={color}
								style="cursor:pointer;"
							>
								<div
									class="minimap-bar"
									style={`background:${color};opacity:0.45;border-radius:1px;transition:opacity 0.1s;`}
								/>
								{hasToolCalls &&
									msg.tool_calls!.map(() => (
										<div
											class="minimap-tool"
											style={`background:${ROLE_COLORS.tool};opacity:0.35;border-radius:1px;margin-left:8px;`}
										/>
									))}
							</div>
						);
					})}
				</div>
			))}

			{/* Client-side behavior */}
			{raw(`<script>
(function() {
	var minimap = document.getElementById('minimap');
	var viewport = document.getElementById('minimap-viewport');
	if (!minimap || !viewport) return;

	var sessionPanels = minimap.querySelectorAll('.minimap-session');
	var activeSessionIdx = 0;

	// Layout: compute heights to fit minimap exactly
	// Cap per-block height so small sessions don't stretch absurdly
	var MAX_BAR_HEIGHT = 24;

	function layoutSession(panel) {
		var blocks = panel.querySelectorAll('.minimap-block');
		if (blocks.length === 0) return;

		var minimapH = minimap.offsetHeight;
		var totalWeight = 0;
		var blockData = [];

		for (var i = 0; i < blocks.length; i++) {
			var w = parseInt(blocks[i].getAttribute('data-weight'), 10) || 1;
			var tc = parseInt(blocks[i].getAttribute('data-tool-count'), 10) || 0;
			totalWeight += w;
			blockData.push({ el: blocks[i], weight: w, toolCount: tc });
		}

		// Fixed costs: 1px gap per block, 1px height + 1px margin per tool
		var totalTools = 0;
		for (var j = 0; j < blockData.length; j++) totalTools += blockData[j].toolCount;
		var fixedCost = blockData.length + (totalTools * 2);
		var barBudget = Math.max(blockData.length, minimapH - fixedCost);

		// First pass: assign proportional heights, minimum 1px, capped at MAX_BAR_HEIGHT
		var heights = [];
		var usedH = 0;
		for (var k = 0; k < blockData.length; k++) {
			var h = Math.max(1, Math.floor((blockData[k].weight / totalWeight) * barBudget));
			if (h > MAX_BAR_HEIGHT) h = MAX_BAR_HEIGHT;
			heights.push(h);
			usedH += h;
		}

		// Second pass: trim excess if rounding pushed us over budget
		var excess = usedH - barBudget;
		while (excess > 0) {
			var tallest = 0;
			for (var m = 1; m < heights.length; m++) {
				if (heights[m] > heights[tallest]) tallest = m;
			}
			if (heights[tallest] <= 1) break;
			heights[tallest]--;
			excess--;
		}

		// Apply
		for (var a = 0; a < blockData.length; a++) {
			var bar = blockData[a].el.querySelector('.minimap-bar');
			if (bar) bar.style.height = heights[a] + 'px';

			var tools = blockData[a].el.querySelectorAll('.minimap-tool');
			for (var t = 0; t < tools.length; t++) {
				tools[t].style.height = '1px';
				tools[t].style.marginTop = '1px';
			}

			blockData[a].el.style.marginBottom = '1px';
		}
	}

	// Initial layout for all sessions
	for (var s = 0; s < sessionPanels.length; s++) {
		layoutSession(sessionPanels[s]);
	}

	// Get conversation messages for active session
	function getConversationMsgs() {
		var allMsgs = document.querySelectorAll('[data-msg-index]');
		var result = [];
		for (var i = 0; i < allMsgs.length; i++) {
			if (!minimap.contains(allMsgs[i])) {
				result.push(allMsgs[i]);
			}
		}
		return result;
	}

	// Click to jump -- map minimap click position to scroll position
	minimap.addEventListener('click', function(e) {
		if (e.target === viewport) return;
		var rect = minimap.getBoundingClientRect();
		var fraction = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
		var docH = document.documentElement.scrollHeight;
		var winH = window.innerHeight;
		window.scrollTo({ top: fraction * (docH - winH), behavior: 'smooth' });
	});

	// Hover highlight
	minimap.addEventListener('mouseover', function(e) {
		var bar = e.target.closest('.minimap-bar');
		if (bar) bar.style.opacity = '0.85';
	});
	minimap.addEventListener('mouseout', function(e) {
		var bar = e.target.closest('.minimap-bar');
		if (bar) bar.style.opacity = '0.45';
	});

	// Viewport tracking
	function updateViewport() {
		var docH = document.documentElement.scrollHeight;
		var winH = window.innerHeight;
		var scrollTop = window.scrollY;
		var mmH = minimap.offsetHeight;

		var scrollFraction = docH > winH ? scrollTop / (docH - winH) : 0;
		var viewFraction = docH > 0 ? winH / docH : 1;

		var vpH = Math.max(16, Math.round(viewFraction * mmH));
		var vpTop = Math.round(scrollFraction * (mmH - vpH));

		viewport.style.height = vpH + 'px';
		viewport.style.top = vpTop + 'px';
	}

	window.addEventListener('scroll', updateViewport, { passive: true });
	window.addEventListener('resize', function() {
		for (var r = 0; r < sessionPanels.length; r++) layoutSession(sessionPanels[r]);
		updateViewport();
	});
	updateViewport();

	// Drag viewport
	var isDragging = false;
	var dragStartY = 0;
	var dragStartScroll = 0;

	viewport.addEventListener('mousedown', function(e) {
		isDragging = true;
		dragStartY = e.clientY;
		dragStartScroll = window.scrollY;
		viewport.style.cursor = 'grabbing';
		e.preventDefault();
	});

	document.addEventListener('mousemove', function(e) {
		if (!isDragging) return;
		var dy = e.clientY - dragStartY;
		var docH = document.documentElement.scrollHeight;
		var mmH = minimap.offsetHeight;
		var scrollDelta = (dy / mmH) * docH;
		window.scrollTo(0, dragStartScroll + scrollDelta);
	});

	document.addEventListener('mouseup', function() {
		if (!isDragging) return;
		isDragging = false;
		viewport.style.cursor = 'grab';
	});

	// Tab switching: listen for clicks on session tabs
	function switchMinimapSession(tabIdx) {
		for (var i = 0; i < sessionPanels.length; i++) {
			sessionPanels[i].style.display = i === tabIdx ? '' : 'none';
		}
		activeSessionIdx = tabIdx;
	}

	// Hook into existing tab clicks
	var tabs = document.querySelectorAll('.session-tab');
	for (var ti = 0; ti < tabs.length; ti++) {
		(function(idx) {
			tabs[idx].addEventListener('click', function() {
				switchMinimapSession(idx);
			});
		})(ti);
	}

	// Handle hash-based tab activation
	var hash = location.hash;
	if (hash && hash.startsWith('#session-')) {
		var sid = hash.slice(9);
		for (var hi = 0; hi < sessionPanels.length; hi++) {
			if (sessionPanels[hi].getAttribute('data-session-id') === sid) {
				switchMinimapSession(hi);
				break;
			}
		}
	}
})();
</script>`)}
		</div>
	);
};

export { Minimap };
export type { MinimapProps, MinimapSession };
