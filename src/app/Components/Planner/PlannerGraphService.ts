import {Injectable, OnDestroy, Signal, signal, untracked} from '@angular/core';
import {faCircleCheck, faLock, faTriangleExclamation, IconDefinition} from '@fortawesome/free-solid-svg-icons';
import {Cell, Edge as X6Edge, EdgeToolNativeItem, EdgeView, Export, Graph as X6Graph, Node as X6Node, Selection} from '@antv/x6';
import type {Metadata as PortsMetadata, PortMetadata} from '@antv/x6/lib/model/port';
import type {Handle as VertexHandle} from '@antv/x6/lib/registry/tool/vertices';
import {GraphPoint} from '@src/Model/Planner/Graph/GraphPoint';
import {FlowLayoutEdge, FlowLayoutNode, FlowLayoutOptions, layoutFlow} from '@src/Model/Planner/Layout/FlowLayout';
import {RouterBox, rerouteLine} from '@src/Model/Planner/Layout/LineRouter';
import {collectFlowJunctions, FlowLinePalette} from '@src/Components/Planner/Graph/FlowLinePalette';
import {Observable, Subject, Subscription} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {GraphContextMenuRequest} from '@src/Components/Planner/GraphContextMenuRequest';
import {ExportBox} from '@src/Model/Export/ExportBox';
import {GraphSvgCleaner} from '@src/Model/Export/GraphSvgCleaner';
import {GraphSvgSnapshot} from '@src/Model/Export/GraphSvgSnapshot';
import {GraphTouchGestures} from '@src/Components/Planner/GraphTouchGestures';
import {GraphEdgeAddRequest} from '@src/Components/Planner/GraphEdgeAddRequest';
import {PlannerActionsService} from '@src/Components/Planner/PlannerActionsService';
import {PortConnectGesture} from '@src/Components/Planner/PortConnectGesture';
import {PanelLayoutService} from '@src/Components/Planner/Panel/PanelLayoutService';
import {NodeTooltipContent} from '@src/Components/Planner/Tooltip/NodeTooltipContent';
import {PlannerNodeTooltipService} from '@src/Components/Planner/Tooltip/PlannerNodeTooltipService';
import {Item} from '@src/Model/Data/Entities/Item';
import {IconUrlService} from '@src/Model/Data/IconUrlService';
import {VersionManager} from '@src/Model/Data/VersionManager';
import {RateFormatter} from '@src/Model/RateFormatter';
import {Graph} from '@src/Model/Planner/Graph/Graph';
import {GraphEdge} from '@src/Model/Planner/Graph/GraphEdge';
import {GraphEdgeBuilder} from '@src/Model/Planner/Graph/GraphEdgeBuilder';
import {GraphLayoutResolver} from '@src/Model/Planner/GraphLayoutResolver';
import {GraphLayoutSettings} from '@src/Model/Planner/GraphLayoutSettings';
import {GraphDirection} from '@src/Model/Planner/GraphDirection';
import {BeltGraphPlan, BeltPlanner} from '@src/Model/Planner/BeltPlanner';
import {ConveyorCapacity} from '@src/Model/Planner/ConveyorCapacity';
import {ExtractorCapacity} from '@src/Model/Planner/ExtractorCapacity';
import {GraphMetrics} from '@src/Model/Planner/Graph/GraphMetrics';
import {GraphNodeCapacityWarning} from '@src/Model/Planner/Graph/GraphNodeCapacityWarning';
import {GraphNodeExtractorWarning} from '@src/Model/Planner/Graph/GraphNodeExtractorWarning';
import {GraphNodeWarnings} from '@src/Model/Planner/Graph/GraphNodeWarnings';
import {GraphWarningDetail} from '@src/Model/Planner/Graph/GraphWarningDetail';
import {GraphWarningEntry} from '@src/Model/Planner/Graph/GraphWarningEntry';
import {GraphReconciler} from '@src/Model/Planner/Graph/GraphReconciler';
import {PlanManager} from '@src/Model/Planner/PlanManager';
import {PlanNameResolver} from '@src/Model/Planner/PlanNameResolver';
import {SettingsManager} from '@src/Model/Settings/SettingsManager';
import {SpecialClasses} from '@src/Model/Planner/SpecialClasses';
import {AugmenterNode} from '@src/Model/Planner/Solver/Response/AugmenterNode';
import {ByproductNode} from '@src/Model/Planner/Solver/Response/ByproductNode';
import {GeneratorNode} from '@src/Model/Planner/Solver/Response/GeneratorNode';
import {InputNode} from '@src/Model/Planner/Solver/Response/InputNode';
import {ItemAmountNode} from '@src/Model/Planner/Solver/Response/ItemAmountNode';
import {MineNode} from '@src/Model/Planner/Solver/Response/MineNode';
import {Node} from '@src/Model/Planner/Solver/Response/Node';
import {NodeIO} from '@src/Model/Planner/Solver/Response/NodeIO';
import {ProductNode} from '@src/Model/Planner/Solver/Response/ProductNode';
import {MachineGroup} from '@src/Model/Planner/Solver/Response/MachineGroup';
import {RecipeNode} from '@src/Model/Planner/Solver/Response/RecipeNode';
import {SinkNode} from '@src/Model/Planner/Solver/Response/SinkNode';
import {SolverResponse} from '@src/Model/Planner/Solver/Response/SolverResponse';
import {SubplanNode} from '@src/Model/Planner/Solver/Response/SubplanNode';
import {ZoomedOutNameLayout} from '@src/Components/Planner/ZoomedOutNameLayout';

const NODE_WIDTH = GraphMetrics.NODE_WIDTH;

/**
 * The flow layout's block geometry version. 3 = the Look C blocks: plans stamped 2 were laid out for the old flat
 * sizes, so they are laid out once more when opened. 4 = the Look B blocks, which are narrower; a plan laid out in one
 * look is laid out again when it is opened in the other.
 */
const LAYOUT_VERSION = 3;
const GAME_LAYOUT_VERSION = 4;


// Look C ("Large"), from the mock-up: a dark card with a 52 px icon and a text column beside it, and the
// block's type colour as a stripe on its left edge.
const LOOK_C_WIDTH = 300;
/** Blocks stay on a lattice, so a longer name takes the next whole step rather than a ragged width. */
const LOOK_C_WIDTH_STEP = 30;
const LOOK_C_HEIGHT_STEP = 10;
const LOOK_C_MIN_HEIGHT = 108;
const LOOK_C_OTHER_MIN_HEIGHT = 92;
const LOOK_C_ICON = 52;
const LOOK_C_ICON_X = 11;
const LOOK_C_ICON_GAP = 12;
const LOOK_C_TEXT_INSET = LOOK_C_ICON_X + LOOK_C_ICON + LOOK_C_ICON_GAP;
const LOOK_C_TEXT_PAD_RIGHT = 16;
const LOOK_C_PAD_Y = 11;
const LOOK_C_RADIUS = 14;
const LOOK_C_CORNER_INSET = 10;
const LOOK_C_STRIPE = 4;
const LOOK_C_COUNT_ICON = 17;
const LOOK_C_COUNT_ICON_GAP = 5;
const LOOK_C_COUNT_FONT = 19;
const LOOK_C_NAME_FONT = 14;
const LOOK_C_DIM_FONT = 14;
const LOOK_C_KIND_FONT = 13;
const LOOK_C_MAKES_RATE_FONT = 15;
const LOOK_C_ALT_FONT = 10.5;
const LOOK_C_ALT_HEIGHT = 16;
const LOOK_C_ALT_WIDTH = 26;
const LOOK_C_ALT_RADIUS = 4;
const LOOK_C_ALT_GAP = 6;
const LOOK_C_LINE_HEIGHT = 20;
// Text centres, measured from the block's top: a recipe block reads count, name, clocks, makes. Each line sits at
// least its font size plus 4 px below the one above, so a 19 px count and 14 px lines never touch.
const LOOK_C_COUNT_Y = 24;
const LOOK_C_NAME_Y = 48;
const LOOK_C_CLOCK_Y = 68;
const LOOK_C_CLOCK_STEP = 20;
const LOOK_C_MAKES_Y = 88;
/** The gap each recipe line keeps from the line above it, once the line's own font is accounted for. */
const LOOK_C_LINE_GAP = 20;
// Other blocks read name, amount, kind.
const LOOK_C_ITEM_NAME_Y = 24;
const LOOK_C_AMOUNT_Y = 48;
const LOOK_C_KIND_Y = 69;
/** The capacity line some blocks add under their kind word. */
const LOOK_C_EXTRA_Y = 88;
// Measured with a canvas rather than guessed; see measureTextWidth().
const LOOK_C_FILL = '#1b1d21';
const LOOK_C_BORDER = '#34383e';
const LOOK_C_TEXT = '#f4f2ee';
const LOOK_C_DIM = '#95938e';
const LOOK_C_ACCENT = '#ffb347';
const LOOK_C_GOOD = '#79d39a';
const LOOK_C_WARN = '#d4663f';
/** The fill setting tints the card toward its type colour; capped at 5%, so the card always reads as dark grey. */
const LOOK_C_TINT_MAX = 0.05;

// Look B ("Game style"), from the mock-up (ui-mockups/style.css, body[data-look="b"]): a 256 px card with 10 px
// chamfers, the machine count and rate on a band across its top, and the product icon and name under it.
const GAME_WIDTH = 256;
/** Blocks stay on a lattice, so a longer name or rate takes the next whole step rather than a ragged width. */
const GAME_WIDTH_STEP = 30;
const GAME_HEIGHT_STEP = 10;
const GAME_MIN_HEIGHT = 84;
const GAME_CHAMFER = 10;
const GAME_BAND_H = 24;
const GAME_BAND_FONT = 13;
/** The mock-up's band tracking (.03em); measured with the text, or a rate and its unit would run together. */
const GAME_BAND_TRACKING = 0.03;
const GAME_BAND_ICON = 16;
const GAME_BAND_PAD_LEFT = 14;
const GAME_BAND_ICON_GAP = 6;
const GAME_BAND_RATE_PAD_RIGHT = 9;
/** The gap the band keeps between its title and its rate, so the two never touch. */
const GAME_BAND_TITLE_GAP = 8;
const GAME_ICON = 38;
const GAME_ICON_X = 11;
const GAME_ICON_Y = 32;
const GAME_ICON_GAP = 10;
const GAME_TEXT_INSET = GAME_ICON_X + GAME_ICON + GAME_ICON_GAP;
const GAME_TEXT_PAD_LEFT = 11;
const GAME_TEXT_PAD_RIGHT = 11;
const GAME_NAME_FONT = 14;
const GAME_DIM_FONT = 13;
const GAME_ALT_FONT = 10.5;
const GAME_ALT_HEIGHT = 16;
const GAME_ALT_WIDTH = 26;
const GAME_ALT_GAP = 6;
const GAME_LINE_HEIGHT = 18;
/** Text centres from the block's top: the name row, then the clocks or the extra line under it. */
const GAME_NAME_Y = 41;
const GAME_CLOCK_Y = 59;
const GAME_EXTRA_Y = 59;
const GAME_PAD_Y = 10;
/** Lock and sloop sit under the band, which already carries the rate on its right. */
const GAME_BADGE_Y = GAME_BAND_H + 6;
const GAME_FONT_FAMILY = 'Roboto Condensed, "Arial Narrow", sans-serif';
const GAME_CARD_FILL = '#262626';
const GAME_CARD_SELECTED = '#33281f';
const GAME_CARD_BUILT = '#1f2b22';
const GAME_BAND = '#fa9549';
const GAME_BAND_INK = '#1a0f04';
const GAME_BAND_SOURCE = '#5a5a5a';
const GAME_BAND_SOURCE_INK = '#f2f0ec';
const GAME_BAND_PRODUCT = '#f2f0ec';
const GAME_TEXT = '#f2f0ec';
const GAME_DIM = '#9a968f';
const GAME_WARN = '#f3c04f';
const GAME_CHART_COLOUR = '#1c1c1c';
const GAME_FLOW_LINE_WIDTH = 1.8;
const GAME_FLOW_LABEL_RADIUS = 2;

const CHART_COLOUR = '#121315';
const SLOOP_GLOW_COLOR = '#c56cf0';
const LOCK_ICON_SIZE = 18;
const SLOOP_ICON_SIZE = 20;
const LOCK_ROW2_Y = LOOK_C_CORNER_INSET + SLOOP_ICON_SIZE + 3;
const DONE_OPACITY = 0.4;
const DONE_ICON_SIZE = 20;
const CLAIM_BAR_WIDTH = 6;
const CLAIM_TITLE_SELECTORS = ['body', 'name', 'machines', 'stats', 'zoomedOutName'];

const SUBPLAN_IO_MAX = 5;
const SUBPLAN_IO_ICON = 20;
const SUBPLAN_IO_COLUMN_WIDTH = 36;
const SUBPLAN_IO_ROW_H = 20;
const SUBPLAN_IO_TOP = 40;

const NODE_STROKE_WIDTH = 1.5;
// Dark fallbacks: x6's `rect` defaults (white body, black text) show whenever a per-node attr fails to apply.
const NODE_FALLBACK_FILL = '#1e2d3b';
const NODE_FALLBACK_STROKE = '#5c718a';
const NODE_FALLBACK_TEXT = '#f4f7fb';
const SUBPLAN_NAME_FONT_SIZE = 18;
const SUBPLAN_NAME_CHAR_WIDTH = 9.8;
const SUBPLAN_STATS_CHAR_WIDTH = 7.4;
const SUBPLAN_MAX_WIDTH = 520;

const ZOOMED_OUT_SCALE = 0.53;
const ZOOMED_OUT_NODES_CLASS = 'pg-zoomed-out-nodes';
const ZOOMED_OUT_EDGES_CLASS = 'pg-zoomed-out-edges';
const ZOOMED_OUT_NAME_MAX_FONT = 24;
const ZOOMED_OUT_NAME_PAD_Y = 8;
const ZOOMED_OUT_NAME_PAD_RIGHT = 26;
const ZOOMED_OUT_EDGE_ICON_PAD = 4;
const EDGE_DETAIL_CLASS = 'pg-edge-detail';
const EDGE_ZOOMED_OUT_ICON_CLASS = 'pg-edge-zoomed-out-icon';
const WARNING_ICON_SIZE = 14;

const RECIPE_TEXT_PADDING_X = 30;
const STAT_SLOOP_SIZE = 12;
// Negative: the somersloop icon has ~25% transparent padding per side.
const STAT_SLOOP_GAP = -1;
const STAT_SLOOP_MAX_LINES = 8;
// Measured from the rendered text box.
const STAT_SLOOP_CENTER_OFFSET = 5.5;
const CORNER_PREVIEW_SNAP = 10;
const EDGE_STROKE = '#5c718a';
// Flow chart lines: the mock-up's Look C line, a casing in the chart colour so crossings break visibly.
const FLOW_LINE_WIDTH = 2.6;
const FLOW_CASING_WIDTH = FLOW_LINE_WIDTH + 5;
const FLOW_HIT_WIDTH = 14;
const FLOW_CASING_COLOUR = CHART_COLOUR;
const FLOW_BEND_RADIUS = 8;
const FLOW_JUNCTION_RADIUS = FLOW_LINE_WIDTH + 2;
const FLOW_WARN_COLOUR = '#e0b56a';
const FLOW_LABEL_HEIGHT = 24;
const FLOW_LABEL_PAD_X = 9;
const FLOW_LABEL_ICON = 19;
const FLOW_LABEL_ICON_GAP = 4;
const FLOW_LABEL_FILL = '#1a1c1f';
const FLOW_LABEL_TEXT_FILL = '#f4f2ee';
const FLOW_LABEL_RADIUS = 12;
const FLOW_LABEL_STROKE = 1.5;
/** Unfocused connections and blocks on hover/selection. */
const FLOW_FADE_OPACITY = 0.25;
// Layout units: the mock-up's Look C (port spacing 30, lane gap 17).
const FLOW_PORT_GAP = 30;
const FLOW_LANE_GAP = 17;
/** Space between the Alt tag and the card's right edge. */
const ALT_RIGHT_PAD = 16;
const FLOW_NODE_GAP_FLOOR = 34;
const FLOW_LABEL_GAP = 12;
/** Shortest stub out of a port before a re-routed line turns (LineRouter). */
const LINE_ROUTER_PAD = 14;
/** Gap a re-routed line keeps from a block it loops around. */
const LINE_ROUTER_CLEARANCE = 20;
// Amber like the status bar's warnings: a dark-canvas constant, readable in both themes.
// Belt view: one line per belt, spaced wide enough for each line's own rate label to fit between neighbours.
// Perpendicular label offset: with the 14px name font the baseline then sits ~8px above the line.
// Room beyond the outermost belt line, which itself sits (belts - 1) / 2 gaps from the node centre.
const SELECTED_STROKE = LOOK_C_ACCENT;
const EXPORT_MARGIN = 40;
// Fitting a plan with one or a few nodes would otherwise blow them up to fill the canvas.
const FIT_MAX_SCALE = 1;
const EXPORT_SAMPLE_MARGIN = 12;
const SELECTED_STROKE_WIDTH = 3;
// Hover styles live in styles.scss; the highlight class opts an edge out of the hover look.
const EDGE_LINE_CLASS = 'pg-edge-line';
const EDGE_CASING_CLASS = 'pg-edge-casing';
const EDGE_HIT_CLASS = 'pg-edge-hit';
const EDGE_HIGHLIGHT_CLASS = 'pg-edge-highlighted';
const LABEL_BOX_CLASS = 'pg-label-box';
const LABEL_BOX_HIGHLIGHT_CLASS = 'pg-label-box-highlighted';
// Pill, darker than the canvas, edge-coloured outline: nodes are lighter than the canvas with square-ish corners.
const LABEL_BOX_FILL = '#08111c';
const LABEL_BOX_STROKE = EDGE_STROKE;
const LABEL_BOX_STROKE_WIDTH = 1;
const LABEL_TEXT_FILL = '#dde4ef';
const LABEL_BOX_RADIUS = 4;
const LABEL_BOX_HIGHLIGHT_STROKE_WIDTH = 1.5;
/** Dark replacement for x6's white default label, shown when a label attr fails to apply. */
const EDGE_DEFAULT_LABEL = {
	markup: [
		{tagName: 'rect', selector: 'body'},
		{tagName: 'text', selector: 'label'},
	],
	attrs: {
		text: {
			fill: LABEL_TEXT_FILL,
			fontSize: 14,
			textAnchor: 'middle',
			textVerticalAnchor: 'middle',
			pointerEvents: 'none',
		},
		rect: {
			ref: 'label',
			fill: LABEL_BOX_FILL,
			stroke: LABEL_BOX_STROKE,
			strokeWidth: LABEL_BOX_STROKE_WIDTH,
			rx: LABEL_BOX_RADIUS,
			ry: LABEL_BOX_RADIUS,
			refWidth: 1,
			refHeight: 1,
			refX: 0,
			refY: 0,
		},
	},
	position: {distance: 0.5},
};
// Explicit, because X6 auto-assigns insertion order and edges are added after nodes - they would cover the nodes they cross.
const EDGE_BASE_Z = 0;
const NODE_BASE_Z = 1;
const NODE_HIGHLIGHT_Z = 100000;
const EDGE_HIGHLIGHT_Z = 100001;
const CONNECT_PREVIEW_Z = 100002;
/** Above highlighted edges: on touch, an edge's hit area would cover the port it ends at. */
const SELECTED_TOUCH_Z = 100003;

const PORT_RADIUS = 8;
const PORT_ICON_SIZE = 12;
const PORT_FILL = '#1e2d3b';
const PORT_STROKE = '#8ea9c9';
const CONNECT_SNAP_RADIUS = 30;

const statSloopMarkup: {tagName: string; selector: string; className: string}[] = [];
for (let i = 0; i < STAT_SLOOP_MAX_LINES; i++) {
	statSloopMarkup.push({tagName: 'image', selector: `statSloop${i}`, className: 'pn-detail'});
}

const subplanIoMarkup: {tagName: string; selector: string}[] = [];
for (let i = 0; i < SUBPLAN_IO_MAX; i++) {
	subplanIoMarkup.push({tagName: 'image', selector: `in${i}`});
	subplanIoMarkup.push({tagName: 'image', selector: `out${i}`});
}
const SUBPLAN_MORE_Y = SUBPLAN_IO_TOP + (SUBPLAN_IO_MAX - 1) * SUBPLAN_IO_ROW_H + SUBPLAN_IO_ICON / 2;

/**
 * A Look B card: square except for a chamfer cut off its top-left and bottom-right corners, like the mock-up's
 * clip-path. Built for the block's actual size, so the cut stays 10 px whatever the card's width or height.
 */
function gameCardPath(width: number, height: number, chamfer: number): string
{
	const cut = Math.min(chamfer, width / 2, height / 2);
	return `M ${cut} 0 L ${width} 0 L ${width} ${height - cut} L ${width - cut} ${height} L 0 ${height} L 0 ${cut} Z`;
}

/** The Look B band across the card's top: it keeps the card's top-left chamfer and squares off its own bottom. */
function gameBandPath(width: number, height: number, chamfer: number): string
{
	const cut = Math.min(chamfer, width / 2, height);
	return `M ${cut} 0 L ${width} 0 L ${width} ${height} L 0 ${height} L 0 ${cut} Z`;
}

/** The left stripe of a Look C card: inset by its corner radius, so it never leaves the rounded body. */
function stripeAttrs(inset: number, width: number): Record<string, string | number>
{
	return {
		display: 'inline',
		x: 0,
		y: inset,
		refHeight: -2 * inset,
		width,
		rx: width / 2,
		ry: width / 2,
		fill: LOOK_C_ACCENT,
		stroke: 'none',
		pointerEvents: 'none',
	};
}

/** Mixes two #rrggbb colours; 0 keeps the first, 1 gives the second. */
function mixColour(from: string, to: string, amount: number): string
{
	if (amount <= 0 || from === to) {
		return from;
	}
	const channel = (colour: string, offset: number): number => parseInt(colour.replace('#', '').slice(offset, offset + 2), 16);
	const blend = (offset: number): string => {
		const value = Math.round(channel(from, offset) + (channel(to, offset) - channel(from, offset)) * Math.min(1, amount));
		return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
	};
	return `#${blend(0)}${blend(2)}${blend(4)}`;
}

/** The width the block's text takes, so the "Alt" tag can sit right after the name instead of at a guessed offset. */const textMeasureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
function measureTextWidth(text: string, fontSize: number, bold: boolean, family = 'Arial, helvetica, sans-serif'): number
{
	if (textMeasureContext === null) {
		// Look B's condensed face is narrower than the fallback's 0.6 em, so an unmeasured guess still fits.
		return text.length * fontSize * (family === GAME_FONT_FAMILY ? 0.5 : 0.6);
	}
	// x6's text preset renders in this font (it does not inherit the page's), so measure the same one.
	textMeasureContext.font = `${bold ? 'bold ' : ''}${fontSize}px ${family}`;
	return textMeasureContext.measureText(text).width;
}

/** The text, cut short with an ellipsis when it is wider than the room it has. */
function fitText(text: string, maxWidth: number, fontSize: number, bold: boolean, family?: string): string
{
	if (measureTextWidth(text, fontSize, bold, family) <= maxWidth) {
		return text;
	}
	let cut = text.length;
	while (cut > 1 && measureTextWidth(`${text.slice(0, cut).trimEnd()}…`, fontSize, bold, family) > maxWidth) {
		cut--;
	}
	return `${text.slice(0, cut).trimEnd()}…`;
}

/**
 * Look B's band text width. SVG applies letter-spacing after every glyph including the last, and a canvas does not
 * measure it, so the tracking is added here; the spare glyphs cover SVG's per-glyph rounding. Over-measuring only
 * widens a card by a whole 30 px step, while under-measuring would let a rate run into its unit.
 */
function measureBandTextWidth(text: string, fontSize: number): number
{
	return measureTextWidth(text, fontSize, true, GAME_FONT_FAMILY) + (text.length + 4) * fontSize * GAME_BAND_TRACKING;
}

function registerPlannerShapes(scale: number): void
{
	const px = (value: number): number => value * scale;

	const statSloopAttrs: Record<string, object> = {};
	for (let i = 0; i < STAT_SLOOP_MAX_LINES; i++) {
		statSloopAttrs[`statSloop${i}`] = {refX: 0.5, refY: 0, width: px(STAT_SLOOP_SIZE), height: px(STAT_SLOOP_SIZE)};
	}

	// Look C: card, type-colour stripe, 52 px icon, then a text column (mock-up ui-mockups/style.css .node).
	const textX = px(LOOK_C_TEXT_INSET);
	const textAttrs = {x: textX, textAnchor: 'start', textVerticalAnchor: 'middle'};
	X6Graph.registerNode('planner-node', {
		inherit: 'rect',
		markup: [
			{tagName: 'rect', selector: 'body', className: 'pn-body'},
			{tagName: 'rect', selector: 'stripe', className: 'pn-stripe'},
			{tagName: 'rect', selector: 'claimBar', className: 'pn-claim'},
			{tagName: 'text', selector: 'name', className: 'pn-detail'},
			{tagName: 'rect', selector: 'altTag', className: 'pn-alt'},
			{tagName: 'text', selector: 'altText', className: 'pn-alt-text'},
			{tagName: 'text', selector: 'machines', className: 'pn-detail'},
			{tagName: 'text', selector: 'stats', className: 'pn-detail'},
			{tagName: 'text', selector: 'kind', className: 'pn-detail'},
			{tagName: 'text', selector: 'extra', className: 'pn-detail'},
			{tagName: 'text', selector: 'makesLabel', className: 'pn-detail'},
			{tagName: 'text', selector: 'makesRate', className: 'pn-detail'},
			{tagName: 'text', selector: 'makesUnit', className: 'pn-detail'},
			{tagName: 'text', selector: 'zoomedOutName', className: 'pn-zoomed-out-name'},
			...statSloopMarkup,
			{tagName: 'image', selector: 'machineIcon', className: 'pn-machine'},
			{tagName: 'image', selector: 'countIcon', className: 'pn-count'},
			{tagName: 'image', selector: 'sloop', className: 'pn-sloop'},
			{tagName: 'image', selector: 'lock', className: 'pn-lock'},
			{tagName: 'image', selector: 'done', className: 'pn-done'},
			{tagName: 'image', selector: 'inputWarning', className: 'pn-input-warning'},
			{tagName: 'image', selector: 'outputWarning', className: 'pn-output-warning'},
			{tagName: 'image', selector: 'capacityWarning', className: 'pn-capacity-warning'},
		],
		attrs: {
			// Restates x6's inherited rect defaults (white body, black text), which match by element name.
			rect: {fill: NODE_FALLBACK_FILL, stroke: NODE_FALLBACK_STROKE, strokeWidth: NODE_STROKE_WIDTH, rx: px(LOOK_C_RADIUS), ry: px(LOOK_C_RADIUS)},
			// The rect preset centres its text; every card line here is placed from the top-left instead.
			text: {fill: NODE_FALLBACK_TEXT, refX: 0, refY: 0, x: 0, y: 0, textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 'normal', fontSize: px(LOOK_C_NAME_FONT)},
			body: {
				refWidth: '100%',
				refHeight: '100%',
				fill: LOOK_C_FILL,
				stroke: LOOK_C_BORDER,
				strokeWidth: NODE_STROKE_WIDTH,
				rx: px(LOOK_C_RADIUS),
				ry: px(LOOK_C_RADIUS),
			},
			stripe: {...stripeAttrs(px(LOOK_C_RADIUS), px(LOOK_C_STRIPE)), display: 'none'},
			claimBar: {x: 0, y: 0, refHeight: '100%', width: px(CLAIM_BAR_WIDTH), fill: '', display: 'none', rx: px(3), ry: px(3), pointerEvents: 'none'},
			...statSloopAttrs,
			machineIcon: {
				refX: 0,
				x: px(LOOK_C_ICON_X),
				refY: 0,
				y: px(LOOK_C_PAD_Y),
				width: px(LOOK_C_ICON),
				height: px(LOOK_C_ICON),
			},
			countIcon: {
				refX: 0,
				x: textX,
				refY: 0,
				y: px(LOOK_C_COUNT_Y - LOOK_C_COUNT_ICON / 2),
				width: px(LOOK_C_COUNT_ICON),
				height: px(LOOK_C_COUNT_ICON),
			},
			// refDx offsets from the right edge (refX: 1 would be an absolute 1px).
			sloop: {
				refDx: -px(SLOOP_ICON_SIZE + LOOK_C_CORNER_INSET),
				refY: 0,
				y: px(LOOK_C_CORNER_INSET),
				width: px(SLOOP_ICON_SIZE),
				height: px(SLOOP_ICON_SIZE),
				cursor: 'help',
			},
			lock: {
				refDx: -px(LOCK_ICON_SIZE + LOOK_C_CORNER_INSET),
				refY: 0,
				y: px(LOOK_C_CORNER_INSET),
				width: px(LOCK_ICON_SIZE),
				height: px(LOCK_ICON_SIZE),
				cursor: 'help',
			},
			done: {
				refDx: -px(DONE_ICON_SIZE + LOOK_C_CORNER_INSET),
				refDy: -px(DONE_ICON_SIZE + LOOK_C_CORNER_INSET),
				width: px(DONE_ICON_SIZE),
				height: px(DONE_ICON_SIZE),
			},
			inputWarning: {
				refX: 0,
				x: px(LOOK_C_CORNER_INSET),
				refY: 0.5,
				y: -px(WARNING_ICON_SIZE / 2),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			outputWarning: {
				refDx: -px(WARNING_ICON_SIZE + LOOK_C_CORNER_INSET),
				refY: 0.5,
				y: -px(WARNING_ICON_SIZE / 2),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			capacityWarning: {
				refDx: -px(WARNING_ICON_SIZE + LOOK_C_CORNER_INSET),
				refDy: -px(WARNING_ICON_SIZE + LOOK_C_CORNER_INSET),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			name: {...textAttrs, y: px(LOOK_C_NAME_Y), fontWeight: 'bold', fontSize: px(LOOK_C_NAME_FONT), fill: LOOK_C_TEXT},
			altTag: {
				x: textX,
				y: px(LOOK_C_NAME_Y - LOOK_C_ALT_HEIGHT / 2),
				width: px(LOOK_C_ALT_WIDTH),
				height: px(LOOK_C_ALT_HEIGHT),
				fill: LOOK_C_FILL,
				stroke: LOOK_C_ACCENT,
				strokeWidth: 1,
				rx: px(LOOK_C_ALT_RADIUS),
				ry: px(LOOK_C_ALT_RADIUS),
				display: 'none',
			},
			altText: {
				refX: 0,
				refY: 0,
				x: 0,
				y: 0,
				textAnchor: 'start',
				textVerticalAnchor: 'middle',
				fontWeight: 'bold',
				fontSize: px(LOOK_C_ALT_FONT),
				fill: LOOK_C_ACCENT,
				display: 'none',
			},
			machines: {...textAttrs, y: px(LOOK_C_COUNT_Y), fontWeight: 'bold', fontSize: px(LOOK_C_COUNT_FONT), fill: LOOK_C_TEXT},
			stats: {...textAttrs, y: px(LOOK_C_CLOCK_Y), fontSize: px(LOOK_C_DIM_FONT), fill: LOOK_C_DIM},
			kind: {...textAttrs, y: px(LOOK_C_KIND_Y), fontSize: px(LOOK_C_KIND_FONT), fill: LOOK_C_DIM},
			extra: {...textAttrs, y: px(LOOK_C_EXTRA_Y), fontSize: px(LOOK_C_KIND_FONT), fill: LOOK_C_DIM},
			makesLabel: {...textAttrs, y: px(LOOK_C_MAKES_Y), fontSize: px(LOOK_C_DIM_FONT), fill: LOOK_C_DIM},
			makesRate: {...textAttrs, y: px(LOOK_C_MAKES_Y), fontWeight: 'bold', fontSize: px(LOOK_C_MAKES_RATE_FONT), fill: LOOK_C_TEXT},
			makesUnit: {...textAttrs, y: px(LOOK_C_MAKES_Y), fontSize: px(LOOK_C_DIM_FONT), fill: LOOK_C_DIM},
			zoomedOutName: {refX: 0.5, refY: 0.5, textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fill: LOOK_C_TEXT, display: 'none'},
		},
	}, true);

	// Look B ("Game style"): a chamfered card with the machine count and rate on a band across its top, then the
	// product icon and name (mock-up ui-mockups/style.css, body[data-look="b"] .node). Paths rather than rects
	// because the chamfers are cut at the card's real size; addGameNode() writes each path's `d`.
	const bandText = {refX: 0, refY: 0, x: 0, y: 0, textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 'bold', fontSize: px(GAME_BAND_FONT), letterSpacing: px(GAME_BAND_FONT * GAME_BAND_TRACKING), fill: GAME_BAND_INK};
	X6Graph.registerNode('planner-game-node', {
		inherit: 'rect',
		markup: [
			{tagName: 'path', selector: 'body', className: 'pn-body'},
			{tagName: 'path', selector: 'band', className: 'pn-band'},
			{tagName: 'rect', selector: 'claimBar', className: 'pn-claim'},
			{tagName: 'text', selector: 'machines', className: 'pn-detail pn-band-text'},
			{tagName: 'text', selector: 'bandRate', className: 'pn-detail pn-band-text'},
			{tagName: 'text', selector: 'bandUnit', className: 'pn-detail pn-band-text'},
			{tagName: 'text', selector: 'name', className: 'pn-detail'},
			{tagName: 'rect', selector: 'altTag', className: 'pn-alt'},
			{tagName: 'text', selector: 'altText', className: 'pn-alt-text'},
			{tagName: 'text', selector: 'stats', className: 'pn-detail'},
			{tagName: 'text', selector: 'extra', className: 'pn-detail'},
			{tagName: 'text', selector: 'zoomedOutName', className: 'pn-zoomed-out-name'},
			...statSloopMarkup,
			{tagName: 'image', selector: 'machineIcon', className: 'pn-machine'},
			{tagName: 'image', selector: 'countIcon', className: 'pn-count'},
			{tagName: 'image', selector: 'sloop', className: 'pn-sloop'},
			{tagName: 'image', selector: 'lock', className: 'pn-lock'},
			{tagName: 'image', selector: 'done', className: 'pn-done'},
			{tagName: 'image', selector: 'inputWarning', className: 'pn-input-warning'},
			{tagName: 'image', selector: 'outputWarning', className: 'pn-output-warning'},
			{tagName: 'image', selector: 'capacityWarning', className: 'pn-capacity-warning'},
		],
		attrs: {
			// Fallbacks for every rect and text the markup holds, matching x6's white/black defaults by tag name.
			rect: {fill: NODE_FALLBACK_FILL, stroke: 'none', strokeWidth: 0},
			text: {fill: NODE_FALLBACK_TEXT, refX: 0, refY: 0, x: 0, y: 0, textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 'normal', fontSize: px(GAME_NAME_FONT), fontFamily: GAME_FONT_FAMILY},
			body: {
				d: gameCardPath(px(GAME_WIDTH), px(GAME_MIN_HEIGHT), px(GAME_CHAMFER)),
				fill: GAME_CARD_FILL,
				stroke: 'none',
				strokeWidth: NODE_STROKE_WIDTH,
			},
			band: {
				d: gameBandPath(px(GAME_WIDTH), px(GAME_BAND_H), px(GAME_CHAMFER)),
				fill: GAME_BAND,
				stroke: 'none',
				pointerEvents: 'none',
			},
			claimBar: {x: 0, y: 0, refHeight: '100%', width: px(CLAIM_BAR_WIDTH), fill: '', display: 'none', rx: px(3), ry: px(3), pointerEvents: 'none'},
			...statSloopAttrs,
			machines: {...bandText, textAnchor: 'start'},
			// The rate and its unit are anchored on their right edges, so a wider-than-measured glyph only grows into
			// the band's padding instead of over the neighbouring text.
			bandRate: {...bandText, textAnchor: 'end'},
			bandUnit: {...bandText, textAnchor: 'end', fill: GAME_BAND_INK},
			name: {refX: 0, refY: 0, x: px(GAME_TEXT_INSET), y: px(GAME_NAME_Y), textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 'bold', fontSize: px(GAME_NAME_FONT), fill: GAME_TEXT},
			altTag: {
				x: px(GAME_TEXT_INSET),
				y: px(GAME_NAME_Y - GAME_ALT_HEIGHT / 2),
				width: px(GAME_ALT_WIDTH),
				height: px(GAME_ALT_HEIGHT),
				fill: 'none',
				stroke: GAME_BAND,
				strokeWidth: 1,
				rx: px(LOOK_C_ALT_RADIUS),
				ry: px(LOOK_C_ALT_RADIUS),
				display: 'none',
			},
			altText: {refX: 0, refY: 0, x: 0, y: 0, textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 'bold', fontSize: px(GAME_ALT_FONT), fill: GAME_BAND, display: 'none'},
			stats: {refX: 0, refY: 0, x: px(GAME_TEXT_INSET), y: px(GAME_CLOCK_Y), textAnchor: 'start', textVerticalAnchor: 'middle', fontSize: px(GAME_DIM_FONT), fill: GAME_DIM},
			extra: {refX: 0, refY: 0, x: px(GAME_TEXT_INSET), y: px(GAME_EXTRA_Y), textAnchor: 'start', textVerticalAnchor: 'middle', fontSize: px(GAME_DIM_FONT), fill: GAME_DIM},
			zoomedOutName: {refX: 0.5, refY: 0.5, textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fill: GAME_TEXT, display: 'none'},
			machineIcon: {
				refX: 0,
				x: px(GAME_ICON_X),
				refY: 0,
				y: px(GAME_ICON_Y),
				width: px(GAME_ICON),
				height: px(GAME_ICON),
			},
			countIcon: {
				refX: 0,
				x: px(GAME_BAND_PAD_LEFT),
				refY: 0,
				y: px((GAME_BAND_H - GAME_BAND_ICON) / 2),
				width: px(GAME_BAND_ICON),
				height: px(GAME_BAND_ICON),
			},
			// Below the band: it already carries the rate on its right.
			sloop: {
				refDx: -px(SLOOP_ICON_SIZE + GAME_CHAMFER),
				refY: 0,
				y: px(GAME_BADGE_Y),
				width: px(SLOOP_ICON_SIZE),
				height: px(SLOOP_ICON_SIZE),
				cursor: 'help',
			},
			lock: {
				refDx: -px(LOCK_ICON_SIZE + GAME_CHAMFER),
				refY: 0,
				y: px(GAME_BADGE_Y),
				width: px(LOCK_ICON_SIZE),
				height: px(LOCK_ICON_SIZE),
				cursor: 'help',
			},
			done: {
				refDx: -px(DONE_ICON_SIZE + GAME_CHAMFER),
				refDy: -px(DONE_ICON_SIZE + GAME_CHAMFER),
				width: px(DONE_ICON_SIZE),
				height: px(DONE_ICON_SIZE),
			},
			inputWarning: {
				refX: 0,
				x: px(GAME_CHAMFER),
				refY: 0.5,
				y: -px(WARNING_ICON_SIZE / 2),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			outputWarning: {
				refDx: -px(WARNING_ICON_SIZE + GAME_CHAMFER),
				refY: 0.5,
				y: -px(WARNING_ICON_SIZE / 2),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			capacityWarning: {
				refDx: -px(WARNING_ICON_SIZE + GAME_CHAMFER),
				refDy: -px(WARNING_ICON_SIZE + GAME_CHAMFER),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
		},
	}, true);

	const subplanIoAttrs: Record<string, object> = {};
	for (let i = 0; i < SUBPLAN_IO_MAX; i++) {
		const y = px(SUBPLAN_IO_TOP + i * SUBPLAN_IO_ROW_H);
		subplanIoAttrs[`in${i}`] = {refX: 0, x: px(10), refY: 0, y, width: px(SUBPLAN_IO_ICON), height: px(SUBPLAN_IO_ICON)};
		subplanIoAttrs[`out${i}`] = {refDx: -px(SUBPLAN_IO_ICON + 10), refY: 0, y, width: px(SUBPLAN_IO_ICON), height: px(SUBPLAN_IO_ICON)};
	}

	// Look B subplan: the same chamfered card, without a band (the mock-up has no subplan block); its name and stats
	// keep the Look C positions.
	X6Graph.registerNode('planner-game-subplan-node', {
		inherit: 'rect',
		markup: [
			{tagName: 'path', selector: 'body', className: 'pn-body'},
			{tagName: 'rect', selector: 'claimBar', className: 'pn-claim'},
			{tagName: 'text', selector: 'name', className: 'pn-detail'},
			{tagName: 'text', selector: 'stats', className: 'pn-detail'},
			{tagName: 'text', selector: 'zoomedOutName', className: 'pn-zoomed-out-name'},
			...subplanIoMarkup,
			{tagName: 'text', selector: 'inMore'},
			{tagName: 'text', selector: 'outMore'},
			{tagName: 'image', selector: 'lock', className: 'pn-lock'},
			{tagName: 'image', selector: 'done', className: 'pn-done'},
		],
		attrs: {
			rect: {fill: NODE_FALLBACK_FILL, stroke: 'none', strokeWidth: 0},
			text: {fill: NODE_FALLBACK_TEXT, refX: 0, refY: 0, x: 0, y: 0, textAnchor: 'start', textVerticalAnchor: 'middle', fontWeight: 'normal', fontSize: px(GAME_NAME_FONT), fontFamily: GAME_FONT_FAMILY},
			body: {
				d: gameCardPath(px(GraphMetrics.SUBPLAN_NODE_WIDTH), px(GraphMetrics.SUBPLAN_NODE_HEIGHT), px(GAME_CHAMFER)),
				fill: GAME_CARD_FILL,
				stroke: 'none',
				strokeWidth: NODE_STROKE_WIDTH,
			},
			claimBar: {x: 0, y: 0, refHeight: '100%', width: px(CLAIM_BAR_WIDTH), fill: '', display: 'none', rx: px(3), ry: px(3), pointerEvents: 'none'},
			name: {refX: 0.5, refY: 0.5, y: px(-10), textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fontSize: px(SUBPLAN_NAME_FONT_SIZE), fill: GAME_TEXT, fontFamily: GAME_FONT_FAMILY},
			stats: {refX: 0.5, refY: 0.5, y: px(12), textAnchor: 'middle', textVerticalAnchor: 'middle', fontSize: px(13), fill: GAME_DIM, fontFamily: GAME_FONT_FAMILY},
			zoomedOutName: {refX: 0.5, refY: 0.5, textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fill: GAME_TEXT, display: 'none', fontFamily: GAME_FONT_FAMILY},
			...subplanIoAttrs,
			inMore: {refX: 0, x: px(10), refY: 0, y: px(SUBPLAN_MORE_Y), textAnchor: 'start', textVerticalAnchor: 'middle', fontSize: px(11), fill: GAME_DIM, fontFamily: GAME_FONT_FAMILY},
			outMore: {refDx: px(-10), refY: 0, y: px(SUBPLAN_MORE_Y), textAnchor: 'end', textVerticalAnchor: 'middle', fontSize: px(11), fill: GAME_DIM, fontFamily: GAME_FONT_FAMILY},
			lock: {refDx: -px(LOCK_ICON_SIZE + GAME_CHAMFER), refY: 0, y: px(GAME_CHAMFER), width: px(LOCK_ICON_SIZE), height: px(LOCK_ICON_SIZE), cursor: 'help'},
			done: {refDx: -px(DONE_ICON_SIZE + GAME_CHAMFER), refDy: -px(DONE_ICON_SIZE + GAME_CHAMFER), width: px(DONE_ICON_SIZE), height: px(DONE_ICON_SIZE)},
		},
	}, true);

	X6Graph.registerNode('planner-subplan-node', {
		inherit: 'rect',
		markup: [
			{tagName: 'rect', selector: 'body', className: 'pn-body'},
			{tagName: 'rect', selector: 'stripe', className: 'pn-stripe'},
			{tagName: 'rect', selector: 'claimBar', className: 'pn-claim'},
			{tagName: 'text', selector: 'name', className: 'pn-detail'},
			{tagName: 'text', selector: 'stats', className: 'pn-detail'},
			{tagName: 'text', selector: 'zoomedOutName', className: 'pn-zoomed-out-name'},
			...subplanIoMarkup,
			{tagName: 'text', selector: 'inMore'},
			{tagName: 'text', selector: 'outMore'},
			{tagName: 'image', selector: 'lock', className: 'pn-lock'},
			{tagName: 'image', selector: 'done', className: 'pn-done'},
		],
		attrs: {
			rect: {fill: NODE_FALLBACK_FILL, stroke: NODE_FALLBACK_STROKE, strokeWidth: NODE_STROKE_WIDTH, rx: px(LOOK_C_RADIUS), ry: px(LOOK_C_RADIUS)},
			text: {fill: NODE_FALLBACK_TEXT},
			body: {
				refWidth: '100%',
				refHeight: '100%',
				fill: LOOK_C_FILL,
				stroke: LOOK_C_BORDER,
				strokeWidth: NODE_STROKE_WIDTH,
				rx: px(LOOK_C_RADIUS),
				ry: px(LOOK_C_RADIUS),
			},
			stripe: {...stripeAttrs(px(LOOK_C_RADIUS), px(LOOK_C_STRIPE)), display: 'none'},
			claimBar: {x: 0, y: 0, refHeight: '100%', width: px(CLAIM_BAR_WIDTH), fill: '', display: 'none', rx: px(3), ry: px(3), pointerEvents: 'none'},
			name: {refX: 0.5, refY: 0.5, y: px(-10), textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fontSize: px(SUBPLAN_NAME_FONT_SIZE), fill: LOOK_C_TEXT},
			stats: {refX: 0.5, refY: 0.5, y: px(12), textAnchor: 'middle', textVerticalAnchor: 'middle', fontSize: px(13), fill: LOOK_C_DIM},
			zoomedOutName: {refX: 0.5, refY: 0.5, textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fill: LOOK_C_TEXT, display: 'none'},
			...subplanIoAttrs,
			inMore: {refX: 0, x: px(10), refY: 0, y: px(SUBPLAN_MORE_Y), textAnchor: 'start', textVerticalAnchor: 'middle', fontSize: px(11), fill: LOOK_C_DIM},
			outMore: {refDx: px(-10), refY: 0, y: px(SUBPLAN_MORE_Y), textAnchor: 'end', textVerticalAnchor: 'middle', fontSize: px(11), fill: LOOK_C_DIM},
			lock: {refDx: -px(LOCK_ICON_SIZE + LOOK_C_CORNER_INSET), refY: 0, y: px(LOOK_C_CORNER_INSET), width: px(LOCK_ICON_SIZE), height: px(LOCK_ICON_SIZE), cursor: 'help'},
			done: {refDx: -px(DONE_ICON_SIZE + LOOK_C_CORNER_INSET), refDy: -px(DONE_ICON_SIZE + LOOK_C_CORNER_INSET), width: px(DONE_ICON_SIZE), height: px(DONE_ICON_SIZE)},
		},
	}, true);
}

registerPlannerShapes(1);

/** Icon fields are data URIs; '' hides the icon. */
interface NodeStyle {
	bodyFill: string;
	bodyStroke: string;
	/** The block's type colour: the left stripe, and the border of an output block. */
	accent: string;
	name: string;
	machines: string;
	stats: string;
	lock: string;
	done: string;
	inputWarning: string;
	outputWarning: string;
	capacityWarning: string;
}

/** The text a Look C card shows, top to bottom, already formatted. */
interface NodeCardContent {
	icon: string;
	/** The machine icon that prefixes the count line on a recipe block. */
	countIcon: string;
	name: string;
	alternate: boolean;
	/** The block's bold line: recipe machine count, or an item's amount. */
	bigLine: string;
	/** The dim line under it: recipe clocks, or the kind word. */
	dimLine: string;
	/** A third dim line: a sink's points, a mine's extractors. */
	extraLine: string;
	/** A recipe block closes with "Makes <rate>". */
	makes: string;
	makesUnit: string;
}

@Injectable()
export class PlannerGraphService implements OnDestroy
{

	public readOnly = false;

	private x6Graph: X6Graph | null = null;
	private touchGestures: GraphTouchGestures | null = null;
	private touchUsed = false;
	private suppressNativeContextMenuUntil = 0;
	private selection: Selection | null = null;
	private cornerPreview: SVGCircleElement | null = null;
	private hoveredEdgeView: EdgeView | null = null;
	private touchedEdgeId: string | null = null;
	private hoverMoveTarget: HTMLElement | null = null;
	private readonly edgeHoverListener: (e: MouseEvent) => void;
	private readonly warningOverListener: (e: MouseEvent) => void;
	private readonly warningOutListener: (e: MouseEvent) => void;
	private readonly tooltipDismissListener: () => void;
	private readonly wheelGuardListener: (e: Event) => void;
	/** Alt-tab loses hover state, so the anchor's mouseout may never fire. */
	private tooltipAnchor: Element | null = null;
	private registeredScale = 1;

	private rubberbandStart: GraphPoint | null = null;
	private readonly selectedVertexMap = new Map<string, number[]>();
	private vertexHighlights: SVGCircleElement[] = [];
	private vertexDragAnchorId: string | null = null;
	/** Ids of the nodes x6 moved since the drag began, so the drag end can see the whole multi-selection. */
	private readonly movedNodeIds = new Set<string>();
	/** Where each node of the current drag started, so its connections can follow it by the same distance. */
	private readonly dragStartPositions = new Map<string, GraphPoint>();
	/** Every line's corners when a drag began: x6 shifts all corners of a line touching any moved block, even when its other end stays. */
	private readonly dragStartVertices = new Map<GraphEdge, GraphPoint[]>();
	/** A block is pressed: position changes now come from a drag, not from a layout or a remote update. */
	private nodePressed = false;
	private liveRerouteScheduled = false;
	private readonly nodeById = new Map<string, Node>();
	private doneNodeIds = new Set<string>();
	private claimMarkers: ReadonlyMap<string, {color: string; label: string}> = new Map();
	private readonly edgeById = new Map<string, GraphEdge>();
	private readonly baseZIndexById = new Map<string, number>();
	private readonly pendingZChanges = new Map<string, {cell: Cell; zIndex: number | null}>();
	private zChangeScheduled = false;
	private renderedGraph: Graph | null = null;
	/** Heights the flow layout gave each block; taller blocks have more room for input ports. */
	private readonly flowLayoutHeights = new Map<string, number>();
	/** Edge arrays the flow layout produced, so a restore recognises its own routes. */
	private readonly laidOutEdges = new WeakSet<GraphEdge[]>();
	private renderedLayoutMode: 'free' | 'grid' | null = null;
	/** The look the last restore drew; a change re-lays the chart out, since the two looks size blocks differently. */
	private renderedLook: 'large' | 'game' | null = null;
	private linePalette: FlowLinePalette | null = null;
	private junctionLayer: SVGGElement | null = null;
	private junctionCircles: Array<{circle: SVGCircleElement; x: number; y: number}> = [];
	/** The line the user clicked: it stays lit, with the rest faded, until a click elsewhere. Hover only shows the tooltip. */
	private pickedEdgeIds = new Set<string>();
	private focusedNodeIds = new Set<string>();
	/** Last pointer position, so a connection's tooltip can open next to the cursor rather than the line's bounding box. */
	private lastPointerClient: {x: number; y: number} | null = null;

	private readonly selectedNodesSignal = signal<Node[]>([]);
	public readonly selectedNodes: Signal<Node[]> = this.selectedNodesSignal.asReadonly();

	private readonly warningEntriesSignal = signal<GraphWarningEntry[]>([]);
	public readonly warningEntries: Signal<GraphWarningEntry[]> = this.warningEntriesSignal.asReadonly();

	private readonly edgesSignal = signal<GraphEdge[]>([]);
	/** The edges of the rendered graph, for readers outside the canvas such as the status bar. */
	public readonly edges: Signal<GraphEdge[]> = this.edgesSignal.asReadonly();

	private readonly beltPlanSignal = signal<BeltGraphPlan>(new Map());
	/** The belt layout of the rendered graph, keyed by edge index. Empty unless belt management is on. */
	public readonly beltPlan: Signal<BeltGraphPlan> = this.beltPlanSignal.asReadonly();

	private readonly contextMenuSubject = new Subject<GraphContextMenuRequest>();
	public readonly contextMenuRequests: Observable<GraphContextMenuRequest> = this.contextMenuSubject.asObservable();

	private readonly graphChangedSubject = new Subject<void>();
	public readonly graphChanges: Observable<void> = this.graphChangedSubject.asObservable();

	private readonly graphEditStartSubject = new Subject<void>();
	public readonly graphEditStarts: Observable<void> = this.graphEditStartSubject.asObservable();

	private vertexGestureActive = false;
	private readonly gestureResetSubscription: Subscription;

	private warningsById = new Map<string, GraphNodeWarnings>();

	private connectGesture: PortConnectGesture | null = null;
	private markedPorts: Array<{cell: X6Node; portId: string}> = [];
	private dimmedNodeIds: string[] = [];

	private readonly zoomedOutNames = new ZoomedOutNameLayout();
	private readonly lockIconUri = this.iconDataUri(faLock, '#c9962e');
	private readonly doneIconUri = this.iconDataUri(faCircleCheck, '#4caf50');
	private readonly warningIconUri = this.iconDataUri(faTriangleExclamation, '#e58a72');

	public constructor(
		private readonly versionManager: VersionManager,
		private readonly iconUrls: IconUrlService,
		private readonly rateFormatter: RateFormatter,
		private readonly panelLayout: PanelLayoutService,
		private readonly edgeBuilder: GraphEdgeBuilder,
		private readonly reconciler: GraphReconciler,
		private readonly nodeTooltip: PlannerNodeTooltipService,
		private readonly actions: PlannerActionsService,
		private readonly planManager: PlanManager,
		private readonly planNames: PlanNameResolver,
		private readonly settings: SettingsManager,
		private readonly graphLayout: GraphLayoutResolver,
		private readonly svgCleaner: GraphSvgCleaner,
	)
	{
		this.edgeHoverListener = e => this.onEdgeHoverMove(e);
		this.warningOverListener = e => this.onWarningHover(e);
		this.warningOutListener = e => this.onWarningOut(e);
		// Firefox fires blur synchronously when rendering removes the focused element, where the signal write throws NG0600.
		this.tooltipDismissListener = () => untracked(() => {
			this.hideTooltip();
			// x6 swallows mouseleave mid-press. Taps excepted: lifting the finger ends the synthetic pointer and would drop the handles.
			if (this.touchedEdgeId === null) {
				this.endEdgeHover();
			}
		});
		// x6 reads the pointer position off the legacy wheel events and throws on synthetic ones that carry none.
		this.wheelGuardListener = e => {
			if (typeof (e as MouseEvent).clientX !== 'number') {
				e.stopPropagation();
			}
		};
		// Same quiet gap as the debounced save.
		this.gestureResetSubscription = this.graphChangedSubject.pipe(debounceTime(500)).subscribe(() => {
			this.vertexGestureActive = false;
		});
	}

	public async render(container: HTMLElement, response: SolverResponse, settings?: GraphLayoutSettings): Promise<Graph>
	{
		if (response.nodes.length === 0) {
			this.createGraph(container);
			this.renderedGraph = null;
			this.beltPlanSignal.set(new Map());
			return {nodes: [], edges: []};
		}

		const edges = this.edgeBuilder.build(response.nodes);
		this.layoutFlowGraph(response.nodes, edges, settings);
		const graph: Graph = {nodes: response.nodes, edges, layoutVersion: this.gameLook() ? GAME_LAYOUT_VERSION : LAYOUT_VERSION, layoutHeights: this.layoutHeightsOfEdges.get(edges)};
		this.restore(container, graph);
		return graph;
	}

	public async layout(nodes: Node[], edges: GraphEdge[], layoutSettings?: GraphLayoutSettings): Promise<void>
	{
		this.layoutFlowGraph(nodes, edges, layoutSettings);
	}

	/** Synchronous: layoutFlow is pure, so a restore can lay out a legacy plan before drawing it. */
	private layoutFlowGraph(nodes: Node[], edges: GraphEdge[], layoutSettings?: GraphLayoutSettings): void
	{
		if (nodes.length === 0) {
			return;
		}
		// Belt view grows nodes to hold their per-belt lines, so their size must be known before the layout runs.
		if (this.beltViewEnabled()) {
			this.refreshBeltPlan({nodes, edges});
		}
		const settings = this.graphLayout.resolve(layoutSettings);
		const direction = settings.direction;
		const vertical = this.isVertical(direction);
		// Right and up are the flow reversed: lay out left-to-right/down and mirror so the lines run the other way.
		const mirror = direction === 'right' || direction === 'up';

		const nodeIds = new Set(nodes.map(node => node.id));
		const layoutEdges = edges.filter(edge => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
		const edgeIds = new Map<GraphEdge, string>();
		const flowEdges: FlowLayoutEdge[] = layoutEdges.map((edge, i) => {
			const id = `e${i}`;
			edgeIds.set(edge, id);
			return {
				id,
				sourceId: edge.sourceId,
				targetId: edge.targetId,
				itemKey: edge.itemClassName,
				labelWidth: this.labelPillFor(edge).width,
			};
		});

		const flowNodes: FlowLayoutNode[] = nodes.map(node => {
			const size = this.sizeFor(node);
			return {
				id: node.id,
				kind: this.flowKindFor(node),
				width: size.width,
				minHeight: size.height,
				orderHint: node.y,
			};
		});

		const options: FlowLayoutOptions = {
			grid: this.settings.graph().layoutMode === 'grid',
			direction: vertical ? 'down' : 'right',
			portGap: FLOW_PORT_GAP * this.nodeScale(),
			laneGap: FLOW_LANE_GAP,
			nodeGap: Math.max(FLOW_NODE_GAP_FLOOR, settings.nodeSpacing),
			minGapWidth: Math.max(FLOW_LANE_GAP * 2, settings.layerSpacing),
		};
		const result = layoutFlow(flowNodes, flowEdges, options);

		// Mirroring keeps block sizes; blocks are placed by top-left corner, so the far edge becomes the near one.
		const mirrorAxis = vertical ? result.height : result.width;
		const mx = (x: number): number => mirror && !vertical ? mirrorAxis - x : x;
		const my = (y: number): number => mirror && vertical ? mirrorAxis - y : y;
		const byId = new Map(nodes.map(node => [node.id, node]));
		this.flowLayoutHeights.clear();
		const heights: Record<string, number> = {};

		nodes.forEach((node, i) => {
			const placement = result.nodes.get(node.id);
			if (!placement) {
				node.x = i * (LOOK_C_WIDTH + 60);
				node.y = 0;
				return;
			}
			node.x = mirror ? mx(placement.x + placement.width) : placement.x;
			node.y = mirror && vertical ? my(placement.y + placement.height) : placement.y;
			this.flowLayoutHeights.set(node.id, placement.height);
		});

		layoutEdges.forEach(edge => {
			const route = result.edges.get(edgeIds.get(edge) as string);
			const source = byId.get(edge.sourceId);
			const target = byId.get(edge.targetId);
			if (!route || route.points.length < 2 || source === undefined || target === undefined) {
				edge.vertices = [];
				edge.autoRouted = false;
				return;
			}
			const points = route.points.map(point => ({x: mx(point.x), y: my(point.y)}));
			const first = points[0];
			const last = points[points.length - 1];
			edge.sourcePortDy = Math.round((vertical ? first.x - source.x : first.y - source.y) * 100) / 100;
			edge.targetPortDy = Math.round((vertical ? last.x - target.x : last.y - target.y) * 100) / 100;
			// Inner points only: x6 draws from the output port to the first one and from the last one to the input port.
			edge.vertices = points.slice(1, -1);
			edge.autoRouted = true;
			// Negative pixels from the target end: x6 stops at the layout's label point, 12 px before the block.
			edge.labelDistance = -FLOW_LABEL_GAP;
		});

		// Saved with the plan, so a reload draws the same tall blocks without re-running the layout.
		this.flowLayoutHeights.forEach((height, id) => heights[id] = height);
		this.layoutHeightsOfEdges.set(edges, heights);
		this.laidOutEdges.add(edges);
	}

	/** The height map a layout produced, written onto the graph when the caller owns a mutable graph. */
	private layoutHeightsOfEdges = new WeakMap<GraphEdge[], Record<string, number>>();

	private applyLayoutHeights(graph: Graph): void
	{
		const heights = graph.layoutHeights ?? this.layoutHeightsOfEdges.get(graph.edges);
		this.flowLayoutHeights.clear();
		if (heights === undefined) {
			return;
		}
		Object.entries(heights).forEach(([id, height]) => this.flowLayoutHeights.set(id, height));
	}

	/**
	 * Rebuilds the height map from the saved ports: the layout centred its ports on each block and spaced them one
	 * port gap apart, so the block was tall enough for its outermost port on both sides of the middle.
	 */
	private deriveLayoutHeights(graph: Graph): Record<string, number>
	{
		const gap = FLOW_PORT_GAP * this.nodeScale();
		const lowest = new Map<string, number>();
		const highest = new Map<string, number>();
		const see = (nodeId: string, dy: number): void => {
			lowest.set(nodeId, Math.max(lowest.get(nodeId) ?? 0, dy));
			highest.set(nodeId, Math.min(highest.get(nodeId) ?? Infinity, dy));
		};
		for (const edge of graph.edges) {
			if (edge.targetPortDy !== undefined) {
				see(edge.targetId, edge.targetPortDy);
			}
			if (edge.sourcePortDy !== undefined) {
				see(edge.sourceId, edge.sourcePortDy);
			}
		}
		const heights: Record<string, number> = {};
		for (const node of graph.nodes) {
			const low = lowest.get(node.id);
			const high = highest.get(node.id);
			const base = this.sizeFor(node).height;
			heights[node.id] = low === undefined || high === undefined
				? base
				// Port offsets run from the block's top and sit centred on it, so the space above the first port
				// equals the space below the last one.
				: Math.max(base, low + high);
		}
		return heights;
	}

	/**
	 * A plan saved before the flow layout carries ELK routes (relative label distances, 0-1): it gets the flow layout
	 * once, then is stamped and saved. A layout-mode change re-routes the open plan the same way, and so does a look
	 * change, because Look B's blocks are narrower than Look C's and the saved positions were measured for the old ones.
	 */
	private ensureFlowLayout(graph: Graph): void
	{
		const mode = this.settings.graph().layoutMode;
		const look = this.settings.graph().look;
		const modeChanged = this.renderedLayoutMode !== null && this.renderedLayoutMode !== mode;
		// A redraw after the look changed, because block widths differ between the two looks.
		const lookChanged = this.renderedLook !== null && this.renderedLook !== look;
		// A look switch keeps hand-placed blocks where they are, unless the new block sizes would overlap.
		const layoutChanged = modeChanged || (lookChanged && this.blocksOverlap(graph));
		this.renderedLayoutMode = mode;
		this.renderedLook = look;
		if (graph.nodes.length === 0) {
			return;
		}
		// Freshly laid out by layout() a moment ago, only the marker is missing.
		const fresh = this.laidOutEdges.has(graph.edges) && !lookChanged;
		// A look stamps its own geometry, so a plan laid out in the other look is laid out again.
		const stamp = look === 'game' ? GAME_LAYOUT_VERSION : LAYOUT_VERSION;
		// A fresh layout (a calculation or Rearrange) brings new heights; the graph may still carry the old ones.
		if (fresh && !modeChanged) {
			graph.layoutVersion = stamp;
			graph.layoutHeights = this.layoutHeightsOfEdges.get(graph.edges) ?? graph.layoutHeights;
			return;
		}
		if (lookChanged && !layoutChanged && (graph.layoutVersion === LAYOUT_VERSION || graph.layoutVersion === GAME_LAYOUT_VERSION)) {
			graph.layoutVersion = stamp;
		}
		if (graph.layoutVersion === stamp && !layoutChanged) {
			// Ports need the room the layout left for them; a graph rebuilt without the heights gets them back
			// from its own routes instead of the layout running again.
			if (graph.layoutHeights === undefined) {
				graph.layoutHeights = this.deriveLayoutHeights(graph);
			}
			return;
		}
		this.layoutFlowGraph(graph.nodes, graph.edges, this.planManager.activePlan()?.settings.graph);
		graph.layoutVersion = stamp;
		graph.layoutHeights = this.layoutHeightsOfEdges.get(graph.edges);
		const plan = this.planManager.activePlan();
		if (plan !== null && !this.planManager.isReadOnlyPlan(plan.id)) {
			this.planManager.setGraph(plan.id, graph);
		}
	}

	/** True when two blocks, drawn at their sizes in the current look, would overlap. */
	private blocksOverlap(graph: Graph): boolean
	{
		const boxes = graph.nodes
			.map(node => ({x: node.x, y: node.y, ...this.nodeSizeForDraw(node)}))
			.sort((a, b) => a.x - b.x);
		for (let i = 0; i < boxes.length; i++) {
			const a = boxes[i];
			for (let j = i + 1; j < boxes.length && boxes[j].x < a.x + a.width; j++) {
				const b = boxes[j];
				if (b.y < a.y + a.height && a.y < b.y + b.height) {
					return true;
				}
			}
		}
		return false;
	}

	/** Source blocks feed the chart from the left; products close it on the right. */
	private flowKindFor(node: Node): 'source' | 'product' | 'normal'
	{
		if (node instanceof MineNode || node instanceof InputNode) {
			return 'source';
		}
		return node instanceof ProductNode ? 'product' : 'normal';
	}

	private isVertical(direction: GraphDirection): boolean
	{
		return direction === 'down' || direction === 'up';
	}

	/** Gives hand-made or missing ports a place on the block edge and an orthogonal route, so nothing draws diagonally. */
	private prepareFlowEdges(graph: Graph): void
	{
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		const nodes = new Map(graph.nodes.map(node => [node.id, node]));
		const gap = FLOW_PORT_GAP * this.nodeScale();
		const incoming = new Map<string, GraphEdge[]>();
		const outgoing = new Map<string, GraphEdge[]>();
		for (const edge of graph.edges) {
			const target = incoming.get(edge.targetId);
			if (target) target.push(edge); else incoming.set(edge.targetId, [edge]);
			const source = outgoing.get(edge.sourceId);
			if (source) source.push(edge); else outgoing.set(edge.sourceId, [edge]);
		}
		const stacked = (node: Node, index: number, count: number): number => {
			// Centre the ports on the block, in room the block actually has for them.
			const height = Math.max(this.nodeSizeForDraw(node).height, count * gap + 18);
			return height / 2 + (index - (count - 1) / 2) * gap;
		};
		incoming.forEach((list, nodeId) => {
			const node = nodes.get(nodeId);
			if (!node) {
				return;
			}
			list.forEach((edge, index) => {
				if (edge.targetPortDy === undefined) {
					edge.targetPortDy = stacked(node, index, list.length);
				}
			});
		});
		outgoing.forEach((list, nodeId) => {
			const node = nodes.get(nodeId);
			if (!node) {
				return;
			}
			// One output per item: every line of the same item leaves at the same height.
			const itemIndex = new Map<string, number>();
			list.forEach(edge => {
				if (!itemIndex.has(edge.itemClassName)) {
					itemIndex.set(edge.itemClassName, itemIndex.size);
				}
			});
			list.forEach(edge => {
				if (edge.sourcePortDy === undefined) {
					edge.sourcePortDy = stacked(node, itemIndex.get(edge.itemClassName) ?? 0, itemIndex.size);
				}
			});
		});
		for (const edge of graph.edges) {
			if (edge.autoRouted === true && edge.vertices !== undefined) {
				continue;
			}
			const source = nodes.get(edge.sourceId);
			const target = nodes.get(edge.targetId);
			if (!source || !target || edge.sourcePortDy === undefined || edge.targetPortDy === undefined) {
				continue;
			}
			edge.vertices = this.straightRoute(source, target, edge.sourcePortDy, edge.targetPortDy);
			edge.autoRouted = true;
			if (edge.labelDistance === undefined || (edge.labelDistance > 0 && edge.labelDistance <= 1)) {
				edge.labelDistance = -FLOW_LABEL_GAP;
			}
		}
	}

	/** Two- or four-corner route between the two ports, right-angled whichever way the chart runs. */
	private straightRoute(source: Node, target: Node, sourceOffset: number, targetOffset: number): GraphPoint[]
	{
		const from = this.portPoint(source, 'out', sourceOffset);
		const to = this.portPoint(target, 'in', targetOffset);
		const fromX = source.x + from.x;
		const fromY = source.y + from.y;
		const toX = target.x + to.x;
		const toY = target.y + to.y;
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		if (this.isVertical(direction)) {
			if (Math.abs(fromX - toX) < 0.5) {
				return [];
			}
			const middle = Math.round((fromY + toY) / 2);
			return [{x: fromX, y: middle}, {x: toX, y: middle}];
		}
		if (Math.abs(fromY - toY) < 0.5) {
			return [];
		}
		const middle = Math.round((fromX + toX) / 2);
		return [{x: middle, y: fromY}, {x: middle, y: toY}];
	}

	private buildLinePalette(graph: Graph): void
	{
		const data = this.versionManager.activeVersionData();
		const fluids = new Set<string>();
		if (data !== null) {
			for (const edge of graph.edges) {
				if (ConveyorCapacity.isFluid(data.searchItemByClassName(edge.itemClassName) ?? null)) {
					fluids.add(edge.itemClassName);
				}
			}
		}
		this.linePalette = FlowLinePalette.forGraph(graph, this.settings.graph().colourLinesByItem, fluids);
	}

	private lineColourFor(itemClassName: string): string
	{
		return this.linePalette?.colourFor(itemClassName) ?? this.flowCasingColour();
	}

	/** Junction dots in the stage, so they pan, zoom and export with the cells. */
	private drawFlowJunctions(): void
	{
		const x6Graph = this.x6Graph;
		const graph = this.renderedGraph;
		if (!x6Graph) {
			return;
		}
		if (!this.junctionLayer) {
			const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			layer.setAttribute('class', 'pg-flow-junctions');
			layer.style.pointerEvents = 'none';
			x6Graph.view.stage.appendChild(layer);
			this.junctionLayer = layer;
		}
		this.junctionCircles.forEach(entry => entry.circle.remove());
		this.junctionCircles = [];
		if (!graph) {
			return;
		}
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		const runsRight = !this.isVertical(direction);
		for (const junction of collectFlowJunctions(graph, runsRight)) {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', String(junction.x));
			circle.setAttribute('cy', String(junction.y));
			circle.setAttribute('r', String(this.flowJunctionRadius()));
			circle.setAttribute('fill', this.lineColourFor(junction.itemClassName));
			this.junctionLayer.appendChild(circle);
			this.junctionCircles.push({circle, x: junction.x, y: junction.y});
		}
	}

	/**
	 * Hovering a line or selecting a block lights up every connection of that link and fades the rest.
	 * Opacity sits on the cell view containers, not the attrs, so done-fades and selection strokes survive.
	 */
	private applyConnectionFocus(edges: ReadonlySet<GraphEdge>): void
	{
		const x6Graph = this.x6Graph;
		if (!x6Graph) {
			return;
		}
		const active = edges.size > 0;
		// A selected block stays clear even when it has no connections.
		const nodeIds = new Set<string>(this.pickedEdgeIds.size > 0 ? [] : this.focusedNodeIds);
		edges.forEach(edge => {
			nodeIds.add(edge.sourceId);
			nodeIds.add(edge.targetId);
		});
		x6Graph.getEdges().forEach(cell => {
			const modelEdge = this.edgeById.get(cell.id);
			const focused = modelEdge !== undefined && edges.has(modelEdge);
			this.setCellOpacity(cell, active && !focused ? FLOW_FADE_OPACITY : 1);
			this.applyFlowEdgeStyle(cell, modelEdge, focused);
		});
		x6Graph.getNodes().forEach(cell => this.setCellOpacity(cell, active && !nodeIds.has(cell.id) ? FLOW_FADE_OPACITY : 1));
	}

	private setCellOpacity(cell: Cell, opacity: number): void
	{
		const view = this.x6Graph?.findViewByCell(cell);
		const container = view?.container;
		if (container instanceof SVGElement) {
			container.style.opacity = opacity === 1 ? '' : String(opacity);
		}
	}

	/** Line widths and label pill follow the focus; colours stay the item's. */
	private applyFlowEdgeStyle(cell: X6Edge, modelEdge: GraphEdge | undefined, focused: boolean): void
	{
		if (modelEdge === undefined) {
			return;
		}
		const base = this.flowLineWidth();
		const width = focused ? base + 1.6 : base;
		cell.attr('line/strokeWidth', width);
		cell.attr('casing/strokeWidth', focused ? width + 5 : this.flowCasingWidth());
		cell.attr('line/stroke', this.lineColourFor(modelEdge.itemClassName));
		if (cell.getLabelAt(0)) {
			cell.prop('labels/0/attrs/rect/strokeWidth', focused ? FLOW_LABEL_STROKE + 1 : FLOW_LABEL_STROKE);
			cell.prop('labels/0/attrs/rect/stroke', this.lineColourFor(modelEdge.itemClassName));
		}
	}

	public restore(container: HTMLElement, graph: Graph, fit = true): void
	{
		// Plans saved with the old router get the flow layout before anything is drawn.
		this.ensureFlowLayout(graph);
		// The caller stores this graph, so its heights must travel with it.
		graph.layoutHeights ??= this.layoutHeightsOfEdges.get(graph.edges);

		const previous = this.x6Graph && !fit
			? {zoom: this.x6Graph.zoom(), translate: this.x6Graph.translate()}
			: null;

		this.warningsById = this.reconciler.computeWarnings(graph);
		this.addExtractorWarnings(this.warningsById, graph);
		const x6Graph = this.createGraph(container);
		this.renderedGraph = graph;
		// Before the nodes: ports and routes read the rendered graph and its blocks.
		this.nodeById.clear();
		graph.nodes.forEach(node => this.nodeById.set(node.id, node));
		this.refreshBeltPlan(graph);
		this.buildLinePalette(graph);
		this.applyLayoutHeights(graph);
		this.prepareFlowEdges(graph);

		// Before addEdge, so edges between done nodes fade too.
		this.doneNodeIds = new Set(graph.nodes.filter(node => node.done).map(node => node.id));

		graph.nodes.forEach(node => this.addNode(x6Graph, node));
		// A saved edge whose node is gone would make x6 throw in its async render.
		const nodeIds = new Set(graph.nodes.map(node => node.id));
		graph.edges.forEach((edge, i) => {
			if (nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId)) {
				this.addEdge(x6Graph, edge, i);
			}
		});
		this.warningEntriesSignal.set(this.buildWarningEntries(graph));
		this.edgesSignal.set([...new Set(this.edgeById.values())]);
		this.drawFlowJunctions();

		if (previous) {
			x6Graph.zoom(previous.zoom, {absolute: true});
			x6Graph.translate(previous.translate.tx, previous.translate.ty);
		} else {
			this.zoomToVisibleArea(x6Graph);
		}
		this.trackNodeMoves(x6Graph, graph.nodes);
	}

	/** A colour bar on the node's left edge and a claim tooltip, keyed by node id; an empty map clears them. */
	public setClaimMarkers(markers: ReadonlyMap<string, {color: string; label: string}>): void
	{
		this.claimMarkers = markers;
		this.nodeById.forEach((_node, id) => {
			const cell = this.x6Graph?.getCellById(id);
			if (cell?.isNode()) {
				this.applyClaimMarker(cell, id);
			}
		});
	}

	public clear(): void
	{
		this.hideTooltip();
		this.hideCornerPreview();
		this.clearVertexSelection();
		this.vertexDragAnchorId = null;
		this.movedNodeIds.clear();
		this.hoveredEdgeView = null;
		this.touchedEdgeId = null;
		this.junctionLayer = null;
		this.junctionCircles = [];
		this.pickedEdgeIds.clear();
		this.focusedNodeIds.clear();
		this.flowLayoutHeights.clear();
		this.connectGesture = null;
		this.markedPorts = [];
		this.dimmedNodeIds = [];
		this.hoverMoveTarget?.classList.remove('pg-connecting');
		this.hoverMoveTarget?.removeEventListener('mousemove', this.edgeHoverListener);
		this.hoverMoveTarget?.removeEventListener('mouseover', this.warningOverListener);
		this.hoverMoveTarget?.removeEventListener('mouseout', this.warningOutListener);
		this.hoverMoveTarget?.removeEventListener('mouseleave', this.tooltipDismissListener);
		this.hoverMoveTarget?.removeEventListener('mousewheel', this.wheelGuardListener, true);
		this.hoverMoveTarget?.removeEventListener('DOMMouseScroll', this.wheelGuardListener, true);
		window.removeEventListener('blur', this.tooltipDismissListener);
		this.hoverMoveTarget = null;
		this.x6Graph?.dispose();
		this.x6Graph = null;
		this.selection = null;
		this.warningsById = new Map();
		this.selectedNodesSignal.set([]);
		this.warningEntriesSignal.set([]);
		this.edgesSignal.set([]);
		this.renderedGraph = null;
		this.beltPlanSignal.set(new Map());
	}

	public nodeSize(node: Node): {width: number; height: number}
	{
		return this.sizeFor(node);
	}

	public selectNodeById(id: string): void
	{
		const cell = this.x6Graph?.getCellById(id);
		if (cell?.isNode()) {
			this.selection?.reset(cell);
		}
	}

	public selectNodesById(ids: string[]): void
	{
		const cells: Cell[] = [];
		ids.forEach(id => {
			const cell = this.x6Graph?.getCellById(id);
			if (cell?.isNode()) {
				cells.push(cell);
			}
		});
		this.selection?.reset(cells);
	}

	public focusNode(id: string): void
	{
		const x6Graph = this.x6Graph;
		const cell = x6Graph?.getCellById(id);
		if (!x6Graph || !cell?.isNode()) {
			return;
		}
		if (x6Graph.zoom() < 0.8) {
			x6Graph.zoom(0.8, {absolute: true});
		}
		x6Graph.centerCell(cell);
		const insets = this.panelLayout.canvasInsets();
		x6Graph.translateBy((insets.left - insets.right) / 2, (insets.top - insets.bottom) / 2);
		this.selection?.reset(cell);
	}

	/** Several nodes are fitted into the visible area (never zoomed past 1:1 or the current zoom); one node keeps focusNode's behaviour. */
	public focusNodes(ids: string[]): void
	{
		const x6Graph = this.x6Graph;
		if (!x6Graph) {
			return;
		}
		const cells = ids
			.map(id => x6Graph.getCellById(id))
			.filter((cell): cell is Cell => cell !== null && cell.isNode());
		if (cells.length === 0) {
			return;
		}
		if (cells.length === 1) {
			this.focusNode(cells[0].id);
			return;
		}
		const insets = this.panelLayout.canvasInsets();
		const padding = {
			left: insets.left + 40,
			right: insets.right + 40,
			top: insets.top + 40,
			bottom: insets.bottom + 40,
		};
		x6Graph.zoomToRect(x6Graph.getCellsBBox(cells) ?? cells[0].getBBox(), {padding, maxScale: Math.max(1, x6Graph.zoom())});
		x6Graph.translateBy((padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2);
		this.selection?.reset(cells);
	}

	private buildWarningEntries(graph: Graph): GraphWarningEntry[]
	{
		const entries: GraphWarningEntry[] = [];
		graph.nodes.forEach(node => {
			const warnings = this.warningsById.get(node.id);
			if (!warnings) {
				return;
			}
			entries.push({
				nodeId: node.id,
				nodeName: node.getDisplayName(),
				nodeIcon: this.warningNodeIcon(node),
				details: [
					...warnings.inputs.map(warning => this.inputWarningDetail(warning.itemClassName, warning.required, warning.supplied)),
					...warnings.outputs.map(warning => this.outputWarningDetail(warning.itemClassName, warning.produced, warning.consumed)),
					...(warnings.capacity !== null ? [this.capacityWarningDetail(warnings.capacity)] : []),
					...(warnings.extractors ? [this.extractorWarningDetail(warnings.extractors, node)] : []),
				],
			});
		});
		return entries;
	}

	/** Mine nodes carry their own extractor setup, which the flow reconciler does not know about. */
	private addExtractorWarnings(warnings: Map<string, GraphNodeWarnings>, graph: Graph): void
	{
		const data = this.versionManager.activeVersionData();
		if (!data) {
			return;
		}
		graph.nodes.forEach(node => {
			if (!(node instanceof MineNode) || node.extractors === null || node.extractors.length === 0) {
				return;
			}
			const capacity = ExtractorCapacity.capacity(node.extractors, data, node.item, this.extractorBeltCap(node.item));
			// Relative tolerance: the capacity is computed locally, so only real shortfalls should warn.
			const tolerance = Math.max(Math.abs(node.amount), Math.abs(capacity), 1) * 1e-6;
			if (capacity >= node.amount - tolerance) {
				return;
			}
			const existing = warnings.get(node.id) ?? {inputs: [], outputs: [], capacity: null};
			warnings.set(node.id, {...existing, extractors: {capacity, needed: node.amount}});
		});
	}

	private extractorBeltCap(item: Item): number | null
	{
		const limit = this.planManager.activeSettings()?.conveyorLimit;
		return limit === undefined ? null : ConveyorCapacity.capacity(limit, ConveyorCapacity.isFluid(item));
	}

	/** Deliberately ignores the graph display settings, unlike nodeIconFor. */
	private warningNodeIcon(node: Node): string | null
	{
		if (node instanceof RecipeNode) {
			return node.machine.icon;
		}
		if (node instanceof GeneratorNode) {
			return node.generator.icon;
		}
		if (node instanceof AugmenterNode) {
			return node.building.icon;
		}
		if (node instanceof ItemAmountNode) {
			return node.item.icon;
		}
		return null;
	}

	public canvasCenter(): GraphPoint
	{
		if (!this.x6Graph) {
			return {x: 0, y: 0};
		}
		const box = this.x6Graph.container.getBoundingClientRect();
		const insets = this.panelLayout.canvasInsets();
		return this.x6Graph.clientToLocal(
			box.left + (insets.left + box.width - insets.right) / 2,
			box.top + (insets.top + box.height - insets.bottom) / 2,
		);
	}

	public zoomIn(): void
	{
		this.x6Graph?.zoom(0.2);
	}

	public zoomOut(): void
	{
		this.x6Graph?.zoom(-0.2);
	}

	public zoomFit(): void
	{
		if (this.x6Graph) {
			this.zoomToVisibleArea(this.x6Graph);
		}
	}

	/** Drops the saved bend points so the connection follows its automatic route again; all of its lines move together. */
	public straightenEdge(edge: GraphEdge): void
	{
		if (this.readOnly) {
			return;
		}
		const source = this.renderedGraph?.nodes.find(node => node.id === edge.sourceId);
		const target = this.renderedGraph?.nodes.find(node => node.id === edge.targetId);
		if (source === undefined || target === undefined) {
			return;
		}
		// Snapshot first, like a drag: the model edge still holds the pre-change vertices.
		this.graphEditStartSubject.next();
		// One snapshot for the whole change; the per-edge handler below must not take one for each cell.
		this.vertexGestureActive = true;
		// Back to the plain two-corner route between the two ports, which is still right-angled.
		const vertices = this.straightRoute(source, target, edge.sourcePortDy ?? 0, edge.targetPortDy ?? 0);
		edge.vertices = vertices;
		edge.autoRouted = true;
		const x6Graph = this.x6Graph;
		x6Graph?.getEdges().forEach(cell => {
			if (this.edgeById.get(cell.id) === edge) {
				cell.setVertices([...vertices], {autoRoute: true});
			}
		});
		this.graphChangedSubject.next();
		this.drawFlowJunctions();
	}

	/** x6's zoomToFit centers on the full canvas, so the padding asymmetry is applied as a translation. */
	private zoomToVisibleArea(x6Graph: X6Graph): void
	{
		const insets = this.panelLayout.canvasInsets();
		const padding = {
			left: insets.left + 40,
			right: insets.right + 40,
			top: insets.top + 40,
			bottom: insets.bottom + 40,
		};
		x6Graph.zoomToFit({padding, maxScale: FIT_MAX_SCALE});
		x6Graph.translateBy((padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2);
	}

	/** Copying the canvas with its computed styles is the slow part of an export, so the window takes this once and cuts every file and preview from it. */
	public async exportSnapshot(): Promise<GraphSvgSnapshot | null>
	{
		const x6Graph = this.x6Graph;
		if (x6Graph === null || x6Graph.getNodes().length === 0) {
			return null;
		}
		const content = this.boxWithMargin(x6Graph.getContentArea(), EXPORT_MARGIN);
		const sample = this.boxWithMargin(this.exportSampleNode(x6Graph, content).getBBox(), EXPORT_SAMPLE_MARGIN);
		// Styling is in presentation attributes; x6's copyStyles would inline every computed property (the viewport's pan/zoom matrix among them) and bloat the file.
		const fontFamily = getComputedStyle(x6Graph.container).fontFamily;
		const text = await x6Graph.toSVGAsync({
			viewBox: content,
			preserveDimensions: true,
			copyStyles: false,
			beforeSerialize: svg => this.cleanExportSvg(svg, fontFamily),
		});
		const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
		if (!(root instanceof SVGSVGElement)) {
			throw new Error('The chart could not be exported.');
		}
		return new GraphSvgSnapshot(root, content, sample);
	}

	private exportSampleNode(x6Graph: X6Graph, content: ExportBox): X6Node
	{
		const centerX = content.x + content.width / 2;
		const centerY = content.y + content.height / 2;
		let best: X6Node | null = null;
		let bestDistance = Infinity;
		x6Graph.getNodes().forEach(node => {
			const center = node.getBBox().center;
			const distance = (center.x - centerX) ** 2 + (center.y - centerY) ** 2;
			if (distance < bestDistance) {
				best = node;
				bestDistance = distance;
			}
		});
		return best!;
	}

	private boxWithMargin(box: ExportBox, margin: number): ExportBox
	{
		return {
			x: Math.floor(box.x - margin),
			y: Math.floor(box.y - margin),
			width: Math.ceil(box.width + 2 * margin),
			height: Math.ceil(box.height + 2 * margin),
		};
	}

	/** The selection and its highlighted edges are drawn through cell attrs, so the copy carries them; this puts the plain look back. */
	private cleanExportSvg(svg: SVGSVGElement, fontFamily: string): void
	{
		svg.setAttribute('font-family', fontFamily);
		svg.querySelectorAll('.x6-node-selected rect.pn-body, .x6-node-selected path.pn-body').forEach(body => {
			const cellId = body.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '';
			const modelNode = this.nodeById.get(cellId);
			if (body.tagName.toLowerCase() === 'path') {
				// Look B: the selection is a warmer fill and an outline; put the plain card back.
				if (modelNode) {
					const stroke = this.styleFor(modelNode).bodyStroke;
					body.setAttribute('fill', modelNode.done ? GAME_CARD_BUILT : this.baseStyleFor(modelNode).bodyFill);
					body.setAttribute('stroke', stroke);
					body.setAttribute('stroke-width', stroke === 'none' ? '0' : String(NODE_STROKE_WIDTH));
				}
				return;
			}
			body.setAttribute('stroke', modelNode ? this.styleFor(modelNode).bodyStroke : NODE_FALLBACK_STROKE);
			body.setAttribute('stroke-width', String(NODE_STROKE_WIDTH));
		});
		const clonedMarkers = new Set<string>();
		svg.querySelectorAll(`path.${EDGE_HIGHLIGHT_CLASS}`).forEach(line => {
			const cellId = line.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '';
			const modelEdge = this.edgeById.get(cellId);
			line.setAttribute('stroke', modelEdge ? this.lineColourFor(modelEdge.itemClassName) : EDGE_STROKE);
			line.setAttribute('stroke-width', String(this.flowLineWidth()));
			line.setAttribute('class', EDGE_LINE_CLASS);
			// x6 keeps one <marker> per arrowhead colour, so a highlighted edge points at an orange one. Cloned per
			// colour: over-limit lines and normal ones can share that marker in the same export.
			['marker-start', 'marker-mid', 'marker-end'].forEach(name => {
				const markerId = line.getAttribute(name)?.match(/url\(#(.+)\)/)?.[1];
				if (markerId === undefined) {
					return;
				}
				const marker = svg.querySelector(`#${CSS.escape(markerId)}`);
				if (marker === null) {
					return;
				}
				const stroke = line.getAttribute('stroke') ?? EDGE_STROKE;
				const cloneId = `${markerId}-export-${stroke.slice(1)}`;
				if (!clonedMarkers.has(cloneId)) {
					const clone = marker.cloneNode(true) as Element;
					clone.setAttribute('id', cloneId);
					clone.querySelectorAll(`[stroke="${SELECTED_STROKE}"]`).forEach(arrow => {
						arrow.setAttribute('stroke', stroke);
						arrow.setAttribute('fill', stroke);
					});
					marker.parentNode?.appendChild(clone);
					clonedMarkers.add(cloneId);
				}
				line.setAttribute(name, `url(#${cloneId})`);
			});
		});
		svg.querySelectorAll(`rect.${LABEL_BOX_HIGHLIGHT_CLASS}`).forEach(box => {
			const cellId = box.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '';
			const modelEdge = this.edgeById.get(cellId);
			box.setAttribute('stroke', modelEdge ? this.lineColourFor(modelEdge.itemClassName) : EDGE_STROKE);
			box.setAttribute('stroke-width', String(FLOW_LABEL_STROKE));
			box.setAttribute('rx', String(this.flowLabelRadius()));
			box.setAttribute('ry', String(this.flowLabelRadius()));
			box.setAttribute('class', LABEL_BOX_CLASS);
		});
		// Focus fades live on the cell view's style; an export should show the whole chart.
		svg.querySelectorAll<SVGGElement>('.x6-cell').forEach(cell => {
			cell.style.removeProperty('opacity');
			if (cell.getAttribute('style') === '') {
				cell.removeAttribute('style');
			}
		});
		this.svgCleaner.clean(svg);
	}

	public ngOnDestroy(): void
	{
		this.gestureResetSubscription.unsubscribe();
		this.touchGestures?.detach();
		this.touchGestures = null;
		this.clear();
	}

	private createGraph(container: HTMLElement): X6Graph
	{
		this.hideTooltip();
		if (this.nodeScale() !== this.registeredScale) {
			registerPlannerShapes(this.nodeScale());
			this.registeredScale = this.nodeScale();
		}
		this.hideCornerPreview();
		this.clearVertexSelection();
		this.vertexDragAnchorId = null;
		this.movedNodeIds.clear();
		this.hoveredEdgeView = null;
		this.touchedEdgeId = null;
		// The junction layer lived in the disposed graph's stage.
		this.junctionLayer = null;
		this.junctionCircles = [];
		this.pickedEdgeIds.clear();
		this.focusedNodeIds.clear();
		this.touchGestures?.detach();
		this.touchGestures = null;
		this.x6Graph?.dispose();

		const x6Graph = new X6Graph({
			container,
			autoResize: true,
			panning: true,
			mousewheel: true,
			// Look B's chart is a touch lighter than Look C's (#1c1c1c vs #121315), set here because the shell's
			// .x6-graph background rule is the other worker's file.
			background: {color: this.gameLook() ? GAME_CHART_COLOUR : CHART_COLOUR},
			interacting: this.readOnly ? false : {edgeMovable: false},
			connecting: {
				snap: {radius: CONNECT_SNAP_RADIUS},
				allowBlank: true,
				allowLoop: false,
				allowNode: true,
				allowEdge: false,
				highlight: false,
				validateMagnet: ({magnet}) => !this.readOnly && this.portInfo(this.portIdOf(magnet)) !== null,
				validateConnection: ({targetCell, targetMagnet}) =>
					this.isValidConnectTarget(targetCell ?? null, targetMagnet ?? null),
				// Must not reference the local x6Graph: that breaks type inference of its own initializer.
				createEdge: ({sourceCell, sourceMagnet}) => this.beginConnectGesture(sourceCell, sourceMagnet),
			},
			highlighting: {
				magnetAdsorbed: {name: 'className', args: {className: 'pg-port-adsorbed'}},
			},
		});

		const selection = new Selection({
			enabled: true,
			multiple: true,
			multipleSelectionModifiers: ['ctrl', 'meta', 'shift'],
			rubberband: true,
			modifiers: ['shift'],
			showNodeSelectionBox: false,
			rubberEdge: false,
			filter: cell => cell.isNode(),
		});
		x6Graph.use(selection);
		x6Graph.use(new Export());

		x6Graph.on('selection:changed', ({selected}) => this.onSelectionChanged(x6Graph, selected));
		x6Graph.on('scale', () => this.applyZoomDetail(x6Graph));
		this.applyZoomDetail(x6Graph);
		x6Graph.on('node:contextmenu', ({e, x, y, node}) => {
			e.preventDefault();
			if (!this.isNativeContextMenuSuppressed()) {
				this.onNodeContextMenu(e.clientX ?? 0, e.clientY ?? 0, {x, y}, node);
			}
		});
		x6Graph.on('blank:contextmenu', ({e, x, y}) => {
			e.preventDefault();
			if (!this.isNativeContextMenuSuppressed()) {
				this.onBlankContextMenu(e.clientX ?? 0, e.clientY ?? 0, {x, y});
			}
		});
		x6Graph.on('edge:contextmenu', ({e, x, y, edge}) => {
			e.preventDefault();
			if (!this.isNativeContextMenuSuppressed()) {
				this.onEdgeContextMenu(e.clientX ?? 0, e.clientY ?? 0, {x, y}, edge);
			}
		});
		x6Graph.on('blank:dblclick', ({x, y}) => this.onBlankDoubleClick({x, y}));
		x6Graph.on('node:dblclick', ({node}) => this.onNodeDoubleClick(node));

		this.touchGestures = new GraphTouchGestures(container, {
			isCellElement: target => x6Graph.findViewByElem(target) !== null,
			onTouchUsed: () => this.markTouchUsed(x6Graph),
			onPan: (dx, dy) => x6Graph.translateBy(dx, dy),
			onPinch: (factor, clientX, clientY) => {
				const center = x6Graph.clientToGraph(clientX, clientY);
				x6Graph.zoom(x6Graph.zoom() * factor, {absolute: true, center, minScale: 0.05, maxScale: 4});
			},
			onDoubleTap: (clientX, clientY, target) => {
				const view = x6Graph.findViewByElem(target);
				if (view === null) {
					this.onBlankDoubleClick(x6Graph.clientToLocal(clientX, clientY));
				} else if (view.cell.isNode()) {
					this.onNodeDoubleClick(view.cell);
				}
			},
			onLongPress: (clientX, clientY, target) => {
				this.suppressNativeContextMenuUntil = performance.now() + 1000;
				const local = x6Graph.clientToLocal(clientX, clientY);
				const view = x6Graph.findViewByElem(target);
				if (view === null) {
					this.onBlankContextMenu(clientX, clientY, local);
				} else if (view.cell.isNode()) {
					this.onNodeContextMenu(clientX, clientY, local, view.cell);
				} else if (view.cell.isEdge()) {
					this.onEdgeContextMenu(clientX, clientY, local, view.cell);
				}
			},
		});
		this.touchGestures.attach();

		x6Graph.on('node:mouseenter', ({node}) => this.applyNodeHover(node, true));
		x6Graph.on('node:mouseleave', ({node}) => this.applyNodeHover(node, false));

		// x6 emits cell mousemove only while pressed, so the corner preview uses a native listener (onEdgeHoverMove).
		x6Graph.on('edge:mouseenter', ({view, edge}) => this.showEdgeTools(view, edge));
		x6Graph.on('edge:mouseleave', ({view, edge}) => {
			// A tap ends with a synthetic mouseleave; a tapped edge keeps its handles.
			if (this.touchedEdgeId !== edge.id) {
				this.hideEdgeTools(view, edge);
			}
		});

		x6Graph.on('edge:click', ({view, edge}) => {
			if (this.touchUsed) {
				this.showEdgeTools(view, edge);
				this.touchedEdgeId = edge.id;
			}
			this.pickEdge(edge.id);
		});
		x6Graph.on('node:click', () => {
			this.releaseTouchedEdge();
			this.pickEdge(null);
		});
		x6Graph.on('blank:click', () => {
			this.releaseTouchedEdge();
			this.pickEdge(null);
		});
		this.hoverMoveTarget?.removeEventListener('mousemove', this.edgeHoverListener);
		this.hoverMoveTarget?.removeEventListener('mouseover', this.warningOverListener);
		this.hoverMoveTarget?.removeEventListener('mouseout', this.warningOutListener);
		this.hoverMoveTarget?.removeEventListener('mouseleave', this.tooltipDismissListener);
		this.hoverMoveTarget?.removeEventListener('mousewheel', this.wheelGuardListener, true);
		this.hoverMoveTarget?.removeEventListener('DOMMouseScroll', this.wheelGuardListener, true);
		window.removeEventListener('blur', this.tooltipDismissListener);
		container.addEventListener('mousemove', this.edgeHoverListener);
		container.addEventListener('mouseover', this.warningOverListener);
		container.addEventListener('mouseout', this.warningOutListener);
		container.addEventListener('mouseleave', this.tooltipDismissListener);
		container.addEventListener('mousewheel', this.wheelGuardListener, true);
		container.addEventListener('DOMMouseScroll', this.wheelGuardListener, true);
		window.addEventListener('blur', this.tooltipDismissListener);
		this.hoverMoveTarget = container;

		x6Graph.on('blank:mousedown', ({e, x, y}) => {
			if (e.shiftKey) {
				this.rubberbandStart = {x, y};
			} else {
				this.clearVertexSelection();
			}
		});
		x6Graph.on('blank:mouseup', ({x, y}) => {
			const start = this.rubberbandStart;
			this.rubberbandStart = null;
			if (start) {
				this.selectVerticesWithin(start, {x, y});
			}
		});
		x6Graph.on('edge:change:vertices', ({edge, options}) => {
			const modelEdge = this.edgeById.get(edge.id);
			if (modelEdge) {
				// Snapshot first: the model edge still holds the pre-change vertices.
				if (!this.vertexGestureActive) {
					this.vertexGestureActive = true;
					this.graphEditStartSubject.next();
				}
				modelEdge.vertices = edge.getVertices();
				// A corner the user dragged is theirs, even if the layout placed the others. x6 translates vertices with a dragged node instead.
				if (options['translateBy'] === undefined && options['autoRoute'] !== true) {
					modelEdge.autoRouted = false;
				}
				this.graphChangedSubject.next();
			}
			if (this.selectedVertexMap.has(edge.id)) {
				this.renderVertexHighlights();
			}
		});

		this.x6Graph = x6Graph;
		this.selection = selection;
		this.selectedNodesSignal.set([]);
		this.edgeById.clear();
		this.edgesSignal.set([]);
		this.baseZIndexById.clear();
		this.pendingZChanges.clear();
		this.vertexGestureActive = false;
		this.movedNodeIds.clear();

		return x6Graph;
	}

	private verticesTool(): EdgeToolNativeItem
	{
		// Per hover: the tool is rebuilt on every mouseenter, so the setting applies without a reload.
		const addable = this.settings.graph().addBendPointsByClick;
		return {
			name: 'vertices',
			args: {
				snapRadius: 10,
				addable,
				removable: true,
				attrs: {
					r: 5,
					fill: '#1e2d3b',
					stroke: SELECTED_STROKE,
					'stroke-width': 1.5,
					// The move cursor is set while dragging, in styles.scss.
					cursor: 'pointer',
				},
				// The stock tool removes on double-click; here a click without dragging removes.
				processHandle: (handle: VertexHandle) => {
					let moved = false;
					handle.on('change', () => {
						moved = false;
					});
					handle.on('changing', () => {
						moved = true;
					});
					handle.on('changed', args => {
						if (!moved) {
							// Deferred so the tool finishes its move-vertex batch first.
							setTimeout(() => handle.trigger('remove', args));
						}
					});
				},
			},
		};
	}

	private applyClaimMarker(cell: X6Node, nodeId: string): void
	{
		const marker = this.claimMarkers.get(nodeId);
		const title = marker === undefined ? '' : `Claimed by ${marker.label}`;
		cell.attr('claimBar/width', CLAIM_BAR_WIDTH * this.nodeScale());
		cell.attr('claimBar/fill', marker?.color ?? '');
		cell.attr('claimBar/display', marker === undefined ? 'none' : 'inline');
		// Every part of the node the pointer can rest on carries the tooltip; the icons keep their own.
		CLAIM_TITLE_SELECTORS.forEach(selector => cell.attr(`${selector}/title`, title));
	}

	private addNode(x6Graph: X6Graph, node: Node): void
	{
		if (node instanceof SubplanNode) {
			this.addSubplanNode(x6Graph, node);
			return;
		}
		if (this.gameLook()) {
			this.addGameNode(x6Graph, node);
			return;
		}

		const style = this.styleFor(node);
		const size = this.nodeSizeForDraw(node);
		const sloopIcon = this.sloopIconFor(node);
		const sloopGlow = sloopIcon !== '' && this.settings.graph().sloopGlow;
		const cornerSloop = sloopIcon !== '' && this.settings.graph().showSloopCornerIcon ? sloopIcon : '';
		const scale = this.nodeScale();
		const content = this.cardContentFor(node);
		const textX = this.cardTextX(content);
		const recipe = node instanceof RecipeNode;
		const clockLines = content.dimLine === '' ? 0 : content.dimLine.split('\n').length;
		const makesY = this.recipeMakesY(clockLines) * scale;
		const nameY = (recipe ? LOOK_C_NAME_Y : LOOK_C_ITEM_NAME_Y) * scale;
		// The Alt tag sits at the card's right edge, on the recipe line; a name too long for the room left is cut short.
		const altShown = recipe && content.alternate;
		const altX = size.width - (LOOK_C_ALT_WIDTH + ALT_RIGHT_PAD) * scale;
		const nameRoom = (altShown ? altX - LOOK_C_ALT_GAP * scale : size.width - ALT_RIGHT_PAD * scale) - textX;
		const name = fitText(content.name, nameRoom, LOOK_C_NAME_FONT * scale, true);
		const countX = textX + (content.countIcon === '' ? 0 : (LOOK_C_COUNT_ICON + LOOK_C_COUNT_ICON_GAP) * scale);
		const makesX = textX + measureTextWidth('Makes ', LOOK_C_DIM_FONT * scale, false);
		// Faded per element so the `done` check stays opaque.
		const fade = node.done ? {opacity: DONE_OPACITY} : {};
		const cell = x6Graph.addNode({
			id: node.id,
			shape: 'planner-node',
			zIndex: NODE_BASE_Z,
			x: node.x,
			y: node.y,
			width: size.width,
			height: size.height,
			ports: this.portsFor(node),
			attrs: {
				body: {
					fill: style.bodyFill,
					stroke: style.bodyStroke,
					strokeWidth: NODE_STROKE_WIDTH,
					rx: LOOK_C_RADIUS * scale,
					ry: LOOK_C_RADIUS * scale,
					...(sloopGlow
						? {filter: {name: 'dropShadow', args: {dx: 0, dy: 0, blur: 9, color: SLOOP_GLOW_COLOR, opacity: 0.55}}}
						: {}),
					...fade,
				},
				stripe: {...stripeAttrs(LOOK_C_RADIUS * scale, LOOK_C_STRIPE * scale), fill: style.accent},
				name: {text: name, x: textX, y: nameY, ...fade},
				altTag: {...this.altTagAttrs(recipe && content.alternate, altX, nameY, scale), ...fade},
				altText: {...this.altTextAttrs(recipe && content.alternate, altX, nameY, scale), ...fade},
				machines: {
					text: content.bigLine,
					x: countX,
					y: (recipe ? LOOK_C_COUNT_Y : LOOK_C_AMOUNT_Y) * scale,
					...fade,
				},
				stats: {
					text: content.dimLine,
					display: content.dimLine === '' ? 'none' : 'inline',
					x: textX,
					// A multi-line text block is centred on y, so lift it to keep its first line on the clock row.
					y: (recipe ? LOOK_C_CLOCK_Y + (clockLines - 1) * LOOK_C_CLOCK_STEP / 2 : LOOK_C_KIND_Y) * scale,
					lineHeight: LOOK_C_LINE_HEIGHT * scale,
					fontSize: (recipe ? LOOK_C_DIM_FONT : LOOK_C_KIND_FONT) * scale,
					...fade,
				},
				extra: {
					text: content.extraLine,
					display: content.extraLine === '' ? 'none' : 'inline',
					x: textX,
					y: LOOK_C_EXTRA_Y * scale,
					lineHeight: LOOK_C_LINE_HEIGHT * scale,
					fontSize: LOOK_C_KIND_FONT * scale,
					...fade,
				},
				makesLabel: {
					text: content.makes === '' ? '' : 'Makes ',
					display: content.makes === '' ? 'none' : 'inline',
					x: textX,
					y: makesY,
					...fade,
				},
				makesRate: {
					text: content.makes,
					display: content.makes === '' ? 'none' : 'inline',
					x: makesX,
					y: makesY,
					...fade,
				},
				makesUnit: {
					text: content.makesUnit,
					display: content.makesUnit === '' ? 'none' : 'inline',
					x: makesX + measureTextWidth(content.makes, LOOK_C_MAKES_RATE_FONT * scale, true),
					y: makesY,
					...fade,
				},
				zoomedOutName: {
					...this.zoomedOutNameAttrs(content.name, size, content.icon === '' ? ZOOMED_OUT_NAME_PAD_RIGHT : LOOK_C_TEXT_INSET, ZOOMED_OUT_NAME_PAD_RIGHT),
					...fade,
				},
				machineIcon: {...this.iconAttrs(content.icon), ...this.cardIconAttrs(content.icon, scale), ...fade},
				countIcon: {...this.iconAttrs(content.countIcon), y: (LOOK_C_COUNT_Y - LOOK_C_COUNT_ICON / 2) * scale, ...fade},
				...this.recipeSloopBadges(node, textX, fade),
				sloop: {...this.iconAttrs(cornerSloop), ...fade},
				lock: {...this.iconAttrs(style.lock), y: (cornerSloop ? LOCK_ROW2_Y : LOOK_C_CORNER_INSET) * scale, ...fade},
				done: this.iconAttrs(style.done),
				inputWarning: {...this.iconAttrs(style.inputWarning), ...fade},
				outputWarning: {...this.iconAttrs(style.outputWarning), ...fade},
				capacityWarning: {
					...this.iconAttrs(style.capacityWarning),
					...(node.done ? {refDx: -(WARNING_ICON_SIZE + LOOK_C_CORNER_INSET + DONE_ICON_SIZE + 4) * scale} : {}),
					...fade,
				},
			},
		});
		this.applyClaimMarker(cell, node.id);
	}

	/**
	 * A Look B ("Game style") block: a chamfered card with the machine count and rate on a band across its top, then
	 * the product icon, the recipe name with its Alt tag, and the clocks (mock-up ui-mockups/style.css .node, look b).
	 */
	private addGameNode(x6Graph: X6Graph, node: Node): void
	{
		const style = this.styleFor(node);
		const size = this.nodeSizeForDraw(node);
		const sloopIcon = this.sloopIconFor(node);
		const sloopGlow = sloopIcon !== '' && this.settings.graph().sloopGlow;
		const cornerSloop = sloopIcon !== '' && this.settings.graph().showSloopCornerIcon ? sloopIcon : '';
		const scale = this.nodeScale();
		const content = this.cardContentFor(node);
		const band = this.gameBandFor(node, content);
		const recipe = node instanceof RecipeNode;
		const clockLines = content.dimLine === '' ? 0 : content.dimLine.split('\n').length;
		const textX = (content.icon === '' ? GAME_TEXT_PAD_LEFT : GAME_TEXT_INSET) * scale;
		const nameY = GAME_NAME_Y * scale;
		const altShown = recipe && content.alternate;
		const altX = size.width - (LOOK_C_ALT_WIDTH + ALT_RIGHT_PAD) * scale;
		const nameRoom = (altShown ? altX - GAME_ALT_GAP * scale : size.width - ALT_RIGHT_PAD * scale) - textX;
		const name = fitText(content.name, nameRoom, GAME_NAME_FONT * scale, true, GAME_FONT_FAMILY);
		const bandIconX = GAME_BAND_PAD_LEFT;
		const bandTitleX = bandIconX + (band.icon === '' ? 0 : GAME_BAND_ICON + GAME_BAND_ICON_GAP);
		const rateX = size.width - GAME_BAND_RATE_PAD_RIGHT * scale;
		// Right-anchored unit, then the rate to its left, with a small cushion so rounding cannot close the gap.
		const unitWidth = band.unit === '' ? 0 : measureBandTextWidth(band.unit, GAME_BAND_FONT * scale) + 2 * scale;
		const rateRight = rateX - (band.unit === '' ? 0 : unitWidth + GAME_BAND_ICON_GAP * scale);
		// Look B fades a built block the way the mock-up does: the whole card, not per element, and the card itself
		// takes the built tint (style.bodyFill), so only the icons on top still fade.
		const fade = node.done && style.bodyFill !== GAME_CARD_BUILT ? {opacity: DONE_OPACITY} : {};
		const width = size.width;
		const height = size.height;
		const cell = x6Graph.addNode({
			id: node.id,
			shape: 'planner-game-node',
			zIndex: NODE_BASE_Z,
			x: node.x,
			y: node.y,
			width,
			height,
			ports: this.portsFor(node),
			attrs: {
				body: {
					d: gameCardPath(width, height, GAME_CHAMFER * scale),
					fill: style.bodyFill,
					// Look B cards carry no border of their own; only a warning paints one, in the warning colour.
					stroke: style.bodyStroke === 'none' ? 'none' : style.bodyStroke,
					strokeWidth: style.bodyStroke === 'none' ? 0 : NODE_STROKE_WIDTH,
					...(sloopGlow
						? {filter: {name: 'dropShadow', args: {dx: 0, dy: 0, blur: 9, color: SLOOP_GLOW_COLOR, opacity: 0.55}}}
						: {}),
					...fade,
				},
				band: {
					d: gameBandPath(width, GAME_BAND_H * scale, GAME_CHAMFER * scale),
					fill: band.fill,
					...fade,
				},
				// A Look B card has no room for the bar along its chamfered left edge, so it runs from under the band.
				claimBar: {x: 0, y: GAME_BAND_H * scale, height: height - (GAME_BAND_H + GAME_CHAMFER) * scale, fill: '', display: 'none', rx: scale, ry: scale, pointerEvents: 'none'},
				machines: {
					text: band.title,
					x: bandTitleX * scale,
					y: GAME_BAND_H * scale / 2,
					fill: band.ink,
					...fade,
				},
				bandRate: {
					text: band.value,
					x: rateRight,
					y: GAME_BAND_H * scale / 2,
					fill: band.ink,
					...fade,
				},
				bandUnit: {
					text: band.unit,
					display: band.unit === '' ? 'none' : 'inline',
					x: rateX,
					y: GAME_BAND_H * scale / 2,
					fill: band.ink,
					opacity: 0.7,
					...fade,
				},
				name: {text: name, x: textX, y: nameY, ...fade},
				altTag: {...this.altTagAttrs(recipe && content.alternate, altX, nameY, scale), ...fade},
				altText: {...this.altTextAttrs(recipe && content.alternate, altX, nameY, scale), ...fade},
				stats: {
					text: recipe ? content.dimLine : '',
					display: recipe && content.dimLine !== '' ? 'inline' : 'none',
					x: textX,
					// A multi-line text block is centred on y, so lift it to keep its first line on the clock row.
					y: (GAME_CLOCK_Y + (clockLines - 1) * GAME_LINE_HEIGHT / 2) * scale,
					lineHeight: GAME_LINE_HEIGHT * scale,
					fontSize: GAME_DIM_FONT * scale,
					...fade,
				},
				extra: {
					text: content.extraLine,
					display: content.extraLine === '' ? 'none' : 'inline',
					// A recipe's clocks sit at GAME_CLOCK_Y, so extra lines start under them; other blocks start first.
					y: (recipe ? GAME_CLOCK_Y + Math.max(clockLines, 1) * GAME_LINE_HEIGHT : GAME_CLOCK_Y) * scale,
					lineHeight: GAME_LINE_HEIGHT * scale,
					fontSize: GAME_DIM_FONT * scale,
					...fade,
				},
				zoomedOutName: {
					...this.zoomedOutNameAttrs(content.name, size, content.icon === '' ? ZOOMED_OUT_NAME_PAD_RIGHT : GAME_TEXT_INSET, ZOOMED_OUT_NAME_PAD_RIGHT),
					...fade,
				},
				machineIcon: {...this.iconAttrs(content.icon), ...this.gameIconAttrs(content.icon, scale), ...fade},
				countIcon: {...this.iconAttrs(band.icon), y: (GAME_BAND_H - GAME_BAND_ICON) / 2 * scale, ...fade},
				...this.gameSloopBadges(node, textX, fade),
				sloop: {...this.iconAttrs(cornerSloop), ...fade},
				lock: {...this.iconAttrs(style.lock), y: GAME_BADGE_Y * scale, ...fade},
				done: this.iconAttrs(style.done),
				inputWarning: {...this.iconAttrs(style.inputWarning), ...fade},
				outputWarning: {...this.iconAttrs(style.outputWarning), ...fade},
				capacityWarning: {
					...this.iconAttrs(style.capacityWarning),
					...(node.done ? {refDx: -(WARNING_ICON_SIZE + GAME_CHAMFER + DONE_ICON_SIZE + 4) * scale} : {}),
					...fade,
				},
			},
		});
		this.applyClaimMarker(cell, node.id);
	}

	/** The 38 px item icon under the band, top-aligned with the name row. */
	private gameIconAttrs(icon: string, scale: number): Record<string, number | string>
	{
		return icon === ''
			? {display: 'none'}
			: {
				refX: 0,
				x: GAME_ICON_X * scale,
				refY: 0,
				y: GAME_ICON_Y * scale,
				width: GAME_ICON * scale,
				height: GAME_ICON * scale,
			};
	}

	/** The Look B clock rows carry their somersloop counts like Look C's, on the taller 18 px line. */
	private gameSloopBadges(node: Node, textShift: number, fade: {opacity?: number} = {}): Record<string, Record<string, string | number>>
	{
		if (!(node instanceof RecipeNode) || this.singleLineMachines()) {
			return {};
		}
		const url = this.sloopIconFor(node);
		if (!url) {
			return {};
		}
		const scale = this.nodeScale();
		const badges: Record<string, Record<string, string | number>> = {};
		node.groups.forEach((group, i) => {
			if (group.sloops <= 0 || i >= STAT_SLOOP_MAX_LINES) {
				return;
			}
			const lineWidth = measureTextWidth(this.groupStatLine(group), GAME_DIM_FONT * scale, false, GAME_FONT_FAMILY);
			badges[`statSloop${i}`] = {
				'xlink:href': url,
				display: 'inline',
				x: textShift + lineWidth + STAT_SLOOP_GAP * scale,
				y: (GAME_CLOCK_Y + i * GAME_LINE_HEIGHT + STAT_SLOOP_CENTER_OFFSET - STAT_SLOOP_SIZE / 2) * scale,
				...fade,
			};
		});
		return badges;
	}

	private cardContentFor(node: Node): NodeCardContent
	{
		const graph = this.settings.graph();
		const itemIcon = (item: Item | null): string => graph.showNodeItemIcons && item !== null ? (this.iconUrls.url(item.icon, 64) ?? '') : '';
		const empty = (): NodeCardContent => ({
			icon: '', countIcon: '', name: node.getDisplayName(), alternate: false,
			bigLine: '', dimLine: '', extraLine: '', makes: '', makesUnit: '',
		});
		if (node instanceof RecipeNode) {
			const product = node.recipe.products[0]?.item ?? null;
			const output = node.outputs.find(io => io.item.className === product?.className);
			return {
				...empty(),
				icon: itemIcon(product),
				countIcon: graph.showNodeBuildingIcons ? (this.iconUrls.url(node.machine.icon, 64) ?? '') : '',
				// "Alternate: " moves into the tag beside the name.
				name: node.recipe.name.replace(/^Alternate: /, ''),
				alternate: node.recipe.alternate,
				bigLine: this.machinesLine(node),
				dimLine: this.recipeStats(node),
				makes: this.rateFormatter.amount(output?.maxAmount ?? 0),
				makesUnit: this.rateFormatter.unit(product),
			};
		}
		if (node instanceof GeneratorNode) {
			return {...empty(), icon: graph.showNodeBuildingIcons ? (this.iconUrls.url(node.generator.icon, 64) ?? '') : '', bigLine: this.rateFormatter.amount(node.amount), dimLine: 'Generator', extraLine: this.generatorStats(node)};
		}
		if (node instanceof AugmenterNode) {
			return {...empty(), icon: graph.showNodeBuildingIcons ? (this.iconUrls.url(node.building.icon, 64) ?? '') : '', bigLine: this.rateFormatter.amount(node.amount), dimLine: 'Augmenter', extraLine: this.augmenterStats(node)};
		}
		if (node instanceof SinkNode) {
			return {...empty(), icon: itemIcon(node.item), bigLine: this.rateFormatter.rate(node.amount, node.item), dimLine: 'Sink', extraLine: this.sinkPointsLine(node)};
		}
		if (node instanceof MineNode) {
			const [amount, ...extra] = this.mineStats(node).split('\n');
			return {...empty(), icon: itemIcon(node.item), bigLine: this.amountWithoutKind(amount), dimLine: 'Resource', extraLine: extra.join('\n')};
		}
		if (node instanceof InputNode) {
			return {...empty(), icon: itemIcon(node.item), bigLine: this.inputAmountLine(node), dimLine: 'Supplied'};
		}
		if (node instanceof ProductNode) {
			return {...empty(), icon: itemIcon(node.item), bigLine: this.rateFormatter.rate(node.amount, node.item), dimLine: 'Output'};
		}
		if (node instanceof ByproductNode) {
			return {...empty(), icon: itemIcon(node.item), bigLine: this.rateFormatter.rate(node.amount, node.item), dimLine: 'Byproduct'};
		}
		if (node instanceof ItemAmountNode) {
			return {...empty(), icon: itemIcon(node.item), bigLine: this.rateFormatter.rate(node.amount, node.item), dimLine: node.type};
		}
		return {...empty(), bigLine: this.rateFormatter.amount(node.amount), dimLine: node.type};
	}

	/** "Resource, 80.46/min" is split into an amount and a kind word of its own. */
	private amountWithoutKind(line: string): string
	{
		return line.replace(/^[A-Za-z ]+, /, '');
	}

	/** How much is supplied against what the plan asks for, like the mock-up's "80.46 of 180/min". */
	private inputAmountLine(node: InputNode): string
	{
		const supplied = this.rateFormatter.rate(node.amount, node.item);
		const input = this.planManager.activePlan()?.inputs.find(candidate => candidate.itemClassName === node.item.className);
		if (input === undefined) {
			return supplied;
		}
		const unit = this.rateFormatter.unit(node.item);
		const limit = this.rateFormatter.amount(input.amount);
		return unit.startsWith('/')
			? `${this.rateFormatter.amount(node.amount)} of ${limit}${unit}`
			: `${this.rateFormatter.amount(node.amount)} of ${limit} ${unit}`;
	}

	private cardTextX(content: NodeCardContent): number
	{
		return (content.icon === '' ? LOOK_C_TEXT_PAD_RIGHT : LOOK_C_TEXT_INSET) * this.nodeScale();
	}

	/** The 52 px item icon at the block's left, top-aligned with the text column. */
	private cardIconAttrs(icon: string, scale: number): Record<string, number | string>
	{
		return icon === ''
			? {display: 'none'}
			: {
				refX: 0,
				x: LOOK_C_ICON_X * scale,
				refY: 0,
				y: LOOK_C_PAD_Y * scale,
				width: LOOK_C_ICON * scale,
				height: LOOK_C_ICON * scale,
			};
	}

	/** The "Alt" tag, hidden unless the recipe is an alternate. Its 4 px radius is the same in both looks. */
	private altTagAttrs(visible: boolean, x: number, y: number, scale: number): Record<string, string | number>
	{
		if (!visible) {
			return {display: 'none'};
		}
		return {
			display: 'inline',
			x,
			y: y - LOOK_C_ALT_HEIGHT * scale / 2,
			width: LOOK_C_ALT_WIDTH * scale,
			height: LOOK_C_ALT_HEIGHT * scale,
			strokeWidth: scale,
			rx: LOOK_C_ALT_RADIUS * scale,
			ry: LOOK_C_ALT_RADIUS * scale,
		};
	}

	private altTextAttrs(visible: boolean, x: number, y: number, scale: number): Record<string, string | number>
	{
		if (!visible) {
			return {display: 'none'};
		}
		return {
			display: 'inline',
			text: 'Alt',
			// Centred on the tag: the shape's default anchor is the start, which pushed the word into the right border.
			textAnchor: 'middle',
			x: x + LOOK_C_ALT_WIDTH * scale / 2,
			y,
			fontSize: LOOK_C_ALT_FONT * scale,
		};
	}

	private addSubplanNode(x6Graph: X6Graph, node: SubplanNode): void
	{
		const style = this.baseStyleFor(node);
		const size = this.nodeSizeForDraw(node);
		const baseSize = this.sizeFor(node);
		const game = this.gameLook();
		const ioInset = this.settings.graph().showSubplanItemIcons ? SUBPLAN_IO_COLUMN_WIDTH + 4 : ZOOMED_OUT_NAME_PAD_RIGHT;
		const attrs: Record<string, Record<string, string | number>> = game
			? {
				body: {d: gameCardPath(size.width, size.height, GAME_CHAMFER * this.nodeScale()), fill: style.bodyFill, stroke: 'none', strokeWidth: NODE_STROKE_WIDTH},
				name: {text: this.subplanDisplayName(node)},
				stats: {text: this.subplanStats(node)},
				zoomedOutName: this.zoomedOutNameAttrs(this.subplanDisplayName(node), baseSize, ioInset, ioInset),
				lock: {...this.iconAttrs(this.lockIconUri), y: GAME_CHAMFER * this.nodeScale()},
			}
			: {
				body: {fill: style.bodyFill, stroke: style.bodyStroke, strokeWidth: NODE_STROKE_WIDTH, rx: LOOK_C_RADIUS, ry: LOOK_C_RADIUS},
				stripe: {...stripeAttrs(LOOK_C_RADIUS, LOOK_C_STRIPE), fill: style.accent},
				name: {text: this.subplanDisplayName(node)},
				stats: {text: this.subplanStats(node)},
				zoomedOutName: this.zoomedOutNameAttrs(this.subplanDisplayName(node), baseSize, ioInset, ioInset),
				lock: this.iconAttrs(this.lockIconUri),
			};
		this.applySubplanIoIcons(attrs, 'in', node.inputs);
		this.applySubplanIoIcons(attrs, 'out', node.outputs);
		if (node.done) {
			Object.values(attrs).forEach(attr => attr['opacity'] = DONE_OPACITY);
		}
		attrs['done'] = this.iconAttrs(style.done);
		const cell = x6Graph.addNode({
			id: node.id,
			shape: game ? 'planner-game-subplan-node' : 'planner-subplan-node',
			zIndex: NODE_BASE_Z,
			x: node.x,
			y: node.y,
			width: size.width,
			height: size.height,
			ports: this.portsFor(node),
			attrs,
		});
		this.applyClaimMarker(cell, node.id);
	}

	private zoomedOutNameAttrs(name: string, size: {width: number; height: number}, leftInset: number, rightInset: number): Record<string, string | number>
	{
		const scale = this.nodeScale();
		const layout = this.zoomedOutNames.layout(
			name,
			size.width - (leftInset + rightInset) * scale,
			size.height - 2 * ZOOMED_OUT_NAME_PAD_Y * scale,
			ZOOMED_OUT_NAME_MAX_FONT * scale,
		);
		return {
			text: layout.text,
			fontSize: layout.fontSize,
			lineHeight: this.zoomedOutNames.lineHeight(layout.fontSize),
			x: (leftInset - rightInset) * scale / 2,
		};
	}

	private applySubplanIoIcons(attrs: Record<string, Record<string, string | number>>, prefix: 'in' | 'out', ios: NodeIO[]): void
	{
		const show = this.settings.graph().showSubplanItemIcons;
		const shown = !show ? 0 : (ios.length <= SUBPLAN_IO_MAX ? ios.length : SUBPLAN_IO_MAX - 1);
		const more = show ? ios.length - shown : 0;
		const rows = shown + (more > 0 ? 1 : 0);
		const scale = this.nodeScale();
		const rowHeight = SUBPLAN_IO_ROW_H * scale;
		const top = Math.max(0, (GraphMetrics.SUBPLAN_NODE_HEIGHT * scale - rows * rowHeight) / 2);
		for (let i = 0; i < SUBPLAN_IO_MAX; i++) {
			const io = i < shown ? ios[i] : null;
			attrs[`${prefix}${i}`] = {
				...this.iconAttrs(io ? (this.iconUrls.url(io.item.icon, 64) ?? '') : ''),
				y: top + i * rowHeight,
			};
		}
		attrs[`${prefix}More`] = {
			text: more > 0 ? `+${more}` : '',
			display: more > 0 ? 'inline' : 'none',
			y: top + shown * rowHeight + SUBPLAN_IO_ICON * scale / 2,
		};
	}

	private portsFor(node: Node): Partial<PortsMetadata>
	{
		const scale = this.nodeScale();		const markup = [
			{tagName: 'circle', selector: 'portBody'},
			{tagName: 'image', selector: 'portIcon'},
		];
		const attrs = {
			portBody: {
				r: PORT_RADIUS * scale,
				magnet: true,
				fill: PORT_FILL,
				stroke: PORT_STROKE,
				strokeWidth: 1.5,
				class: 'pg-port',
			},
			portIcon: {
				width: PORT_ICON_SIZE * scale,
				height: PORT_ICON_SIZE * scale,
				x: -PORT_ICON_SIZE * scale / 2,
				y: -PORT_ICON_SIZE * scale / 2,
				class: 'pg-port pg-port-icon',
			},
		};
		return {
			// Ports sit at the layouts' absolute offsets, so 'absolute' takes the pixel positions from each port's args.
			groups: {
				in: {position: {name: 'absolute', args: {x: 0, y: '50%'}}, markup, attrs},
				out: {position: {name: 'absolute', args: {x: '50%', y: 0}}, markup, attrs},
			},
			items: [
				...this.portItemsFor(node, 'in'),
				...this.portItemsFor(node, 'out'),
			],
		};
	}

	/**
	 * One input per incoming connection (so each line arrives at its own port) and one output per item.
	 * The id is `side|itemClassName|offset`: the item stays readable and the offset keeps ids unique.
	 */
	private portItemsFor(node: Node, group: 'in' | 'out'): PortMetadata[]
	{		const size = this.nodeSizeForDraw(node);
		const edges = this.renderedEdges();
		const items: PortMetadata[] = [];
		const seen = new Set<string>();
		const add = (itemClassName: string, dy: number): void => {
			const portId = `${group}|${itemClassName}|${Math.round(dy * 100)}`;
			if (seen.has(portId)) {
				return;
			}
			seen.add(portId);
			const point = this.portPoint(node, group, dy);
			items.push({
				id: portId,
				group,
				// Relative to the node's box: the port about to be drawn on the edge its line reaches.
				// Nudged off (0, 1): x6 reads a bare number strictly between them as a fraction of the box.
				args: {x: PlannerGraphService.portUnit(point.x), y: PlannerGraphService.portUnit(point.y)},
				attrs: {portIcon: this.iconAttrs(this.itemIconUrl(itemClassName))},
			});
		};

		if (group === 'in') {
			const incoming = edges.filter(edge => edge.targetId === node.id);
			incoming.forEach((edge, index) => {
				add(edge.itemClassName, edge.targetPortDy ?? (size.height / 2 + (index - (incoming.length - 1) / 2) * FLOW_PORT_GAP * this.nodeScale()));
			});
			// An input the model lists but nothing feeds yet keeps its hover text.
			(node.inputs ?? []).forEach(io => {
				if (!incoming.some(edge => edge.itemClassName === io.item.className)) {
					add(io.item.className, size.height / 2);
				}
			});
			return items;
		}

		const byItem = new Map<string, number>();
		edges.forEach(edge => {
			if (edge.sourceId === node.id && !byItem.has(edge.itemClassName)) {
				byItem.set(edge.itemClassName, edge.sourcePortDy ?? size.height / 2);
			}
		});
		(node.outputs ?? []).forEach(io => {
			if (!byItem.has(io.item.className)) {
				byItem.set(io.item.className, size.height / 2);
			}
		});		byItem.forEach((dy, itemClassName) => add(itemClassName, dy));
		return items;
	}

	/** Relative to the node's box: the port about to be drawn on the edge its line reaches. */
	private portPoint(node: Node, group: 'in' | 'out', dy: number): GraphPoint
	{
		const size = this.nodeSizeForDraw(node);
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		const vertical = this.isVertical(direction);
		const mirrored = direction === 'right' || direction === 'up';
		// Mirrored charts run the other way: an output leaves the far edge and an input arrives at the near one.
		const atEnd = (group === 'out') !== mirrored;
		if (vertical) {
			return {x: dy, y: atEnd ? size.height : 0};
		}
		return {x: atEnd ? size.width : 0, y: dy};
	}

	/** x6's absolute port layout reads a bare number in (0, 1) as a fraction of the box; such sizes must stay pixels. */
	private static portUnit(value: number): number
	{
		if (value > 0 && value < 1) {
			return value < 0.5 ? 0 : 1;
		}
		return value;
	}

	private portIdFor(group: 'in' | 'out', edge: GraphEdge): string
	{
		const dy = (group === 'in' ? edge.targetPortDy : edge.sourcePortDy) ?? 0;
		return `${group}|${edge.itemClassName}|${Math.round(dy * 100)}`;
	}

	private itemIconUrl(itemClassName: string): string
	{		const item = this.versionManager.activeVersionData()?.searchItemByClassName(itemClassName) ?? null;
		return this.iconUrls.url(item?.icon ?? null, 64) ?? '';
	}

	private portInfo(portId: string | null): {side: 'in' | 'out'; itemClassName: string} | null
	{
		if (!portId) {
			return null;
		}
		const first = portId.indexOf('|');
		const side = portId.slice(0, first);
		if (first < 0 || (side !== 'in' && side !== 'out')) {
			return null;
		}
		// `side|itemClassName|offset`: the offset suffix is optional for ids saved before it existed.
		const second = portId.indexOf('|', first + 1);
		const itemClassName = second < 0 ? portId.slice(first + 1) : portId.slice(first + 1, second);
		return {side, itemClassName};
	}

	private portIdOf(magnet: Element | null | undefined): string | null
	{
		if (!magnet) {
			return null;
		}
		const carrier = magnet.hasAttribute('port') ? magnet : magnet.closest('[port]');
		return carrier?.getAttribute('port') ?? null;
	}

	private beginConnectGesture(sourceCell: Cell, sourceMagnet: Element): X6Edge | null
	{
		const x6Graph = this.x6Graph;
		if (!x6Graph) {
			return null;
		}
		const info = this.portInfo(this.portIdOf(sourceMagnet));
		if (info) {
			this.hideTooltip();
			this.connectGesture = {nodeId: sourceCell.id, side: info.side, itemClassName: info.itemClassName};
			this.markConnectTargets(x6Graph);
			x6Graph.container.classList.add('pg-connecting');
			this.watchConnectDrop(x6Graph);
		}
		const markers = info?.side === 'in'
			? {sourceMarker: {name: 'block', size: 7}, targetMarker: null}
			: {sourceMarker: null, targetMarker: {name: 'block', size: 7}};
		return x6Graph.createEdge({
			shape: 'edge',
			attrs: {
				line: {
					stroke: SELECTED_STROKE,
					strokeWidth: 2,
					strokeDasharray: '5 3',
					...markers,
				},
			},
			data: {tempConnect: true},
			zIndex: CONNECT_PREVIEW_Z,
		});
	}

	private isTempConnect(edge: X6Edge): boolean
	{
		return (edge.getData() as {tempConnect?: boolean} | null)?.tempConnect === true;
	}

	private markConnectTargets(x6Graph: X6Graph): void
	{
		const gesture = this.connectGesture;
		if (!gesture) {
			return;
		}
		const wantedSide = gesture.side === 'out' ? 'in' : 'out';
		this.nodeById.forEach((node, id) => {
			if (id === gesture.nodeId) {
				return;
			}
			const cell = x6Graph.getCellById(id);
			if (!cell || !cell.isNode()) {
				return;
			}
			const ios = wantedSide === 'in' ? node.inputs : node.outputs;
			const accepts = ios.some(io => io.item.className === gesture.itemClassName)
				&& !this.hasEdgeBetween(id, gesture);
			const portId = `${wantedSide}|${gesture.itemClassName}`;
			if (accepts && cell.hasPort(portId)) {
				cell.portProp(portId, 'attrs/portBody/class', 'pg-port pg-port-available');
				cell.portProp(portId, 'attrs/portIcon/class', 'pg-port pg-port-icon pg-port-available');
				this.markedPorts.push({cell, portId});
			} else {
				x6Graph.findViewByCell(cell)?.container.classList.add('pg-node-dim');
				this.dimmedNodeIds.push(id);
			}
		});
	}

	private endConnectGesture(x6Graph: X6Graph): void
	{
		this.connectGesture = null;
		this.hideCornerPreview();
		x6Graph.container.classList.remove('pg-connecting');
		this.markedPorts.forEach(({cell, portId}) => {
			// A recalculation or sync can redraw the node mid-drag and drop the port.
			if (!cell.hasPort(portId)) {
				return;
			}
			cell.portProp(portId, 'attrs/portBody/class', 'pg-port');
			cell.portProp(portId, 'attrs/portIcon/class', 'pg-port pg-port-icon');
		});
		this.markedPorts = [];
		this.dimmedNodeIds.forEach(id => {
			const cell = x6Graph.getCellById(id);
			if (cell) {
				x6Graph.findViewByCell(cell)?.container.classList.remove('pg-node-dim');
			}
		});
		this.dimmedNodeIds = [];
	}

	/** x6 has no single event for connected/dangling/cancelled drops, so settle on the next macrotask. Touch drags end in touchend, not mouseup. */
	private watchConnectDrop(x6Graph: X6Graph): void
	{
		const stop = (): void => {
			document.removeEventListener('mouseup', onMouseUp, true);
			document.removeEventListener('touchend', onTouchEnd, true);
			document.removeEventListener('touchcancel', onTouchEnd, true);
		};
		const onMouseUp = (event: MouseEvent): void => {
			stop();
			const client = {x: event.clientX, y: event.clientY};
			setTimeout(() => this.settleConnectDrop(x6Graph, client));
		};
		const onTouchEnd = (event: TouchEvent): void => {
			stop();
			const touch = event.changedTouches[0];
			const client = {x: touch?.clientX ?? 0, y: touch?.clientY ?? 0};
			setTimeout(() => this.settleConnectDrop(x6Graph, client));
		};
		document.addEventListener('mouseup', onMouseUp, true);
		document.addEventListener('touchend', onTouchEnd, true);
		document.addEventListener('touchcancel', onTouchEnd, true);
	}

	private settleConnectDrop(x6Graph: X6Graph, client: {x: number; y: number}): void
	{
		const gesture = this.connectGesture;
		this.endConnectGesture(x6Graph);
		if (this.x6Graph !== x6Graph) {
			return;
		}

		const temp = x6Graph.getEdges().find(edge => this.isTempConnect(edge));
		if (!temp || !gesture) {
			if (temp) {
				x6Graph.removeCell(temp);
			}
			return;
		}
		const targetCellId = temp.getTargetCellId();
		const targetPoint = targetCellId ? null : temp.getTargetPoint();
		x6Graph.removeCell(temp);

		if (targetCellId) {
			const request = this.edgeRequestFor(gesture, targetCellId, client);
			if (request) {
				this.actions.requestEdgeAdd(request);
			}
			return;
		}
		if (targetPoint) {
			// Drops over incompatible nodes dangle too.
			if (x6Graph.getNodesFromPoint(targetPoint.x, targetPoint.y).length > 0) {
				return;
			}
			this.actions.requestConnectToBlank({
				nodeId: gesture.nodeId,
				itemClassName: gesture.itemClassName,
				side: gesture.side === 'out' ? 'output' : 'input',
				position: {x: targetPoint.x, y: targetPoint.y},
			});
		}
	}

	private edgeRequestFor(gesture: PortConnectGesture, droppedOnId: string, client: {x: number; y: number}): GraphEdgeAddRequest | null
	{
		if (!this.nodeById.has(droppedOnId) || droppedOnId === gesture.nodeId || this.hasEdgeBetween(droppedOnId, gesture)) {
			return null;
		}
		return {
			sourceId: gesture.side === 'out' ? gesture.nodeId : droppedOnId,
			targetId: gesture.side === 'out' ? droppedOnId : gesture.nodeId,
			itemClassName: gesture.itemClassName,
			clientX: client.x,
			clientY: client.y,
		};
	}

	private hasEdgeBetween(otherNodeId: string, gesture: PortConnectGesture): boolean
	{
		const sourceId = gesture.side === 'out' ? gesture.nodeId : otherNodeId;
		const targetId = gesture.side === 'out' ? otherNodeId : gesture.nodeId;
		for (const edge of this.edgeById.values()) {
			if (edge.sourceId === sourceId && edge.targetId === targetId && edge.itemClassName === gesture.itemClassName) {
				return true;
			}
		}
		return false;
	}

	private isValidConnectTarget(targetCell: Cell | null, targetMagnet: Element | null): boolean
	{
		const gesture = this.connectGesture;
		if (!gesture || !targetCell || !targetCell.isNode() || targetCell.id === gesture.nodeId) {
			return false;
		}
		const node = this.nodeById.get(targetCell.id);
		if (!node || this.hasEdgeBetween(targetCell.id, gesture)) {
			return false;
		}
		const wantedSide = gesture.side === 'out' ? 'in' : 'out';
		const portInfo = this.portInfo(this.portIdOf(targetMagnet));
		if (portInfo) {
			return portInfo.side === wantedSide && portInfo.itemClassName === gesture.itemClassName;
		}
		const ios = wantedSide === 'in' ? node.inputs : node.outputs;
		return ios.some(io => io.item.className === gesture.itemClassName);
	}

	private addEdge(x6Graph: X6Graph, edge: GraphEdge, index: number): void
	{
		const id = `edge-${index}`;
		this.edgeById.set(id, edge);
		const sourceCell = x6Graph.getCellById(edge.sourceId);
		const targetCell = x6Graph.getCellById(edge.targetId);
		const usePorts = sourceCell?.isNode() === true && targetCell?.isNode() === true;
		const sourcePort = usePorts ? this.portIdFor('out', edge) : '';
		const targetPort = usePorts ? this.portIdFor('in', edge) : '';
		const source = sourcePort !== '' && (sourceCell as X6Node).hasPort(sourcePort)
			? {cell: edge.sourceId, port: sourcePort}
			: edge.sourceId;
		const target = targetPort !== '' && (targetCell as X6Node).hasPort(targetPort)
			? {cell: edge.targetId, port: targetPort}
			: edge.targetId;
		this.addEdgeCell(x6Graph, edge, id, source, target);
	}

	/**
	 * Flow chart connection: a dark casing under the item-coloured line and a wide transparent hit path, all
	 * three on the same route, so a line on top visibly breaks one underneath. The label is a pill pinned
	 * just before the target.
	 */
	private addEdgeCell(
		x6Graph: X6Graph,
		edge: GraphEdge,
		id: string,
		source: string | {cell: string; port: string},
		target: string | {cell: string; port: string},
	): void
	{
		const label = this.labelPillFor(edge);
		const colour = this.lineColourFor(edge.itemClassName);
		const scale = this.edgeScale();
		const lineWidth = this.flowLineWidth();
		const casingWidth = this.flowCasingWidth();
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		const fade = this.doneNodeIds.has(edge.sourceId) && this.doneNodeIds.has(edge.targetId)
			? {opacity: DONE_OPACITY}
			: {};
		// Negative pixels from the target end: the pill's near edge lands 12 px before the block.
		const distance = edge.labelDistance !== undefined && edge.labelDistance < 0
			? edge.labelDistance
			: -FLOW_LABEL_GAP;
		const vertices = edge.vertices && edge.vertices.length > 0 ? [...edge.vertices] : [];

		x6Graph.addEdge({
			id,
			zIndex: EDGE_BASE_Z,
			source,
			target,
			vertices,
			// Three paths on one route: casing under the line, wide transparent hit path on top.
			markup: [
				{tagName: 'path', selector: 'casing', groupSelector: 'lines'},
				{tagName: 'path', selector: 'line', groupSelector: 'lines'},
				{tagName: 'path', selector: 'hit', groupSelector: 'lines'},
			],
			// The layout's vertices are the route; the rounded connector turns each corner without moving it.
			router: {name: 'normal'},
			connector: {name: 'rounded', args: {radius: FLOW_BEND_RADIUS}},
			attrs: {
				// Makes x6 write the routed path into every path in the group.
				lines: {connection: true},
				casing: {
					class: EDGE_CASING_CLASS,
					fill: 'none',
					stroke: this.flowCasingColour(),
					strokeWidth: casingWidth,
					strokeLinejoin: 'round',
					pointerEvents: 'none',
					...fade,
				},
				line: {
					class: EDGE_LINE_CLASS,
					fill: 'none',
					stroke: colour,
					strokeWidth: lineWidth,
					strokeLinejoin: 'round',
					pointerEvents: 'none',
					// The mock-up has no arrowheads; the default `edge` shape would otherwise add one.
					sourceMarker: null,
					targetMarker: null,
					...fade,
				},
				hit: {
					class: EDGE_HIT_CLASS,
					fill: 'none',
					stroke: 'transparent',
					strokeWidth: FLOW_HIT_WIDTH,
					cursor: 'pointer',
				},
			},
			defaultLabel: EDGE_DEFAULT_LABEL,
			labels: [{
				markup: [
					{tagName: 'rect', selector: 'rect'},
					{tagName: 'image', selector: 'icon'},
					{tagName: 'text', selector: 'rate'},
					{tagName: 'text', selector: 'extra'},
					{tagName: 'image', selector: 'zoomedOutIcon'},
				],
				position: {distance},
				attrs: {
					icon: label.showIcon && label.iconUrl !== null
						? {
							class: EDGE_DETAIL_CLASS,
							'xlink:href': label.iconUrl,
							width: FLOW_LABEL_ICON,
							height: FLOW_LABEL_ICON,
							// Right edge on the anchor: the pill sits just before the block in every direction.
							x: this.labelAnchorX(label.width, direction) + FLOW_LABEL_PAD_X - 2,
							y: -FLOW_LABEL_ICON / 2,
							...fade,
						}
						: {'xlink:href': '', width: 0, height: 0},
					rate: {
						text: label.rate,
						class: EDGE_DETAIL_CLASS,
						fill: FLOW_LABEL_TEXT_FILL,
						fontSize: 13 * scale,
						fontWeight: 'bold',
						textAnchor: 'start',
						textVerticalAnchor: 'middle',
						x: this.labelAnchorX(label.width, direction) + label.textLeft,
						...fade,
					},
					extra: label.extra === '' ? {text: '', display: 'none'} : {
						text: label.extra,
						class: EDGE_DETAIL_CLASS,
						fill: FLOW_WARN_COLOUR,
						fontSize: 12 * scale,
						fontWeight: 'bold',
						textAnchor: 'start',
						textVerticalAnchor: 'middle',
						x: this.labelAnchorX(label.width, direction) + label.extraX,
						...fade,
					},
					zoomedOutIcon: label.showIcon && label.iconUrl !== null
						? {
							class: EDGE_ZOOMED_OUT_ICON_CLASS,
							'xlink:href': label.iconUrl,
							width: FLOW_LABEL_HEIGHT - 2 * ZOOMED_OUT_EDGE_ICON_PAD,
							height: FLOW_LABEL_HEIGHT - 2 * ZOOMED_OUT_EDGE_ICON_PAD,
							x: this.labelAnchorX(label.width, direction) + FLOW_LABEL_PAD_X,
							y: -(FLOW_LABEL_HEIGHT - 2 * ZOOMED_OUT_EDGE_ICON_PAD) / 2,
							display: 'none',
							...fade,
						}
						: {'xlink:href': '', width: 0, height: 0, display: 'none'},
					// Sized explicitly: the default rect follows the text bbox, which drifts with font metrics and load timing.
					rect: {
						class: LABEL_BOX_CLASS,
						ref: null,
						refX: null,
						refY: null,
						refWidth: null,
						refHeight: null,
						x: this.labelAnchorX(label.width, direction),
						y: -FLOW_LABEL_HEIGHT / 2,
						width: label.width,
						height: FLOW_LABEL_HEIGHT,
						fill: FLOW_LABEL_FILL,
						stroke: colour,
						strokeWidth: FLOW_LABEL_STROKE,
						rx: this.flowLabelRadius(),
						ry: this.flowLabelRadius(),
						...fade,
					},
				},
			}],
		});
	}

	/**
	 * Where the pill sits relative to the label anchor (12 px before the target port). Left-to-right charts end the
	 * pill on the anchor; right-to-left charts start it there. Up/down charts centre it on the line, the way the mock-up
	 * does, and the 12 px gap keeps it clear of the block edge.
	 */
	private labelAnchorX(width: number, direction: GraphDirection): number
	{
		if (direction === 'down' || direction === 'up') {
			return -width / 2;
		}
		return direction === 'right' ? 0 : -width;
	}

	/** Label pill contents and measured size; the rate carries the over-limit belt count in amber beside it. */
	private labelPillFor(edge: GraphEdge): {width: number; rate: string; extra: string; extraX: number; textLeft: number; iconUrl: string | null; showIcon: boolean}
	{
		const item = this.itemFor(edge);
		const scale = this.edgeScale();
		const rate = this.rateFormatter.rate(edge.amount, item);
		const count = this.overLimitCount(edge, item);
		const extra = count > 1 ? `${count} ${ConveyorCapacity.isFluid(item) ? 'pipes' : 'belts'}` : '';
		const showIcon = this.settings.graph().showEdgeItemIcons;
		const iconUrl = this.iconUrls.url(item?.icon ?? null, 64);
		const textLeft = FLOW_LABEL_PAD_X + (iconUrl !== null && showIcon ? FLOW_LABEL_ICON + FLOW_LABEL_ICON_GAP : 0);
		const rateWidth = rate.length * 7.4 * scale;
		const extraWidth = extra === '' ? 0 : extra.length * 6.9 * scale + 4 * scale;
		return {
			width: textLeft + rateWidth + extraWidth + FLOW_LABEL_PAD_X,
			rate,
			extra,
			extraX: textLeft + rateWidth,
			textLeft,
			iconUrl,
			showIcon,
		};
	}

	/** How many belts or pipes this connection needs; 1 when no limit is set. */
	private overLimitCount(edge: GraphEdge, item: Item | null): number
	{
		const limit = this.planManager.activeSettings()?.conveyorLimit;
		if (limit === undefined) {
			return 1;
		}
		const fluid = ConveyorCapacity.isFluid(item);
		return ConveyorCapacity.countNeeded(edge.amount, ConveyorCapacity.capacity(limit, fluid));
	}

	private itemFor(edge: GraphEdge): Item | null
	{
		return this.versionManager.activeVersionData()?.searchItemByClassName(edge.itemClassName) ?? null;
	}

	private beltViewEnabled(): boolean
	{
		const settings = this.planManager.activeSettings();
		return settings?.conveyorLimit !== undefined && settings.beltLayout?.beltView === true;
	}

	/** Re-labels the rendered edges in place: a limit change must not re-solve or re-lay out the graph. */
	public refreshConveyorLimits(): void
	{
		const x6Graph = this.x6Graph;
		if (!x6Graph) {
			return;
		}
		// Restoring clears the selection; keep it so the inspector stays on the node being looked at.
		if (this.renderedGraph === null) {
			return;
		}
		// The over-limit text and the ayout's label widths both read the limit, so the whole chart is redrawn.
		const selectedIds = this.selectedNodes().map(node => node.id);
		this.restore(x6Graph.container, this.renderedGraph, false);
		if (selectedIds.length > 0) {
			this.selectNodesById(selectedIds);
		}
	}

	/** Recomputes the cached belt plan for the rendered graph; the inspector reads the same map. */
	private refreshBeltPlan(graph: Graph | null): void
	{
		const settings = this.planManager.activeSettings();
		const data = this.versionManager.activeVersionData();
		if (graph === null
			|| settings?.conveyorLimit === undefined
			|| settings.beltLayout === undefined
			|| data === null) {
			this.beltPlanSignal.set(new Map());
			return;
		}
		this.beltPlanSignal.set(BeltPlanner.planGraph(graph, settings.conveyorLimit, settings.beltLayout, data));
	}

	private onSelectionChanged(x6Graph: X6Graph, selected: Cell[]): void
	{
		const selectedIds = new Set(selected.filter(cell => cell.isNode()).map(cell => cell.id));

		x6Graph.getNodes().forEach(cell => {
			const modelNode = this.nodeById.get(cell.id);
			const game = this.gameLook() && modelNode !== undefined && !(modelNode instanceof SubplanNode);
			if (selectedIds.has(cell.id)) {
				if (game) {
					// Look B has no border: the selected card itself lifts to a warm #33281f (mock-up .node.sel .card).
					// Warm card plus an orange outline: the fill alone was too close to the other cards to see.
					cell.attr('body/fill', GAME_CARD_SELECTED);
					cell.attr('body/stroke', SELECTED_STROKE);
					cell.attr('body/strokeWidth', 2);
				} else {
					cell.attr('body/stroke', SELECTED_STROKE);
					cell.attr('body/strokeWidth', SELECTED_STROKE_WIDTH);
				}
				this.scheduleZChange(cell, this.touchUsed ? SELECTED_TOUCH_Z : NODE_HIGHLIGHT_Z);
			} else if (modelNode) {
				if (game) {
					const bodyStroke = this.styleFor(modelNode).bodyStroke;
					cell.attr('body/fill', modelNode.done ? GAME_CARD_BUILT : this.baseStyleFor(modelNode).bodyFill);
					cell.attr('body/stroke', bodyStroke);
					cell.attr('body/strokeWidth', bodyStroke === 'none' ? 0 : NODE_STROKE_WIDTH);
				} else {
					cell.attr('body/stroke', this.styleFor(modelNode).bodyStroke);
					cell.attr('body/strokeWidth', NODE_STROKE_WIDTH);
				}
				this.scheduleZChange(cell, null);
			}
		});

		// The selected blocks' connections light up and the rest of the chart fades, as for a clicked line.
		this.focusedNodeIds = selectedIds;
		if (selectedIds.size > 0) {
			this.pickedEdgeIds.clear();
		}
		this.refreshConnectionFocus();
		x6Graph.getEdges().forEach(edge => this.applyEdgeStyle(edge));

		this.vertexDragAnchorId = selected.find(cell => cell.isNode())?.id ?? null;

		const selectedNodes: Node[] = [];
		selectedIds.forEach(id => {
			const modelNode = this.nodeById.get(id);
			if (modelNode) {
				selectedNodes.push(modelNode);
			}
		});
		this.selectedNodesSignal.set(selectedNodes);
	}

	private selectVerticesWithin(a: GraphPoint, b: GraphPoint): void
	{
		if (!this.x6Graph) {
			return;
		}
		const minX = Math.min(a.x, b.x);
		const maxX = Math.max(a.x, b.x);
		const minY = Math.min(a.y, b.y);
		const maxY = Math.max(a.y, b.y);

		this.selectedVertexMap.clear();
		this.x6Graph.getEdges().forEach(edge => {
			// Layout-routed lines re-route when their blocks move; only bend points placed by hand are picked up.
			if (this.edgeById.get(edge.id)?.autoRouted === true) {
				return;
			}
			const indices = edge.getVertices()
				.map((vertex, index) => vertex.x >= minX && vertex.x <= maxX && vertex.y >= minY && vertex.y <= maxY ? index : -1)
				.filter(index => index >= 0);
			if (indices.length > 0) {
				this.selectedVertexMap.set(edge.id, indices);
			}
		});
		this.renderVertexHighlights();
	}

	private clearVertexSelection(): void
	{
		this.selectedVertexMap.clear();
		this.rubberbandStart = null;
		this.vertexHighlights.forEach(circle => circle.remove());
		this.vertexHighlights = [];
	}

	private renderVertexHighlights(): void
	{
		this.vertexHighlights.forEach(circle => circle.remove());
		this.vertexHighlights = [];
		if (!this.x6Graph) {
			return;
		}
		this.selectedVertexMap.forEach((indices, edgeId) => {
			const edge = this.x6Graph!.getCellById(edgeId);
			if (!edge?.isEdge()) {
				return;
			}
			const vertices = edge.getVertices();
			indices.forEach(index => {
				const vertex = vertices[index];
				if (!vertex) {
					return;
				}
				const circle = this.createHandleCircle();
				circle.setAttribute('cx', String(vertex.x));
				circle.setAttribute('cy', String(vertex.y));
				this.x6Graph!.view.decorator.appendChild(circle);
				this.vertexHighlights.push(circle);
			});
		});
	}

	/** x6 moves all vertices of edges touching a selected node: undo that for unselected corners, and apply it to selected corners on untouched edges. */
	private applySelectionDragToVertices(dx: number, dy: number): void
	{
		if (!this.x6Graph || this.selectedVertexMap.size === 0) {
			return;
		}
		this.x6Graph.getEdges().forEach(edge => {
			const selectedIndices = new Set(this.selectedVertexMap.get(edge.id) ?? []);
			const touched = this.isEdgeTouchingSelection(edge);
			const vertices = edge.getVertices();
			let changed = false;
			vertices.forEach((vertex, index) => {
				if (touched && !selectedIndices.has(index)) {
					vertices[index] = {x: vertex.x - dx, y: vertex.y - dy};
					changed = true;
				} else if (!touched && selectedIndices.has(index)) {
					vertices[index] = {x: vertex.x + dx, y: vertex.y + dy};
					changed = true;
				}
			});
			if (changed) {
				edge.setVertices(vertices);
			}
		});
	}

	private isEdgeTouchingSelection(edge: X6Edge): boolean
	{
		const selection = this.selection;
		return selection !== null
			&& (selection.isSelected(edge.getSourceCellId()) || selection.isSelected(edge.getTargetCellId()));
	}

	private onEdgeHoverMove(e: MouseEvent): void
	{
		this.lastPointerClient = {x: e.clientX, y: e.clientY};
		if (this.tooltipAnchor && !this.tooltipAnchor.contains(e.target as Element | null)) {
			this.hideTooltip();
		}
		if (!this.hoveredEdgeView || !this.x6Graph) {
			return;
		}
		// x6 may swallow mouseleave during a press, so end the hover here. Compared by id: raising the edge re-renders its view.
		const hoveredId = this.hoveredEdgeView.cell.id;
		const under = this.x6Graph.findViewByElem(e.target as Element | null);
		if (e.buttons === 0 && under?.cell.id !== hoveredId && this.touchedEdgeId !== hoveredId) {
			this.endEdgeHover();
			return;
		}
		if (this.readOnly) {
			return;
		}
		if (!this.settings.graph().addBendPointsByClick) {
			return;
		}
		const point = this.x6Graph.clientToLocal(e.clientX, e.clientY);
		this.moveCornerPreview(this.hoveredEdgeView, point.x, point.y);
	}

	/**
	 * Bend handles only where the user works with bends: on lines they bent by hand, or everywhere when
	 * "Add bends by clicking a line" is on. A layout line keeps routing itself, so its corners get no handles.
	 */
	private showsBendHandles(edge: X6Edge): boolean
	{
		return this.settings.graph().addBendPointsByClick || this.edgeById.get(edge.id)?.autoRouted !== true;
	}

	private endEdgeHover(): void
	{
		const view = this.hoveredEdgeView;
		this.hoveredEdgeView = null;
		this.touchedEdgeId = null;
		this.hideCornerPreview();
		if (view === null) {
			return;
		}
		const edge = view.cell;
		if (edge.isEdge()) {
			edge.removeTools();
			this.applyEdgeHover(view, edge, false);
		}
	}

	private moveCornerPreview(view: EdgeView, x: number, y: number): void
	{
		if (!this.x6Graph) {
			return;
		}

		const point = view.path.closestPoint({x, y});
		const nearHandle = view.cell.getVertices()
			.some(vertex => Math.hypot(vertex.x - point.x, vertex.y - point.y) < CORNER_PREVIEW_SNAP);
		if (nearHandle) {
			this.hideCornerPreview();
			return;
		}

		if (!this.cornerPreview) {
			const circle = this.createHandleCircle();
			circle.setAttribute('opacity', '0.6');
			this.x6Graph.view.decorator.appendChild(circle);
			this.cornerPreview = circle;
		}
		this.cornerPreview.setAttribute('cx', String(point.x));
		this.cornerPreview.setAttribute('cy', String(point.y));
	}

	private hideCornerPreview(): void
	{
		this.cornerPreview?.remove();
		this.cornerPreview = null;
	}

	private createHandleCircle(): SVGCircleElement
	{
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('r', '5');
		circle.setAttribute('fill', '#1e2d3b');
		circle.setAttribute('stroke', SELECTED_STROKE);
		circle.setAttribute('stroke-width', '1.5');
		circle.style.pointerEvents = 'none';
		return circle;
	}

	/** Every connection touching the selected blocks, or the hovered connection; empty when nothing is focused. */
	private focusedEdges(): Set<GraphEdge>
	{
		const focused = new Set<GraphEdge>();
		if (this.pickedEdgeIds.size > 0) {
			this.edgeById.forEach((edge, id) => {
				if (this.pickedEdgeIds.has(id)) {
					focused.add(edge);
				}
			});
			return focused;
		}
		if (this.focusedNodeIds.size === 0) {
			return focused;
		}
		[...new Set(this.edgeById.values())].forEach(edge => {
			if (this.focusedNodeIds.has(edge.sourceId) || this.focusedNodeIds.has(edge.targetId)) {
				focused.add(edge);
			}
		});
		return focused;
	}

	/** Redraws the whole-chart focus: focused connections full strength and thicker, everything else a quarter opaque. */
	private refreshConnectionFocus(): void
	{
		const focused = this.focusedEdges();
		this.applyConnectionFocus(focused);
		this.x6Graph?.getEdges().forEach(cell => {
			const modelEdge = this.edgeById.get(cell.id);
			this.scheduleZChange(cell, modelEdge !== undefined && focused.has(modelEdge)
				? EDGE_HIGHLIGHT_Z
				: null);
		});
	}

	private applyEdgeStyle(edge: X6Edge): void
	{
		const modelEdge = this.edgeById.get(edge.id);
		const focused = modelEdge !== undefined && this.focusedEdges().has(modelEdge);
		this.applyFlowEdgeStyle(edge, modelEdge, focused);
		this.applyLabelBoxStyle(edge, focused);
	}

	/** Clicking a line lights it up and fades the rest; clicking it again, a block or the background lets go. */
	private pickEdge(edgeId: string | null): void
	{
		const again = edgeId !== null && this.pickedEdgeIds.has(edgeId);
		this.pickedEdgeIds.clear();
		if (edgeId !== null && !again) {
			this.pickedEdgeIds.add(edgeId);
			this.selection?.clean();
		}
		this.refreshConnectionFocus();
	}

	/** Hovering a line or its label shows the connection's tooltip. */
	/** No hover class: styles.scss recolours `.pg-edge-hovered` lines grey, and the item colour must stay. */
	private applyEdgeHover(view: EdgeView, edge: X6Edge, hovered: boolean): void
	{
		// Hover only shows the tooltip: lighting up the chart on every pass made everything flicker.
		if (hovered) {
			this.showEdgeTooltip(edge);
		} else {
			this.hideTooltip();
		}
		// The vertex tool positions itself off the view; nothing else is read here.
		void view;
	}

	/** "Item: rate. From X to Y", plus the belts needed when limits are shown (section 4.2 rule 10). */
	private showEdgeTooltip(edge: X6Edge): void
	{
		const modelEdge = this.edgeById.get(edge.id);
		const x6Graph = this.x6Graph;
		if (modelEdge === undefined || x6Graph === null) {
			return;
		}
		const item = this.itemFor(modelEdge);
		const source = this.nodeById.get(modelEdge.sourceId);
		const target = this.nodeById.get(modelEdge.targetId);
		const lines: string[] = [
			`${item?.name ?? modelEdge.itemClassName}: ${this.rateFormatter.rate(modelEdge.amount, item)}.`
			+ ` From ${source?.getDisplayName() ?? modelEdge.sourceId} to ${target?.getDisplayName() ?? modelEdge.targetId}`,
		];
		const count = this.overLimitCount(modelEdge, item);
		if (count > 1) {
			lines.push(`Needs ${count} ${ConveyorCapacity.isFluid(item) ? 'pipes' : 'belts'}.`);
		}
		const pointer = this.lastPointerClient;
		if (pointer !== null) {
			this.nodeTooltip.show({title: item?.name ?? modelEdge.itemClassName, lines}, pointer.x + 16, pointer.y + 12);
			this.tooltipAnchor = x6Graph.container;
		}
	}

	/** The pill carries the line's colour on its border in both states; focus only thickens it. */
	private applyLabelBoxStyle(edge: X6Edge, highlighted: boolean): void
	{
		const modelEdge = this.edgeById.get(edge.id);
		if (modelEdge === undefined || !edge.getLabelAt(0)) {
			return;
		}
		edge.prop('labels/0/attrs/rect/stroke', this.lineColourFor(modelEdge.itemClassName));
		edge.prop('labels/0/attrs/rect/strokeWidth', highlighted ? FLOW_LABEL_STROKE + 1 : FLOW_LABEL_STROKE);
		edge.prop('labels/0/attrs/rect/class', highlighted ? `${LABEL_BOX_CLASS} ${LABEL_BOX_HIGHLIGHT_CLASS}` : LABEL_BOX_CLASS);
	}

	/** Deferred a frame: re-inserting the SVG element in mouseenter makes the browser replay leave/enter, flipping z-index forever. */
	private scheduleZChange(cell: Cell, zIndex: number | null): void
	{
		this.pendingZChanges.set(cell.id, {cell, zIndex});
		if (this.zChangeScheduled) {
			return;
		}
		this.zChangeScheduled = true;
		requestAnimationFrame(() => {
			this.zChangeScheduled = false;
			const changes = [...this.pendingZChanges.values()];
			this.pendingZChanges.clear();
			if (!this.x6Graph) {
				return;
			}
			changes.forEach(({cell: changed, zIndex: z}) => z === null ? this.restoreCell(changed) : this.raiseCell(changed, z));
		});
	}

	private raiseCell(cell: Cell, zIndex: number): void
	{
		if (!this.baseZIndexById.has(cell.id)) {
			this.baseZIndexById.set(cell.id, cell.getZIndex() ?? 0);
		}
		cell.setZIndex(zIndex);
	}

	private restoreCell(cell: Cell): void
	{
		const base = this.baseZIndexById.get(cell.id);
		if (base !== undefined) {
			this.baseZIndexById.delete(cell.id);
			cell.setZIndex(base);
		}
	}

	private markTouchUsed(x6Graph: X6Graph): void
	{
		if (this.touchUsed) {
			return;
		}
		this.touchUsed = true;
		x6Graph.container.classList.add('pg-touch');
		const selected = this.selection?.cells ?? [];
		if (selected.length > 0) {
			this.onSelectionChanged(x6Graph, selected);
		}
	}

	private showEdgeTools(view: EdgeView, edge: X6Edge): void
	{
		if (this.isTempConnect(edge)) {
			return;
		}
		if (this.touchedEdgeId !== null && this.touchedEdgeId !== edge.id) {
			this.releaseTouchedEdge();
		}
		this.hoveredEdgeView = view;
		if (!this.readOnly && !edge.hasTools() && this.showsBendHandles(edge)) {
			edge.addTools([this.verticesTool()]);
		}
		this.applyEdgeHover(view, edge, true);
	}

	private hideEdgeTools(view: EdgeView, edge: X6Edge): void
	{
		if (this.isTempConnect(edge)) {
			return;
		}
		if (this.hoveredEdgeView?.cell.id === edge.id) {
			this.hoveredEdgeView = null;
		}
		edge.removeTools();
		this.applyEdgeHover(view, edge, false);
		this.hideCornerPreview();
	}

	/** Looked up again: raising the edge re-renders its view. */
	private releaseTouchedEdge(): void
	{
		const id = this.touchedEdgeId;
		this.touchedEdgeId = null;
		const cell = id === null ? null : this.x6Graph?.getCellById(id);
		const view = cell && cell.isEdge() ? this.x6Graph?.findViewByCell(cell) : null;
		if (cell && cell.isEdge() && view instanceof EdgeView) {
			this.hideEdgeTools(view, cell);
		}
	}

	private applyNodeHover(cell: Cell, hovered: boolean): void
	{
		if (this.selection?.isSelected(cell)) {
			return;
		}
		this.scheduleZChange(cell, hovered ? NODE_HIGHLIGHT_Z : null);
	}

	private onNodeContextMenu(clientX: number, clientY: number, local: GraphPoint, cell: Cell): void
	{
		const selection = this.selection;
		if (!selection) {
			return;
		}

		if (!selection.isSelected(cell)) {
			selection.reset(cell);
		}

		const nodes = selection.cells
			.map(selectedCell => this.nodeById.get(selectedCell.id))
			.filter((node): node is Node => node !== undefined);

		this.contextMenuSubject.next({clientX, clientY, local, nodes});
	}

	private onBlankContextMenu(clientX: number, clientY: number, local: GraphPoint): void
	{
		this.selection?.clean();
		this.clearVertexSelection();
		this.contextMenuSubject.next({clientX, clientY, local, nodes: []});
	}

	private onEdgeContextMenu(clientX: number, clientY: number, local: GraphPoint, cell: Cell): void
	{
		const modelEdge = this.edgeById.get(cell.id);
		if (modelEdge) {
			this.selection?.clean();
			this.clearVertexSelection();
			this.contextMenuSubject.next({clientX, clientY, local, nodes: [], edge: modelEdge});
		}
	}

	private onBlankDoubleClick(local: GraphPoint): void
	{
		if (!this.readOnly) {
			this.actions.requestNodeAdd(local);
		}
	}

	private onNodeDoubleClick(cell: Cell): void
	{
		const modelNode = this.nodeById.get(cell.id);
		if (!modelNode) {
			return;
		}
		if (modelNode instanceof SubplanNode) {
			this.actions.requestSubplanOpen(modelNode.subplanId);
		} else {
			this.selectNodeById(modelNode.id);
			// focusPanel, not openPanel: an inspector hidden behind another tab must come to the front.
			this.panelLayout.focusPanel('inspector');
		}
	}

	private isNativeContextMenuSuppressed(): boolean
	{
		return performance.now() < this.suppressNativeContextMenuUntil;
	}

	private trackNodeMoves(x6Graph: X6Graph, nodes: Node[]): void
	{
		this.nodeById.clear();
		nodes.forEach(node => this.nodeById.set(node.id, node));

		// Not node:moved: that misses nodes dragged as part of a multi-selection.
		x6Graph.on('node:change:position', ({node, current, previous}) => {
			// Undo snapshot before the model takes the first new position, so undo puts every block back.
			if (this.nodePressed && this.movedNodeIds.size === 0 && !this.readOnly && !this.vertexGestureActive) {
				this.vertexGestureActive = true;
				this.graphEditStartSubject.next();
			}
			this.movedNodeIds.add(node.id);
			if (previous && !this.dragStartPositions.has(node.id)) {
				this.dragStartPositions.set(node.id, {x: previous.x, y: previous.y});
			}
			const modelNode = this.nodeById.get(node.id);
			if (modelNode) {
				const position = node.getPosition();
				modelNode.x = position.x;
				modelNode.y = position.y;
				this.graphChangedSubject.next();
			}
			// Every node of a selection drag fires this; apply the delta once, via the anchor.
			if (node.id === this.vertexDragAnchorId && current && previous) {
				this.applySelectionDragToVertices(current.x - previous.x, current.y - previous.y);
			}
			// Lines follow the block while it moves, not only when it is dropped.
			if (this.nodePressed) {
				this.scheduleLiveReroute();
			}
		});
		// Pressing a block may start a drag: keep the corners as they are now (a drag also starts from a touch press).
		x6Graph.on('node:mousedown', () => {
			this.nodePressed = true;
			this.movedNodeIds.clear();
			this.dragStartPositions.clear();
			this.dragStartVertices.clear();
			new Set(this.edgeById.values()).forEach(edge => {
				this.dragStartVertices.set(edge, (edge.vertices ?? []).map(point => ({x: point.x, y: point.y})));
			});
		});
		// x6 notifies every selected node once the drag ends, so the first call sees them all.
		x6Graph.on('node:mouseup', () => {
			this.nodePressed = false;
		});
		x6Graph.on('node:moved', () => {
			this.nodePressed = false;
			this.endNodeDrag();
		});
	}

	/** One re-route per frame while dragging: x6 fires a position change per block per pointer move. */
	private scheduleLiveReroute(): void
	{
		if (this.liveRerouteScheduled) {
			return;
		}
		this.liveRerouteScheduled = true;
		requestAnimationFrame(() => {
			this.liveRerouteScheduled = false;
			if (this.nodePressed) {
				this.rerouteMovedLines();
			}
		});
	}

	/** The drag ended: the last route, then the split dots and a save. */
	private endNodeDrag(): void
	{
		const changed = this.rerouteMovedLines();
		this.movedNodeIds.clear();
		this.dragStartPositions.clear();
		this.dragStartVertices.clear();
		if (changed) {
			this.graphChangedSubject.next();
		}
		this.drawFlowJunctions();
	}

	/**
	 * Lines with one moved end get routed again from their corners at the start of the drag (LineRouter), so the
	 * route never drifts. Lines with both ends moved keep their shape: x6 translates their corners. Lines the user
	 * bent by hand keep their bends.
	 */
	private rerouteMovedLines(): boolean
	{
		const x6Graph = this.x6Graph;
		const movedIds = this.movedNodeIds;
		if (this.readOnly || movedIds.size === 0 || x6Graph === null) {
			return false;
		}
		const vertical = this.isVertical(this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction);
		const flip = (point: GraphPoint): GraphPoint => vertical ? {x: point.y, y: point.x} : point;
		const flipBox = (box: {x: number; y: number; width: number; height: number}): RouterBox => vertical
			? {x: box.y, y: box.x, width: box.height, height: box.width}
			: {x: box.x, y: box.y, width: box.width, height: box.height};

		const cellsByEdge = new Map<GraphEdge, X6Edge[]>();
		x6Graph.getEdges().forEach(cell => {
			const modelEdge = this.edgeById.get(cell.id);
			if (modelEdge !== undefined) {
				cellsByEdge.set(modelEdge, [...(cellsByEdge.get(modelEdge) ?? []), cell]);
			}
		});

		const boxes = new Map<string, RouterBox>();
		x6Graph.getNodes().forEach(node => boxes.set(node.id, flipBox(node.getBBox())));

		let changed = false;
		cellsByEdge.forEach((cells, edge) => {
			const sourceMoved = movedIds.has(edge.sourceId);
			if (edge.autoRouted !== true || sourceMoved === movedIds.has(edge.targetId)) {
				return;
			}
			const source = x6Graph.getCellById(edge.sourceId);
			const target = x6Graph.getCellById(edge.targetId);
			if (!(source instanceof X6Node) || !(target instanceof X6Node)) {
				return;
			}
			const sourceBox = source.getBBox();
			const targetBox = target.getBBox();
			const before = (this.dragStartVertices.get(edge) ?? edge.vertices ?? []).map(flip);
			const routed = rerouteLine({
				source: flipBox(sourceBox),
				target: flipBox(targetBox),
				sourcePortDy: edge.sourcePortDy ?? (vertical ? sourceBox.width : sourceBox.height) / 2,
				targetPortDy: edge.targetPortDy ?? (vertical ? targetBox.width : targetBox.height) / 2,
			}, before, sourceMoved, {
				labelRoom: FLOW_LABEL_GAP + this.labelPillFor(edge).width + LINE_ROUTER_PAD,
				pad: LINE_ROUTER_PAD,
				clearance: LINE_ROUTER_CLEARANCE,
				laneStep: FLOW_LANE_GAP,
				obstacles: [...boxes].filter(([id]) => id !== edge.sourceId && id !== edge.targetId).map(([, box]) => box),
			}).map(flip);
			edge.vertices = routed;
			cells.forEach(cell => cell.setVertices(routed.map(point => ({...point})), {autoRoute: true}));
			changed = true;
		});
		return changed;
	}

	private styleFor(node: Node): NodeStyle
	{
		let style = this.baseStyleFor(node);
		if (node.locked) {
			style = {...style, lock: this.lockIconUri};
		}
		const warnings = this.warningsById.get(node.id);
		if (warnings) {
			style = {
				...style,
				bodyStroke: this.gameLook() ? GAME_WARN : LOOK_C_WARN,
				inputWarning: warnings.inputs.length > 0 ? this.warningIconUri : '',
				outputWarning: warnings.outputs.length > 0 ? this.warningIconUri : '',
				capacityWarning: warnings.capacity !== null || warnings.extractors ? this.warningIconUri : '',
			};
		}
		return style;
	}

	private iconDataUri(icon: IconDefinition, color: string): string
	{
		const [width, height, , , path] = icon.icon;
		const d = Array.isArray(path) ? path.join(' ') : path;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="${color}" d="${d}"/></svg>`;
		return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
	}

	private iconAttrs(uri: string): {'xlink:href': string; display: string}
	{
		return {'xlink:href': uri, display: uri ? 'inline' : 'none'};
	}

	private subplanDisplayName(node: SubplanNode): string
	{
		const plan = this.planManager.plans().find(candidate => candidate.id === node.subplanId);
		return plan ? this.planNames.displayName(plan) : node.getDisplayName();
	}

	private recipeSloopBadges(node: Node, textShift: number, fade: {opacity?: number} = {}): Record<string, Record<string, string | number>>
	{
		if (!(node instanceof RecipeNode) || this.singleLineMachines()) {
			return {};
		}
		const url = this.sloopIconFor(node);
		if (!url) {
			return {};
		}
		const scale = this.nodeScale();
		const badges: Record<string, Record<string, string | number>> = {};
		node.groups.forEach((group, i) => {
			if (group.sloops <= 0 || i >= STAT_SLOOP_MAX_LINES) {
				return;
			}
			const lineWidth = measureTextWidth(this.groupStatLine(group), LOOK_C_DIM_FONT * scale, false);
			badges[`statSloop${i}`] = {
				'xlink:href': url,
				display: 'inline',
				x: textShift + lineWidth + STAT_SLOOP_GAP * scale,
				y: (LOOK_C_CLOCK_Y + i * LOOK_C_LINE_HEIGHT + STAT_SLOOP_CENTER_OFFSET - STAT_SLOOP_SIZE / 2) * scale,
				...fade,
			};
		});
		return badges;
	}

	private sloopIconFor(node: Node): string
	{
		if (!(node instanceof RecipeNode) || !node.groups.some(group => group.sloops > 0)) {
			return '';
		}
		const hash = this.versionManager.activeVersionData()?.iconForClassName(SpecialClasses.SomersloopItem) ?? null;
		return this.iconUrls.url(hash, 64) ?? '';
	}

	private sizeFor(node: Node): {width: number; height: number}
	{
		const base = this.baseSizeFor(node);
		const scale = this.nodeScale();
		return {width: base.width * scale, height: base.height * scale};
	}

	/** A block is drawn at the height the flow layout gave it, so its ports have room on the edge. */
	private nodeSizeForDraw(node: Node): {width: number; height: number}
	{
		const size = this.sizeFor(node);
		const laidOut = this.flowLayoutHeights.get(node.id);
		return laidOut === undefined ? size : {width: size.width, height: Math.max(size.height, laidOut)};
	}

	/** The edges about to be drawn; ports read their layout offsets from it before the cells exist. */
	private renderedEdges(): GraphEdge[]
	{
		const nodeIds = new Set(this.nodeById.keys());
		return (this.renderedGraph?.edges ?? []).filter(edge => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId));
	}

	/** A container class rather than cell attrs: attr writes re-fetch every icon, and this runs on each zoom step. */
	private applyZoomDetail(x6Graph: X6Graph): void
	{
		const enabled = this.settings.graph().simplifyWhenZoomedOut;
		const zoom = x6Graph.zoom();
		x6Graph.container.classList.toggle(ZOOMED_OUT_NODES_CLASS, enabled && zoom * this.nodeScale() < ZOOMED_OUT_SCALE);
		x6Graph.container.classList.toggle(ZOOMED_OUT_EDGES_CLASS, enabled && zoom * this.edgeScale() < ZOOMED_OUT_SCALE);
	}

	private nodeScale(): number
	{
		return this.settings.graph().nodeScale;
	}

	/** True while the setting asks for the mock-up's Look B ("Game style") blocks and lines. */
	private gameLook(): boolean
	{
		return this.settings.graph().look === 'game';
	}

	private flowLineWidth(): number
	{
		return this.gameLook() ? GAME_FLOW_LINE_WIDTH : FLOW_LINE_WIDTH;
	}

	private flowCasingWidth(): number
	{
		return this.flowLineWidth() + 5;
	}

	private flowCasingColour(): string
	{
		return this.gameLook() ? GAME_CHART_COLOUR : FLOW_CASING_COLOUR;
	}

	private flowJunctionRadius(): number
	{
		return this.flowLineWidth() + 2;
	}

	private flowLabelRadius(): number
	{
		return this.gameLook() ? GAME_FLOW_LABEL_RADIUS : FLOW_LABEL_RADIUS;
	}

	private edgeScale(): number
	{
		return this.settings.graph().edgeScale;
	}

	private singleLineMachines(): boolean
	{
		const display = this.settings.graph().machineDisplay;
		return display === 'decimal' || display === 'percent';
	}

	private baseSizeFor(node: Node): {width: number; height: number}
	{
		if (node instanceof SubplanNode) {
			return this.subplanSize(node);
		}
		if (this.gameLook()) {
			return this.gameSizeFor(node);
		}
		const content = this.cardContentFor(node);
		const recipe = node instanceof RecipeNode;
		const dimLines = content.dimLine === '' ? 0 : content.dimLine.split('\n').length;
		const extraLines = content.extraLine === '' ? 0 : content.extraLine.split('\n').length;
		const textWidth = Math.max(
			measureTextWidth(content.name, LOOK_C_NAME_FONT, true) + (content.alternate ? LOOK_C_ALT_GAP + LOOK_C_ALT_WIDTH : 0),
			(content.countIcon === '' ? 0 : LOOK_C_COUNT_ICON + LOOK_C_COUNT_ICON_GAP) + measureTextWidth(content.bigLine, LOOK_C_COUNT_FONT, true),
			...(recipe
				? [measureTextWidth('Makes ', LOOK_C_DIM_FONT, false) + measureTextWidth(content.makes, LOOK_C_MAKES_RATE_FONT, true) + measureTextWidth(content.makesUnit, LOOK_C_DIM_FONT, false)]
				: [measureTextWidth(content.bigLine, LOOK_C_COUNT_FONT, true)]),
			...content.dimLine.split('\n').map(line => measureTextWidth(line, LOOK_C_DIM_FONT, false) + STAT_SLOOP_SIZE),
			...content.extraLine.split('\n').map(line => measureTextWidth(line, LOOK_C_KIND_FONT, false)),
		);
		const textInset = content.icon === '' ? LOOK_C_TEXT_PAD_RIGHT : LOOK_C_TEXT_INSET;
		// 300 px, grown in whole steps when a long name or rate would not fit.
		const width = Math.max(LOOK_C_WIDTH, Math.ceil((textInset + textWidth + LOOK_C_TEXT_PAD_RIGHT) / LOOK_C_WIDTH_STEP) * LOOK_C_WIDTH_STEP);
		// Height to the last line the card draws, plus its padding; the flow layout may still make it taller for ports.
		const lastY = recipe
			? this.recipeMakesY(dimLines)
			: extraLines > 0 ? LOOK_C_EXTRA_Y + (extraLines - 1) * LOOK_C_LINE_HEIGHT : LOOK_C_KIND_Y;
		const height = Math.max(
			recipe ? LOOK_C_MIN_HEIGHT : LOOK_C_OTHER_MIN_HEIGHT,
			Math.ceil((lastY + LOOK_C_PAD_Y + 11) / LOOK_C_HEIGHT_STEP) * LOOK_C_HEIGHT_STEP,
		);
		return {width, height};
	}

	/**
	 * Look B's block: 256 px wide, grown in whole steps when a long name or rate would not fit. The card's first row
	 * is the band (machine count and rate), then the product icon and name, then the clocks or kind word.
	 */
	private gameSizeFor(node: Node): {width: number; height: number}
	{
		const content = this.cardContentFor(node);
		const band = this.gameBandFor(node, content);
		const recipe = node instanceof RecipeNode;
		const extraLines = content.extraLine === '' ? 0 : content.extraLine.split('\n').length;
		const measure = (text: string, font: number, bold: boolean): number => measureTextWidth(text, font, bold, GAME_FONT_FAMILY);
		const bandLeft = GAME_BAND_PAD_LEFT + (band.icon === '' ? 0 : GAME_BAND_ICON + GAME_BAND_ICON_GAP);
		const bandRight = GAME_BAND_RATE_PAD_RIGHT + measureBandTextWidth(band.value, GAME_BAND_FONT) + (band.unit === '' ? 0 : GAME_BAND_ICON_GAP + measureBandTextWidth(band.unit, GAME_BAND_FONT));
		const bandWidth = bandLeft + measureBandTextWidth(band.title, GAME_BAND_FONT) + GAME_BAND_TITLE_GAP + bandRight;
		const textInset = content.icon === '' ? GAME_TEXT_PAD_LEFT : GAME_TEXT_INSET;
		const textWidth = Math.max(
			textInset + measure(content.name, GAME_NAME_FONT, true) + (content.alternate ? GAME_ALT_GAP + GAME_ALT_WIDTH : 0) + GAME_TEXT_PAD_RIGHT,
			...(content.dimLine.split('\n').map(line => textInset + measure(line, GAME_DIM_FONT, false) + STAT_SLOOP_SIZE + GAME_TEXT_PAD_RIGHT)),
			...(content.extraLine.split('\n').map(line => textInset + measure(line, GAME_DIM_FONT, false) + GAME_TEXT_PAD_RIGHT)),
		);
		const width = Math.max(GAME_WIDTH, Math.ceil(Math.max(bandWidth, textWidth) / GAME_WIDTH_STEP) * GAME_WIDTH_STEP);
		// The band names a source's kind, and the card has no room for a second kind line, so only a recipe's clocks
		// and any extra line are drawn under the name.
		const rows = [...(recipe ? content.dimLine.split('\n').filter(line => line !== '') : []), ...(extraLines > 0 ? content.extraLine.split('\n') : [])];
		const lastY = rows.length === 0 ? GAME_NAME_Y : GAME_CLOCK_Y + (rows.length - 1) * GAME_LINE_HEIGHT;
		const height = Math.max(GAME_MIN_HEIGHT, Math.ceil((lastY + GAME_PAD_Y + 10) / GAME_HEIGHT_STEP) * GAME_HEIGHT_STEP);
		return {width, height};
	}

	/**
	 * The Look B band: a recipe block shows its machine count and the rate it makes; every other block shows its kind
	 * word and its amount. The band's colour follows the kind (orange, grey for a source, light for the product), and
	 * its text is uppercase like the mock-up's.
	 */
	private gameBandFor(node: Node, content: NodeCardContent): {icon: string; title: string; value: string; unit: string; fill: string; ink: string}
	{
		if (node instanceof RecipeNode) {
			return {icon: content.countIcon, title: content.bigLine.toUpperCase(), value: content.makes, unit: content.makesUnit, fill: GAME_BAND, ink: GAME_BAND_INK};
		}
		const kind = node instanceof MineNode ? 'Resource' : node instanceof InputNode ? 'Supplied' : content.dimLine;
		const tone = node instanceof ProductNode
			? {fill: GAME_BAND_PRODUCT, ink: GAME_BAND_INK}
			: node instanceof MineNode || node instanceof InputNode
				? {fill: GAME_BAND_SOURCE, ink: GAME_BAND_SOURCE_INK}
				: {fill: GAME_BAND, ink: GAME_BAND_INK};
		return {icon: '', title: kind.toUpperCase(), value: content.bigLine, unit: '', ...tone};
	}

	private subplanSize(node: SubplanNode): {width: number; height: number}
	{
		const textWidth = Math.max(
			this.subplanDisplayName(node).length * SUBPLAN_NAME_CHAR_WIDTH,
			this.subplanStats(node).length * SUBPLAN_STATS_CHAR_WIDTH,
		);
		const hasIoIcons = this.settings.graph().showSubplanItemIcons && (node.inputs.length > 0 || node.outputs.length > 0);
		const padding = hasIoIcons ? SUBPLAN_IO_COLUMN_WIDTH * 2 : RECIPE_TEXT_PADDING_X;
		return {
			width: Math.min(SUBPLAN_MAX_WIDTH, Math.max(GraphMetrics.SUBPLAN_NODE_WIDTH, Math.ceil(textWidth + padding))),
			height: GraphMetrics.SUBPLAN_NODE_HEIGHT,
		};
	}

	private baseStyleFor(node: Node): NodeStyle
	{
		const accent = this.accentColor(node);
		if (this.gameLook()) {
			// Look B: a plain #262626 card, no border and no type stripe; built and selection states repaint it.
			const fill = mixColour(GAME_CARD_FILL, accent, this.settings.graph().nodeFillAmount * LOOK_C_TINT_MAX);
			const icons = {lock: '', done: node.done ? this.doneIconUri : '', inputWarning: '', outputWarning: '', capacityWarning: ''};
			return {bodyFill: node.done ? GAME_CARD_BUILT : fill, bodyStroke: 'none', accent, name: node.getDisplayName(), stats: '', machines: '', ...icons};
		}
		// The fill setting tints the dark card toward the block's type colour, so 0 leaves it plain.
		const fill = mixColour(LOOK_C_FILL, accent, this.settings.graph().nodeFillAmount * LOOK_C_TINT_MAX);
		const product = node instanceof ProductNode;
		const colors = node.done
			? {bodyFill: fill, bodyStroke: LOOK_C_GOOD, accent}
			: {bodyFill: fill, bodyStroke: product ? accent : LOOK_C_BORDER, accent};
		const icons = {lock: '', done: node.done ? this.doneIconUri : '', inputWarning: '', outputWarning: '', capacityWarning: ''};
		return {...colors, name: node.getDisplayName(), stats: '', machines: '', ...icons};
	}

	private accentColor(node: Node): string
	{
		const colors = this.settings.graph().nodeAccentColors;
		if (node instanceof RecipeNode) {
			const custom = this.planManager.activePlan()?.settings.graph?.machineColors?.[node.machine.className];
			return custom ?? colors.recipe;
		}
		if (node instanceof GeneratorNode) return colors.generator;
		if (node instanceof AugmenterNode) return colors.augmenter;
		if (node instanceof SinkNode) return colors.sink;
		if (node instanceof MineNode) return colors.mine;
		if (node instanceof InputNode) return colors.input;
		if (node instanceof ProductNode) return colors.product;
		if (node instanceof ByproductNode) return colors.byproduct;
		if (node instanceof SubplanNode) return colors.subplan;
		return '#666666';
	}

	/** Delegated: x6 renders views asynchronously, so indicators may not exist yet after restore(). */
	private onWarningHover(event: MouseEvent): void
	{
		const port = (event.target as Element | null)?.closest?.('[port]');
		if (port) {
			if (!this.connectGesture) {
				this.showPortTooltip(port);
			}
			return;
		}
		const indicator = (event.target as Element | null)?.closest?.('.pn-lock, .pn-input-warning, .pn-output-warning, .pn-capacity-warning');
		if (!indicator) {
			return;
		}
		const cellId = indicator.closest('g[data-cell-id]')?.getAttribute('data-cell-id');
		const node = cellId ? this.nodeById.get(cellId) : null;
		if (!node) {
			return;
		}

		let content: NodeTooltipContent;
		if (indicator.classList.contains('pn-lock')) {
			content = this.lockTooltipFor(node);
		} else {
			const warnings = cellId ? this.warningsById.get(cellId) : null;
			if (!warnings) {
				return;
			}
			if (indicator.classList.contains('pn-capacity-warning')) {
				content = {
					title: `${node.getDisplayName()} - ${warnings.capacity === null && warnings.extractors ? 'extractors' : 'machines'}`,
					lines: [
						...(warnings.capacity !== null ? [this.capacityWarningLine(warnings.capacity)] : []),
						...(warnings.extractors ? [this.warningLine(this.extractorWarningDetail(warnings.extractors, node))] : []),
					],
				};
			} else {
				content = indicator.classList.contains('pn-input-warning')
					? {
						title: `${node.getDisplayName()} - input`,
						lines: warnings.inputs.map(warning => this.inputWarningLine(warning.itemClassName, warning.required, warning.supplied)),
					}
					: {
						title: `${node.getDisplayName()} - output`,
						lines: warnings.outputs.map(warning => this.outputWarningLine(warning.itemClassName, warning.produced, warning.consumed)),
					};
			}
			if (content.lines.length === 0) {
				return;
			}
		}
		this.showTooltip(content, indicator);
	}

	private showTooltip(content: NodeTooltipContent, anchor: Element): void
	{
		const box = anchor.getBoundingClientRect();
		this.tooltipAnchor = anchor;
		this.nodeTooltip.show(content, box.right + 8, box.top - 4);
	}

	private hideTooltip(): void
	{
		this.tooltipAnchor = null;
		this.nodeTooltip.hide();
	}

	private onWarningOut(event: MouseEvent): void
	{
		if ((event.target as Element | null)?.closest?.('.pn-lock, .pn-input-warning, .pn-output-warning, .pn-capacity-warning, [port]')) {
			this.hideTooltip();
		}
	}

	private showPortTooltip(portElement: Element): void
	{
		const info = this.portInfo(portElement.getAttribute('port'));
		const cellId = portElement.closest('g[data-cell-id]')?.getAttribute('data-cell-id');
		const node = cellId ? this.nodeById.get(cellId) : null;
		if (!info || !node) {
			return;
		}
		const item = this.versionManager.activeVersionData()?.searchItemByClassName(info.itemClassName) ?? null;
		const graph: Graph = {nodes: [...this.nodeById.values()], edges: [...new Set(this.edgeById.values())]};
		const rate = (amount: number): string => this.rateFormatter.rate(amount, item);
		const ios = info.side === 'out' ? node.outputs : node.inputs;
		const total = ios.filter(io => io.item.className === info.itemClassName).reduce((sum, io) => sum + io.maxAmount, 0);
		const open = info.side === 'out'
			? this.reconciler.spareOutput(graph, node.id, info.itemClassName)
			: this.reconciler.remainingDemand(graph, node.id, info.itemClassName);
		let line: string;
		if (open <= 1e-6) {
			line = info.side === 'out'
				? `All ${rate(total)} goes to other blocks. Drag to add another connection.`
				: `All ${rate(total)} comes from other blocks. Drag to add another connection.`;
		} else if (Math.abs(open - total) <= 1e-6) {
			line = info.side === 'out'
				? `${rate(open)} not used yet. Drag to connect it.`
				: `${rate(open)} not supplied yet. Drag to connect it.`;
		} else {
			line = info.side === 'out'
				? `${rate(open)} of ${rate(total)} not used yet. Drag to connect it.`
				: `${rate(open)} of ${rate(total)} not supplied yet. Drag to connect it.`;
		}
		this.showTooltip({title: item?.name ?? info.itemClassName, lines: [line]}, portElement);
	}

	private lockTooltipFor(node: Node): NodeTooltipContent
	{
		if (node instanceof SubplanNode) {
			return {
				title: `${node.getDisplayName()} - locked`,
				lines: [
					'Subplans are always locked. The calculation never changes what is inside.',
					...(node.buildCount > 1
						? [`Built ${node.buildCount} times here.`]
						: []),
					'Double-click to open it.',
				],
			};
		}
		return {
			title: `${node.getDisplayName()} - locked`,
			lines: [
				'The calculation will not change this block.',
				'Unlock it from the right-click menu or Block details.',
			],
		};
	}

	private warningLine(detail: GraphWarningDetail): string
	{
		return `${detail.title} - ${detail.text}`;
	}

	private inputWarningLine(itemClassName: string, required: number, supplied: number): string
	{
		return this.warningLine(this.inputWarningDetail(itemClassName, required, supplied));
	}

	private capacityWarningLine(warning: GraphNodeCapacityWarning): string
	{
		return this.warningLine(this.capacityWarningDetail(warning));
	}

	private outputWarningLine(itemClassName: string, produced: number, consumed: number): string
	{
		return this.warningLine(this.outputWarningDetail(itemClassName, produced, consumed));
	}

	private inputWarningDetail(itemClassName: string, required: number, supplied: number): GraphWarningDetail
	{
		const item = this.warningItem(itemClassName);
		return {
			kind: 'input',
			iconHash: item?.icon ?? null,
			title: item?.name ?? itemClassName,
			text: `needs ${this.rateFormatter.rate(required, item)}, receiving ${this.rateFormatter.rate(supplied, item)}`,
		};
	}

	/** Clock precision, so a 0.0001% shortfall doesn't read as 100%. */
	private capacityWarningDetail(warning: GraphNodeCapacityWarning): GraphWarningDetail
	{
		return {
			kind: 'capacity',
			iconHash: null,
			title: 'Machines',
			text: `the target needs ${this.rateFormatter.clock(warning.target / warning.capacity * 100)}% of what the `
				+ 'machines can do',
		};
	}

	private extractorWarningDetail(warning: GraphNodeExtractorWarning, node: Node): GraphWarningDetail
	{
		const item = node instanceof MineNode ? node.item : null;
		return {
			kind: 'extractors',
			iconHash: item?.icon ?? null,
			title: 'Extractors',
			text: `give ${this.rateFormatter.rate(warning.capacity, item)}, `
				+ `plan needs ${this.rateFormatter.rate(warning.needed, item)}`,
		};
	}

	private outputWarningDetail(itemClassName: string, produced: number, consumed: number): GraphWarningDetail
	{
		const item = this.warningItem(itemClassName);
		const shared = {iconHash: item?.icon ?? null, title: item?.name ?? itemClassName};
		if (produced > consumed) {
			return {...shared, kind: 'surplus', text: `${this.rateFormatter.rate(produced - consumed, item)} not used`};
		}
		return {
			...shared,
			kind: 'output',
			text: `sending ${this.rateFormatter.rate(consumed, item)}, producing only ${this.rateFormatter.rate(produced, item)}`,
		};
	}

	private warningItem(itemClassName: string): Item | null
	{
		return this.versionManager.activeVersionData()?.searchItemByClassName(itemClassName) ?? null;
	}

	private generatorStats(node: GeneratorNode): string
	{
		const clock = node.clockSpeed === 100 ? '' : ` @ ${this.rateFormatter.clock(node.clockSpeed)}%`;
		return `${this.rateFormatter.amount(node.amount)}×${clock} (${node.fuel.item.name}) - ${this.rateFormatter.power(node.powerProduction())}`;
	}

	private augmenterStats(node: AugmenterNode): string
	{
		const extra = node.extraPower();
		const boosted = node.boosted > 0 ? ` (${this.rateFormatter.amount(node.boosted)} boosted)` : '';
		return `${this.rateFormatter.amount(node.amount)}×${boosted} - `
			+ `+${this.rateFormatter.power(extra.flatBonus)} and +${this.rateFormatter.percent(extra.multiplier - 1)}`;
	}

	private ioStats(role: string, amount: number, item: Item): string
	{
		return `${role}, ${this.rateFormatter.rate(amount, item)}`;
	}

	private mineStats(node: MineNode): string
	{
		const lines = [this.ioStats('Resource', node.amount, node.item)];
		const extractors = this.extractorStats(node);
		if (extractors !== null) {
			lines.push(extractors);
		}
		return lines.join('\n');
	}

	private extractorStats(node: MineNode): string | null
	{
		const rows = node.extractors;
		if (rows === null || rows.length === 0) {
			return null;
		}
		const data = this.versionManager.activeVersionData();
		const capacity = data ? ExtractorCapacity.capacity(rows, data, node.item, this.extractorBeltCap(node.item)) : 0;
		const count = ExtractorCapacity.buildings(rows);
		return `${this.rateFormatter.amount(count)} extractor${count === 1 ? '' : 's'}, `
			+ `cap ${this.rateFormatter.rate(capacity, node.item)}`;
	}

	private subplanStats(node: SubplanNode): string
	{
		const built = node.buildCount > 1 ? `built ${node.buildCount}× - ` : '';
		if (node.inputs.length === 0 && node.outputs.length === 0) {
			return `Subplan - ${built}empty`;
		}
		return `Subplan - ${built}${node.inputs.length} in, ${node.outputs.length} out`;
	}

	private machinesLine(node: RecipeNode): string
	{
		switch (this.settings.graph().machineDisplay) {
			case 'decimal': {
				const clock = this.recipeClockFor(node) ?? node.groups[0]?.clockSpeed ?? 100;
				const machines = clock > 0 ? node.target * 100 / clock : node.target;
				return `${this.rateFormatter.machineCount(machines)}× ${node.machine.name} @ ${this.rateFormatter.clock(clock)}%`;
			}
			case 'percent':
				// target is in machines at 100% clock.
				return `${this.rateFormatter.clock(node.target * 100)}% ${node.machine.name}`;
			case 'groups-only':
				return node.machine.name;
			default:
				return `${Math.ceil(node.amount - 1e-9)}× ${node.machine.name}`;
		}
	}

	private recipeClockFor(node: RecipeNode): number | null
	{
		const settings = this.planManager.activePlan()?.settings;
		if (!settings) {
			return null;
		}
		return settings.recipeClockSpeeds?.find(entry => entry.recipeClassName === node.recipe.className)?.clockSpeed
			?? settings.machineClockSpeeds?.find(entry => entry.machineClassName === node.machine.className)?.clockSpeed
			?? settings.defaultClockSpeed
			?? 100;
	}

	/** Where "Makes …" sits: just under the last clock line, or the plain row when the clocks are hidden. */
	private recipeMakesY(dimLines: number): number
	{
		return dimLines === 0
			? LOOK_C_MAKES_Y
			: LOOK_C_CLOCK_Y + (dimLines - 1) * LOOK_C_CLOCK_STEP + LOOK_C_LINE_GAP;
	}

	private recipeStats(node: RecipeNode): string
	{
		if (this.singleLineMachines()) {
			return '';
		}
		const oneLine = node.groups.map(group => this.groupStatLine(group)).join(' + ');
		// Only a line longer than the card's default text column wraps, onto at most one more row.
		const available = LOOK_C_WIDTH - LOOK_C_TEXT_INSET - LOOK_C_TEXT_PAD_RIGHT;
		if (node.groups.length < 2 || measureTextWidth(oneLine, LOOK_C_DIM_FONT, false) <= available) {
			return oneLine;
		}
		let first = this.groupStatLine(node.groups[0]);
		let index = 1;
		while (index < node.groups.length) {
			const next = `${first} + ${this.groupStatLine(node.groups[index])}`;
			if (measureTextWidth(next, LOOK_C_DIM_FONT, false) > available) {
				break;
			}
			first = next;
			index++;
		}
		return index >= node.groups.length ? oneLine : `${first}\n${node.groups.slice(index).map(group => this.groupStatLine(group)).join(' + ')}`;
	}

	/** The somersloop icon is drawn separately (recipeSloopBadges). */
	private groupStatLine(group: MachineGroup): string
	{
		const sloops = group.sloops > 0 ? ` +${group.sloops}` : '';
		return `${this.rateFormatter.machineCount(group.machines)} at ${this.cardClock(group.clockSpeed)}%${sloops}`;
	}

	/** The card's clock wording: at most 2 decimals, trailing zeros dropped. Local to the block, not shared. */
	private cardClock(clockSpeed: number): string
	{
		const text = clockSpeed.toFixed(2);
		if (!text.includes('.')) {
			return text;
		}
		let end = text.length;
		while (text[end - 1] === '0') {
			end--;
		}
		if (text[end - 1] === '.') {
			end--;
		}
		return text.slice(0, end);
	}

	private sinkPointsLine(node: SinkNode): string
	{
		return `${this.rateFormatter.amount(node.sinkPoints())} points/min`;
	}

	private sinkStats(node: SinkNode): string
	{
		return `${this.rateFormatter.rate(node.amount, node.item)} ${node.item.name}`;
	}

}
