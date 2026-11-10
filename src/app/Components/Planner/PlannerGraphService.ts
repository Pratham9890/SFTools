import {Injectable, OnDestroy, Signal, signal, untracked} from '@angular/core';
import {faCircleCheck, faLock, faTriangleExclamation, IconDefinition} from '@fortawesome/free-solid-svg-icons';
import {Cell, Edge as X6Edge, EdgeToolNativeItem, EdgeView, Export, Graph as X6Graph, Node as X6Node, Selection} from '@antv/x6';
import type {Metadata as PortsMetadata, PortMetadata} from '@antv/x6/lib/model/port';
import type {Handle as VertexHandle} from '@antv/x6/lib/registry/tool/vertices';
import ELK from 'elkjs/lib/elk.bundled.js';
import type {ElkExtendedEdge, ElkNode} from 'elkjs';
import {GraphPoint} from '@src/Model/Planner/Graph/GraphPoint';
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
import {BeltGraphPlan, BeltPlanner, EdgeBeltPlan} from '@src/Model/Planner/BeltPlanner';
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
import {NodeFillResolver} from '@src/Model/Settings/NodeFillResolver';
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
const NODE_HEIGHT = GraphMetrics.NODE_HEIGHT;

const LABEL_CHAR_WIDTH = 7.4;
const LABEL_NAME_CHAR_WIDTH = 7.9;
const LABEL_PADDING_X = 20;
const LABEL_HEIGHT = 46;
const LABEL_FONT_SIZE = 13;
const LABEL_NAME_FONT_SIZE = 14;
const LABEL_NAME_Y = -9;
const LABEL_RATE_Y = 11;
// Each connection label gets its own layout column as wide as its widest label, so long names wrap to keep columns narrow.
const LABEL_NAME_WRAP_WIDTH = 102;
const LABEL_NAME_LINE_HEIGHT = 17;

const EDGE_ICON_SIZE = 24;
const EDGE_ICON_GAP = 4;
const NODE_ICON_SIZE = 30;
const LEFT_ICON_SIZE = 40;
const LEFT_ICON_X = 12;
const TEXT_LEFT_INSET = LEFT_ICON_X + LEFT_ICON_SIZE + 6;
const TEXT_RIGHT_PAD = 16;
const TEXT_SHIFT = (TEXT_LEFT_INSET - TEXT_RIGHT_PAD) / 2;
const SLOOP_GLOW_COLOR = '#c56cf0';
const LOCK_ICON_SIZE = 18;
const SLOOP_ICON_SIZE = 20;
const CORNER_INSET = 5;
const DONE_OPACITY = 0.4;
const DONE_ICON_SIZE = 20;
const DONE_FILL = '#1b212a';
const DONE_STROKE = '#525e6c';
const LOCK_ROW2_Y = CORNER_INSET + SLOOP_ICON_SIZE + 3;
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
const NODE_NAME_TEXT = '#ffffff';
const NODE_DETAIL_TEXT = '#eef2f8';
const NODE_STATS_TEXT = '#d6dfea';
// Swapped in on fills too light for white text, such as solid yellow.
const NODE_DARK_NAME_TEXT = '#0b1520';
const NODE_DARK_DETAIL_TEXT = '#142130';
const NODE_DARK_STATS_TEXT = '#22303f';
const NODE_FONT_SIZE = 13;
const NODE_NAME_FONT_SIZE = 14;
const NODE_NAME_CHAR_WIDTH = 8.75;
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

const RECIPE_NAME_Y = 18;
const RECIPE_NAME_FONT_SIZE = 16;
const RECIPE_MACHINES_Y = 38;
const RECIPE_STATS_Y = 50;
const RECIPE_STATS_LINE_HEIGHT = 17;
const RECIPE_BOTTOM_PADDING = 10;
const RECIPE_MAX_WIDTH = 360;
const RECIPE_NAME_CHAR_WIDTH = 9.8;
const RECIPE_BOLD_CHAR_WIDTH = 8.1;
const RECIPE_STATS_CHAR_WIDTH = 7.4;
const RECIPE_TEXT_PADDING_X = 30;
const STAT_SLOOP_SIZE = 12;
// Negative: the somersloop icon has ~25% transparent padding per side.
const STAT_SLOOP_GAP = -1;
const STAT_SLOOP_MAX_LINES = 8;
// Measured from the rendered text box.
const STAT_SLOOP_CENTER_OFFSET = 5.5;
const CORNER_PREVIEW_SNAP = 10;
const EDGE_STROKE = '#5c718a';
const EDGE_STROKE_WIDTH = 1.5;
// Amber like the status bar's warnings: a dark-canvas constant, readable in both themes.
const EDGE_OVER_LIMIT_STROKE = '#e0b56a';
const PARALLEL_EDGE_GAP = 40;
// Belt view: one line per belt, spaced wide enough for each line's own rate label to fit between neighbours.
const BELT_LINE_GAP = 26;
// Perpendicular label offset: with the 14px name font the baseline then sits ~8px above the line.
const BELT_LABEL_OFFSET = 13;
// Room beyond the outermost belt line, which itself sits (belts - 1) / 2 gaps from the node centre.
const BELT_NODE_PADDING = 20;
const BELT_DASH = '6 4';
const SELECTED_STROKE = '#f0ad4e';
const EXPORT_MARGIN = 40;
// Fitting a plan with one or a few nodes would otherwise blow them up to fill the canvas.
const FIT_MAX_SCALE = 1;
const EXPORT_SAMPLE_MARGIN = 12;
const SELECTED_STROKE_WIDTH = 3;
const SELECTED_EDGE_STROKE_WIDTH = 2.5;
// Hover styles live in styles.scss; the highlight class opts an edge out of the hover look.
const EDGE_LINE_CLASS = 'pg-edge-line';
const EDGE_HOVER_CLASS = 'pg-edge-hovered';
const EDGE_HIGHLIGHT_CLASS = 'pg-edge-highlighted';
const LABEL_BOX_CLASS = 'pg-label-box';
const LABEL_BOX_HIGHLIGHT_CLASS = 'pg-label-box-highlighted';
// Pill, darker than the canvas, edge-coloured outline: nodes are lighter than the canvas with square-ish corners.
const LABEL_BOX_FILL = '#08111c';
const LABEL_BOX_STROKE = EDGE_STROKE;
const LABEL_BOX_PILL_PAD = 6;
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

function registerPlannerShapes(scale: number): void
{
	const px = (value: number): number => value * scale;

	const statSloopAttrs: Record<string, object> = {};
	for (let i = 0; i < STAT_SLOOP_MAX_LINES; i++) {
		statSloopAttrs[`statSloop${i}`] = {refX: 0.5, refY: 0, width: px(STAT_SLOOP_SIZE), height: px(STAT_SLOOP_SIZE)};
	}

	X6Graph.registerNode('planner-node', {
		inherit: 'rect',
		markup: [
			{tagName: 'rect', selector: 'body', className: 'pn-body'},
			{tagName: 'rect', selector: 'claimBar', className: 'pn-claim'},
			{tagName: 'text', selector: 'name', className: 'pn-detail'},
			{tagName: 'text', selector: 'machines', className: 'pn-detail'},
			{tagName: 'text', selector: 'stats', className: 'pn-detail'},
			{tagName: 'text', selector: 'zoomedOutName', className: 'pn-zoomed-out-name'},
			...statSloopMarkup,
			{tagName: 'image', selector: 'machineIcon', className: 'pn-machine'},
			{tagName: 'image', selector: 'sloop', className: 'pn-sloop'},
			{tagName: 'image', selector: 'lock', className: 'pn-lock'},
			{tagName: 'image', selector: 'done', className: 'pn-done'},
			{tagName: 'image', selector: 'inputWarning', className: 'pn-input-warning'},
			{tagName: 'image', selector: 'outputWarning', className: 'pn-output-warning'},
			{tagName: 'image', selector: 'capacityWarning', className: 'pn-capacity-warning'},
		],
		attrs: {
			// Restates x6's inherited rect defaults (white body, black text), which match by element name.
			rect: {fill: NODE_FALLBACK_FILL, stroke: NODE_FALLBACK_STROKE, strokeWidth: NODE_STROKE_WIDTH, rx: 5, ry: 5},
			text: {fill: NODE_FALLBACK_TEXT},
			body: {refWidth: '100%', refHeight: '100%', fill: NODE_FALLBACK_FILL, stroke: NODE_FALLBACK_STROKE, strokeWidth: NODE_STROKE_WIDTH, rx: 5, ry: 5},
			claimBar: {x: 0, y: 0, refHeight: '100%', width: px(CLAIM_BAR_WIDTH), fill: '', display: 'none', rx: px(3), ry: px(3), pointerEvents: 'none'},
			...statSloopAttrs,
			machineIcon: {
				refX: 0,
				x: px(CORNER_INSET),
				refY: 0,
				y: px(CORNER_INSET),
				width: px(NODE_ICON_SIZE),
				height: px(NODE_ICON_SIZE),
			},
			// refDx offsets from the right edge (refX: 1 would be an absolute 1px).
			sloop: {
				refDx: -px(SLOOP_ICON_SIZE + CORNER_INSET),
				refY: 0,
				y: px(CORNER_INSET),
				width: px(SLOOP_ICON_SIZE),
				height: px(SLOOP_ICON_SIZE),
				cursor: 'help',
			},
			lock: {
				refDx: -px(LOCK_ICON_SIZE + CORNER_INSET),
				refY: 0,
				y: px(CORNER_INSET),
				width: px(LOCK_ICON_SIZE),
				height: px(LOCK_ICON_SIZE),
				cursor: 'help',
			},
			done: {
				refDx: -px(DONE_ICON_SIZE + CORNER_INSET),
				refDy: -px(DONE_ICON_SIZE + CORNER_INSET),
				width: px(DONE_ICON_SIZE),
				height: px(DONE_ICON_SIZE),
			},
			inputWarning: {
				refX: 0,
				x: px(CORNER_INSET),
				refY: 0.5,
				y: -px(WARNING_ICON_SIZE / 2),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			outputWarning: {
				refDx: -px(WARNING_ICON_SIZE + CORNER_INSET),
				refY: 0.5,
				y: -px(WARNING_ICON_SIZE / 2),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			capacityWarning: {
				refDx: -px(WARNING_ICON_SIZE + CORNER_INSET),
				refDy: -px(WARNING_ICON_SIZE + CORNER_INSET),
				width: px(WARNING_ICON_SIZE),
				height: px(WARNING_ICON_SIZE),
				cursor: 'help',
			},
			name: {
				refX: 0.5,
				refY: '38%',
				textAnchor: 'middle',
				textVerticalAnchor: 'middle',
				fontWeight: 'bold',
				fontSize: px(NODE_NAME_FONT_SIZE),
				fill: NODE_NAME_TEXT,
			},
			machines: {
				refX: 0.5,
				refY: px(RECIPE_MACHINES_Y),
				textAnchor: 'middle',
				textVerticalAnchor: 'middle',
				fontWeight: 'bold',
				fontSize: px(NODE_FONT_SIZE),
				fill: NODE_DETAIL_TEXT,
			},
			stats: {
				refX: 0.5,
				refY: '72%',
				textAnchor: 'middle',
				textVerticalAnchor: 'middle',
				fontSize: px(NODE_FONT_SIZE),
				fill: NODE_STATS_TEXT,
			},
			zoomedOutName: {refX: 0.5, refY: 0.5, textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fill: NODE_NAME_TEXT, display: 'none'},
		},
	}, true);

	const subplanIoAttrs: Record<string, object> = {};
	for (let i = 0; i < SUBPLAN_IO_MAX; i++) {
		const y = px(SUBPLAN_IO_TOP + i * SUBPLAN_IO_ROW_H);
		subplanIoAttrs[`in${i}`] = {refX: 0, x: px(10), refY: 0, y, width: px(SUBPLAN_IO_ICON), height: px(SUBPLAN_IO_ICON)};
		subplanIoAttrs[`out${i}`] = {refDx: -px(SUBPLAN_IO_ICON + 10), refY: 0, y, width: px(SUBPLAN_IO_ICON), height: px(SUBPLAN_IO_ICON)};
	}

	X6Graph.registerNode('planner-subplan-node', {
		inherit: 'rect',
		markup: [
			{tagName: 'rect', selector: 'body', className: 'pn-body'},
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
			rect: {fill: NODE_FALLBACK_FILL, stroke: NODE_FALLBACK_STROKE, strokeWidth: NODE_STROKE_WIDTH, rx: 5, ry: 5},
			text: {fill: NODE_FALLBACK_TEXT},
			body: {refWidth: '100%', refHeight: '100%', fill: NODE_FALLBACK_FILL, stroke: NODE_FALLBACK_STROKE, strokeWidth: NODE_STROKE_WIDTH, rx: 5, ry: 5},
			claimBar: {x: 0, y: 0, refHeight: '100%', width: px(CLAIM_BAR_WIDTH), fill: '', display: 'none', rx: px(3), ry: px(3), pointerEvents: 'none'},
			name: {refX: 0.5, refY: 0.5, y: px(-10), textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fontSize: px(SUBPLAN_NAME_FONT_SIZE), fill: NODE_NAME_TEXT},
			stats: {refX: 0.5, refY: 0.5, y: px(12), textAnchor: 'middle', textVerticalAnchor: 'middle', fontSize: px(13), fill: NODE_STATS_TEXT},
			zoomedOutName: {refX: 0.5, refY: 0.5, textAnchor: 'middle', textVerticalAnchor: 'middle', fontWeight: 'bold', fill: NODE_NAME_TEXT, display: 'none'},
			...subplanIoAttrs,
			inMore: {refX: 0, x: px(10), refY: 0, y: px(SUBPLAN_MORE_Y), textAnchor: 'start', textVerticalAnchor: 'middle', fontSize: px(11), fill: NODE_STATS_TEXT},
			outMore: {refDx: px(-10), refY: 0, y: px(SUBPLAN_MORE_Y), textAnchor: 'end', textVerticalAnchor: 'middle', fontSize: px(11), fill: NODE_STATS_TEXT},
			lock: {refDx: -px(LOCK_ICON_SIZE + CORNER_INSET), refY: 0, y: px(CORNER_INSET), width: px(LOCK_ICON_SIZE), height: px(LOCK_ICON_SIZE), cursor: 'help'},
			done: {refDx: -px(DONE_ICON_SIZE + CORNER_INSET), refDy: -px(DONE_ICON_SIZE + CORNER_INSET), width: px(DONE_ICON_SIZE), height: px(DONE_ICON_SIZE)},
		},
	}, true);
}

registerPlannerShapes(1);

/** Icon fields are data URIs; '' hides the icon. */
interface NodeStyle {
	bodyFill: string;
	bodyStroke: string;
	darkText: boolean;
	name: string;
	machines: string;
	stats: string;
	lock: string;
	done: string;
	inputWarning: string;
	outputWarning: string;
	capacityWarning: string;
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
	private readonly nodeById = new Map<string, Node>();
	private doneNodeIds = new Set<string>();
	private claimMarkers: ReadonlyMap<string, {color: string; label: string}> = new Map();
	private readonly edgeById = new Map<string, GraphEdge>();
	private readonly baseZIndexById = new Map<string, number>();
	private readonly pendingZChanges = new Map<string, {cell: Cell; zIndex: number | null}>();
	private zChangeScheduled = false;
	private parallelOffsets = new Map<GraphEdge, GraphPoint>();
	private renderedGraph: Graph | null = null;
	private renderedBeltView = false;

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
		await this.layout(response.nodes, edges, settings);
		const graph: Graph = {nodes: response.nodes, edges};
		this.restore(container, graph);
		return graph;
	}

	public async layout(nodes: Node[], edges: GraphEdge[], layoutSettings?: GraphLayoutSettings): Promise<void>
	{
		if (nodes.length === 0) {
			return;
		}
		// Belt view grows nodes to hold their per-belt lines, so their size must be known before ELK lays out.
		if (this.beltViewEnabled()) {
			this.refreshBeltPlan({nodes, edges});
		}
		const settings = this.graphLayout.resolve(layoutSettings);

		const nodeIds = new Set(nodes.map(node => node.id));
		const layoutEdges = edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

		const elkEdges: ElkExtendedEdge[] = layoutEdges.map((e, i) => {
			const label = this.labelTextFor(e);
			const size = this.labelSizeFor(label);
			return {
				id: `e${i}`,
				sources: [e.sourceId],
				targets: [e.targetId],
				labels: [{
					id: `e${i}-label`,
					text: `${label.name}\n${label.rate}`,
					width: size.width,
					height: size.height,
					layoutOptions: {'elk.edgeLabels.inline': 'true'},
				}],
			};
		});

		const elkGraph: ElkNode = {
			id: 'root',
			layoutOptions: {
				'elk.algorithm': 'layered',
				'elk.direction': ({left: 'RIGHT', down: 'DOWN', right: 'LEFT', up: 'UP'} as const)[settings.direction] ?? 'RIGHT',
				'elk.edgeRouting': 'POLYLINE',
				'elk.spacing.edgeLabel': '10',
				'elk.spacing.nodeNode': String(settings.nodeSpacing),
				'elk.layered.spacing.nodeNodeBetweenLayers': String(settings.layerSpacing),
				'elk.layered.spacing.edgeNodeBetweenLayers': '4',
				// The polyline router widens each gap in proportion to this, times how far lines travel sideways; top-to-bottom graphs are wide.
				'elk.layered.spacing.edgeEdgeBetweenLayers': settings.direction === 'down' || settings.direction === 'up' ? '2' : '4',
			},
			children: nodes.map(node => ({
				id: node.id,
				...this.sizeFor(node),
			})),
			edges: elkEdges,
		};

		const elk = new ELK();
		const laid = await elk.layout(elkGraph);

		const posMap = new Map<string, {x: number; y: number}>();
		(laid.children ?? []).forEach(laidNode => {
			posMap.set(laidNode.id!, {x: laidNode.x ?? 0, y: laidNode.y ?? 0});
		});

		nodes.forEach((node, i) => {
			const pos = posMap.get(node.id) ?? {x: i * (NODE_WIDTH + 60), y: 0};
			node.x = pos.x;
			node.y = pos.y;
		});

		const laidEdgeById = new Map((laid.edges ?? []).map(laidEdge => [laidEdge.id, laidEdge]));
		layoutEdges.forEach((edge, i) => {
			const laidEdge = laidEdgeById.get(`e${i}`);
			if (laidEdge) {
				edge.vertices = settings.edgeShape === 'straight' ? [] : this.elkEdgeVertices(laidEdge);
				edge.autoRouted = settings.edgeShape !== 'straight';
				edge.labelDistance = this.elkLabelDistance(laidEdge);
			}
		});
	}

	public restore(container: HTMLElement, graph: Graph, fit = true): void
	{
		const previous = this.x6Graph && !fit
			? {zoom: this.x6Graph.zoom(), translate: this.x6Graph.translate()}
			: null;

		this.warningsById = this.reconciler.computeWarnings(graph);
		this.addExtractorWarnings(this.warningsById, graph);
		const x6Graph = this.createGraph(container);
		this.renderedGraph = graph;
		this.refreshBeltPlan(graph);
		this.renderedBeltView = this.beltViewEnabled();

		// Before addEdge, so edges between done nodes fade too.
		this.doneNodeIds = new Set(graph.nodes.filter(node => node.done).map(node => node.id));
		this.parallelOffsets = this.computeParallelOffsets(graph);

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
		if (this.readOnly || !edge.vertices || edge.vertices.length === 0) {
			return;
		}
		// Snapshot first, like a drag: the model edge still holds the pre-change vertices.
		this.graphEditStartSubject.next();
		// One snapshot for the whole change; the per-line handler below must not take one for each belt edge.
		this.vertexGestureActive = true;
		edge.vertices = [];
		edge.autoRouted = false;
		const x6Graph = this.x6Graph;
		x6Graph?.getEdges().forEach(cell => {
			if (this.edgeById.get(cell.id) === edge) {
				cell.setVertices([]);
			}
		});
		this.graphChangedSubject.next();
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
			throw new Error('The graph could not be exported.');
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
		svg.querySelectorAll('.x6-node-selected rect.pn-body').forEach(body => {
			const cellId = body.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '';
			const modelNode = this.nodeById.get(cellId);
			body.setAttribute('stroke', modelNode ? this.styleFor(modelNode).bodyStroke : NODE_FALLBACK_STROKE);
			body.setAttribute('stroke-width', String(NODE_STROKE_WIDTH));
		});
		const clonedMarkers = new Set<string>();
		svg.querySelectorAll(`path.${EDGE_HIGHLIGHT_CLASS}`).forEach(line => {
			const cellId = line.closest('[data-cell-id]')?.getAttribute('data-cell-id') ?? '';
			const stroke = this.edgeStrokeForCell(cellId, this.edgeById.get(cellId));
			line.setAttribute('stroke', stroke);
			line.setAttribute('stroke-width', String(EDGE_STROKE_WIDTH));
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
			box.setAttribute('stroke', LABEL_BOX_STROKE);
			box.setAttribute('stroke-width', String(LABEL_BOX_STROKE_WIDTH));
			box.setAttribute('class', LABEL_BOX_CLASS);
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
		this.touchGestures?.detach();
		this.touchGestures = null;
		this.x6Graph?.dispose();

		const x6Graph = new X6Graph({
			container,
			autoResize: true,
			panning: true,
			mousewheel: true,
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
		});
		x6Graph.on('node:click', () => this.releaseTouchedEdge());
		x6Graph.on('blank:click', () => this.releaseTouchedEdge());
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

		const style = this.styleFor(node);
		const size = this.sizeFor(node);
		const sloopIcon = this.sloopIconFor(node);
		const sloopGlow = sloopIcon !== '' && this.settings.graph().sloopGlow;
		const cornerSloop = sloopIcon !== '' && this.settings.graph().showSloopCornerIcon ? sloopIcon : '';
		const textShift = this.textShiftFor(node);
		const scale = this.nodeScale();
		const labelOffset = node instanceof RecipeNode || node instanceof SinkNode
			? this.labelBlockOffset(style.stats, size.height)
			: 0;
		const recipeLabelAttrs = node instanceof RecipeNode || node instanceof SinkNode
			? {
				name: {refY: RECIPE_NAME_Y * scale + labelOffset, fontSize: RECIPE_NAME_FONT_SIZE * scale},
				machines: {refY: RECIPE_MACHINES_Y * scale + labelOffset},
				stats: {
					refY: RECIPE_STATS_Y * scale + labelOffset,
					textVerticalAnchor: 'top',
					lineHeight: RECIPE_STATS_LINE_HEIGHT * scale,
				},
			}
			: {name: {}, machines: {}, stats: {}};
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
					rx: 5,
					ry: 5,
					...(sloopGlow
						? {filter: {name: 'dropShadow', args: {dx: 0, dy: 0, blur: 9, color: SLOOP_GLOW_COLOR, opacity: 0.55}}}
						: {}),
					...fade,
				},
				name: {text: style.name, ...recipeLabelAttrs.name, x: textShift, ...this.textFill(style, NODE_DARK_NAME_TEXT), ...fade},
				machines: {text: style.machines, ...recipeLabelAttrs.machines, x: textShift, ...this.textFill(style, NODE_DARK_DETAIL_TEXT), ...fade},
				stats: {text: style.stats, ...recipeLabelAttrs.stats, x: textShift, ...this.textFill(style, NODE_DARK_STATS_TEXT), ...fade},
				zoomedOutName: {
					...this.zoomedOutNameAttrs(style.name, size, this.hasLeftIcon(node) ? TEXT_LEFT_INSET : ZOOMED_OUT_NAME_PAD_RIGHT, ZOOMED_OUT_NAME_PAD_RIGHT),
					...this.textFill(style, NODE_DARK_NAME_TEXT),
					...fade,
				},
				machineIcon: {...this.iconAttrs(this.nodeIconFor(node)), ...this.leftIconAttrs(node), ...fade},
				...this.recipeSloopBadges(node, textShift, labelOffset, fade),
				sloop: {...this.iconAttrs(cornerSloop), ...fade},
				lock: {...this.iconAttrs(style.lock), y: (cornerSloop ? LOCK_ROW2_Y : CORNER_INSET) * scale, ...fade},
				done: this.iconAttrs(style.done),
				inputWarning: {...this.iconAttrs(style.inputWarning), ...fade},
				outputWarning: {...this.iconAttrs(style.outputWarning), ...fade},
				capacityWarning: {
					...this.iconAttrs(style.capacityWarning),
					...(node.done ? {refDx: -(WARNING_ICON_SIZE + CORNER_INSET + DONE_ICON_SIZE + 4) * scale} : {}),
					...fade,
				},
			},
		});
		this.applyClaimMarker(cell, node.id);
	}

	private addSubplanNode(x6Graph: X6Graph, node: SubplanNode): void
	{
		const style = this.baseStyleFor(node);
		const size = this.sizeFor(node);
		const ioInset = this.settings.graph().showSubplanItemIcons ? SUBPLAN_IO_COLUMN_WIDTH + 4 : ZOOMED_OUT_NAME_PAD_RIGHT;
		const attrs: Record<string, Record<string, string | number>> = {
			body: {fill: style.bodyFill, stroke: style.bodyStroke, strokeWidth: NODE_STROKE_WIDTH, rx: 5, ry: 5},
			name: {text: this.subplanDisplayName(node), ...this.textFill(style, NODE_DARK_NAME_TEXT)},
			stats: {text: this.subplanStats(node), ...this.textFill(style, NODE_DARK_STATS_TEXT)},
			zoomedOutName: {...this.zoomedOutNameAttrs(this.subplanDisplayName(node), size, ioInset, ioInset), ...this.textFill(style, NODE_DARK_NAME_TEXT)},
			lock: this.iconAttrs(this.lockIconUri),
		};
		this.applySubplanIoIcons(attrs, 'in', node.inputs);
		this.applySubplanIoIcons(attrs, 'out', node.outputs);
		if (style.darkText) {
			attrs['inMore']['fill'] = NODE_DARK_STATS_TEXT;
			attrs['outMore']['fill'] = NODE_DARK_STATS_TEXT;
		}
		if (node.done) {
			Object.values(attrs).forEach(attr => attr['opacity'] = DONE_OPACITY);
		}
		attrs['done'] = this.iconAttrs(style.done);
		const cell = x6Graph.addNode({
			id: node.id,
			shape: 'planner-subplan-node',
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
		if (this.readOnly) {
			return {};
		}
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		const markup = [
			{tagName: 'circle', selector: 'portBody'},
			{tagName: 'image', selector: 'portIcon'},
		];
		const scale = this.nodeScale();
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
			groups: {
				in: {position: ({left: 'left', down: 'top', right: 'right', up: 'bottom'} as const)[direction] ?? 'left', markup, attrs},
				out: {position: ({left: 'right', down: 'bottom', right: 'left', up: 'top'} as const)[direction] ?? 'right', markup, attrs},
			},
			items: [
				...this.portItemsFor(node.inputs, 'in'),
				...this.portItemsFor(node.outputs, 'out'),
			],
		};
	}

	private portItemsFor(ios: NodeIO[], group: 'in' | 'out'): PortMetadata[]
	{
		const seen = new Set<string>();
		const items: PortMetadata[] = [];
		ios.forEach(io => {
			if (seen.has(io.item.className)) {
				return;
			}
			seen.add(io.item.className);
			items.push({
				id: `${group}|${io.item.className}`,
				group,
				attrs: {portIcon: this.iconAttrs(this.iconUrls.url(io.item.icon, 64) ?? '')},
			});
		});
		return items;
	}

	private portInfo(portId: string | null): {side: 'in' | 'out'; itemClassName: string} | null
	{
		if (!portId) {
			return null;
		}
		const separator = portId.indexOf('|');
		const side = portId.slice(0, separator);
		if (separator < 0 || (side !== 'in' && side !== 'out')) {
			return null;
		}
		return {side, itemClassName: portId.slice(separator + 1)};
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

	/** Perpendicular from the lower-id-first orientation so both directions split to opposite sides; sorted so edges keep their side across re-renders. */
	private computeParallelOffsets(graph: Graph): Map<GraphEdge, GraphPoint>
	{
		const centers = new Map<string, GraphPoint>();
		graph.nodes.forEach(node => {
			const size = this.sizeFor(node);
			centers.set(node.id, {x: node.x + size.width / 2, y: node.y + size.height / 2});
		});

		const groups = new Map<string, GraphEdge[]>();
		graph.edges.forEach(edge => {
			if (edge.vertices && edge.vertices.length > 0) {
				return;
			}
			const key = edge.sourceId < edge.targetId
				? `${edge.sourceId}|${edge.targetId}`
				: `${edge.targetId}|${edge.sourceId}`;
			const group = groups.get(key);
			if (group) {
				group.push(edge);
			} else {
				groups.set(key, [edge]);
			}
		});

		const offsets = new Map<GraphEdge, GraphPoint>();
		groups.forEach(group => {
			if (group.length < 2) {
				return;
			}
			const [lowId, highId] = [group[0].sourceId, group[0].targetId].sort();
			const a = centers.get(lowId);
			const b = centers.get(highId);
			if (!a || !b) {
				return;
			}
			const length = Math.hypot(b.x - a.x, b.y - a.y);
			if (length < 1) {
				return;
			}
			const perpX = -(b.y - a.y) / length;
			const perpY = (b.x - a.x) / length;
			group.sort((e1, e2) => `${e1.sourceId}|${e1.itemClassName}`.localeCompare(`${e2.sourceId}|${e2.itemClassName}`));
			group.forEach((edge, i) => {
				const delta = (i - (group.length - 1) / 2) * PARALLEL_EDGE_GAP;
				offsets.set(edge, {x: perpX * delta, y: perpY * delta});
			});
		});
		return offsets;
	}

	private addEdge(x6Graph: X6Graph, edge: GraphEdge, index: number): void
	{
		const plan = this.beltPlanSignal().get(index);
		if (this.beltViewEnabled() && plan !== undefined && plan.layout.belts.length >= 2) {
			this.addBeltEdges(x6Graph, edge, index, plan);
			return;
		}
		this.addEdgeCell(
			x6Graph,
			edge,
			`edge-${index}`,
			this.labelTextFor(edge, index),
			edge.labelDistance ?? 0.5,
			this.parallelOffsets.get(edge) ?? null,
		);
	}

	/** Belt view: one clearly separate arrow per belt, spaced on the connection's normal, each labelled with its own rate. */
	private addBeltEdges(x6Graph: X6Graph, edge: GraphEdge, index: number, plan: EdgeBeltPlan): void
	{
		const item = this.itemFor(edge);
		const belts = plan.layout.belts;
		const count = belts.length;
		const scale = this.edgeScale();
		const baseOffset = this.parallelOffsets.get(edge) ?? {x: 0, y: 0};
		// A user-routed connection keeps its saved vertices on every line; offsets only work on auto-routed edges.
		const normal = edge.vertices && edge.vertices.length > 0 ? {x: 0, y: 0} : this.edgeNormal(edge);
		// Every belt labels the same spot along the line, so the labels sit directly above their own arrows.
		const distance = edge.labelDistance ?? 0.5;
		belts.forEach((belt, beltIndex) => {
			const number = beltIndex + 1;
			const step = number - (count + 1) / 2;
			const delta = step * BELT_LINE_GAP * scale;
			const offset = normal.x !== 0 || normal.y !== 0 || baseOffset.x !== 0 || baseOffset.y !== 0
				? {x: baseOffset.x + normal.x * delta, y: baseOffset.y + normal.y * delta}
				: null;
			const percent = Math.round(belt.fill * 100);
			const rate = this.rateFormatter.rate(belt.load, item);
			this.addEdgeCell(
				x6Graph,
				edge,
				`edge-${index}-belt-${number}`,
				{
					name: percent < 100 ? `${rate} · ${percent}%` : rate,
					rate: '',
					iconUrl: number === 1 ? this.iconUrls.url(item?.icon ?? null, 64) : null,
				},
				distance,
				offset,
				belt.fill < 1 ? {strokeDasharray: BELT_DASH} : {},
				true,
			);
		});
	}

	private addEdgeCell(
		x6Graph: X6Graph,
		edge: GraphEdge,
		id: string,
		label: {name: string; rate: string; iconUrl: string | null},
		distance: number,
		offset: GraphPoint | null,
		lineAttrs: Record<string, string | number> = {},
		beltLabel = false,
	): void
	{
		const size = this.labelSizeFor(label);
		// Belt labels hug their own line on the line's normal instead of stacking far away from it.
		const labelOffset = beltLabel ? BELT_LABEL_OFFSET * this.edgeScale() : 0;
		this.edgeById.set(id, edge);
		const hasIcon = label.iconUrl !== null && this.settings.graph().showEdgeItemIcons;
		const scale = this.edgeScale();
		const textShift = hasIcon ? (EDGE_ICON_SIZE + EDGE_ICON_GAP) * scale / 2 : 0;
		const showBox = !beltLabel && this.settings.graph().showEdgeLabelBoxes;
		// Only labels with an icon swap to it when zoomed out; text-only labels keep their text.
		const detailClass = hasIcon ? EDGE_DETAIL_CLASS : '';
		const zoomedOutIconSize = (LABEL_HEIGHT - 2 * ZOOMED_OUT_EDGE_ICON_PAD) * scale;
		const wrapShift = (label.name.split('\n').length - 1) * LABEL_NAME_LINE_HEIGHT / 2;
		const boxPad = showBox ? LABEL_BOX_PILL_PAD * scale : 0;
		const fade = this.doneNodeIds.has(edge.sourceId) && this.doneNodeIds.has(edge.targetId)
			? {opacity: DONE_OPACITY}
			: {};
		const anchor = offset ? {name: 'center', args: {dx: offset.x, dy: offset.y}} : undefined;

		x6Graph.addEdge({
			id,
			zIndex: EDGE_BASE_Z,
			source: anchor ? {cell: edge.sourceId, anchor} : edge.sourceId,
			target: anchor ? {cell: edge.targetId, anchor} : edge.targetId,
			attrs: {
				line: {
					class: EDGE_LINE_CLASS,
					stroke: this.edgeStrokeForCell(id, edge),
					strokeWidth: EDGE_STROKE_WIDTH,
					...lineAttrs,
					...fade,
				},
			},
			defaultLabel: EDGE_DEFAULT_LABEL,
			labels: [{
				markup: [
					{tagName: 'rect', selector: 'rect'},
					{tagName: 'image', selector: 'icon'},
					{tagName: 'text', selector: 'name'},
					{tagName: 'text', selector: 'rate'},
					{tagName: 'image', selector: 'zoomedOutIcon'},
				],
				position: labelOffset !== 0 ? {distance, offset: labelOffset} : {distance},
				attrs: {
					name: {
						text: label.name,
						class: detailClass,
						fill: LABEL_TEXT_FILL,
						fontSize: LABEL_NAME_FONT_SIZE * scale,
						fontWeight: 'bold',
						textAnchor: 'middle',
						textVerticalAnchor: 'middle',
						x: textShift,
						y: (beltLabel ? 0 : LABEL_NAME_Y * scale),
						lineHeight: LABEL_NAME_LINE_HEIGHT * scale,
						...fade,
					},
					rate: {
						text: label.rate,
						class: detailClass,
						fill: LABEL_TEXT_FILL,
						fontSize: LABEL_FONT_SIZE * scale,
						textAnchor: 'middle',
						textVerticalAnchor: 'middle',
						x: textShift,
						y: (LABEL_RATE_Y + wrapShift) * scale,
						...fade,
					},
					icon: hasIcon
						? {
							class: detailClass,
							'xlink:href': label.iconUrl,
							width: EDGE_ICON_SIZE * scale,
							height: EDGE_ICON_SIZE * scale,
							x: -size.width / 2 + 6 * scale,
							y: -EDGE_ICON_SIZE * scale / 2,
							...fade,
						}
						: {'xlink:href': '', width: 0, height: 0},
					zoomedOutIcon: hasIcon
						? {
							class: EDGE_ZOOMED_OUT_ICON_CLASS,
							'xlink:href': label.iconUrl,
							width: zoomedOutIconSize,
							height: zoomedOutIconSize,
							x: -zoomedOutIconSize / 2,
							y: -zoomedOutIconSize / 2,
							display: 'none',
							...fade,
						}
						: {'xlink:href': '', width: 0, height: 0, display: 'none'},
					// Sized explicitly: the default rect follows the text bbox, which drifts with font metrics and load timing. Hidden stays transparent to keep the hit area.
					rect: {
						class: showBox ? LABEL_BOX_CLASS : '',
						ref: null,
						refX: null,
						refY: null,
						refWidth: null,
						refHeight: null,
						x: -size.width / 2 - boxPad,
						y: -size.height / 2,
						width: size.width + boxPad * 2,
						height: size.height,
						fill: showBox ? LABEL_BOX_FILL : 'transparent',
						stroke: showBox ? LABEL_BOX_STROKE : 'none',
						strokeWidth: showBox ? LABEL_BOX_STROKE_WIDTH : 0,
						rx: size.height / 2,
						ry: size.height / 2,
						// Belt labels are text only, and their box is taller than the belt gap: keep it from eating clicks on the neighbouring lines.
						...(beltLabel ? {pointerEvents: 'none'} : {}),
						...fade,
					},
				},
			}],
			...(edge.vertices && edge.vertices.length > 0 ? {
				vertices: [...edge.vertices],
				router: {name: 'normal'},
				connector: {name: 'normal'},
			} : {}),
		});
	}

	/** Same orientation as computeParallelOffsets, so belt lines stay on a stable side across renders. */
	private edgeNormal(edge: GraphEdge): GraphPoint
	{
		const graph = this.renderedGraph;
		if (graph === null) {
			return {x: 0, y: 0};
		}
		const [lowId, highId] = [edge.sourceId, edge.targetId].sort();
		const low = graph.nodes.find(node => node.id === lowId);
		const high = graph.nodes.find(node => node.id === highId);
		if (!low || !high) {
			return {x: 0, y: 0};
		}
		const lowSize = this.sizeFor(low);
		const highSize = this.sizeFor(high);
		const ax = low.x + lowSize.width / 2;
		const ay = low.y + lowSize.height / 2;
		const bx = high.x + highSize.width / 2;
		const by = high.y + highSize.height / 2;
		const length = Math.hypot(bx - ax, by - ay);
		if (length < 1) {
			return {x: 0, y: 0};
		}
		return {x: -(by - ay) / length, y: (bx - ax) / length};
	}

	private itemFor(edge: GraphEdge): Item | null
	{
		return this.versionManager.activeVersionData()?.searchItemByClassName(edge.itemClassName) ?? null;
	}

	private labelTextFor(edge: GraphEdge, index?: number): {name: string; rate: string; iconUrl: string | null}
	{
		const item = this.itemFor(edge);
		const rate = this.rateFormatter.rate(edge.amount, item);
		const overLimit = this.overLimitLabelFor(edge, item);
		const fills = this.beltFillsLabelFor(index);
		const suffix = [overLimit, fills].filter((part): part is string => part !== null).join(' · ');
		return {
			name: this.wrapLabelName(item?.name ?? edge.itemClassName),
			rate: suffix === '' ? rate : `${rate} · ${suffix}`,
			iconUrl: this.iconUrls.url(item?.icon ?? null, 64),
		};
	}

	/** One-belt connections keep today's label; multi-belt ones gain each belt's fill, e.g. "100/100/100/25%". */
	private beltFillsLabelFor(index: number | undefined): string | null
	{
		if (index === undefined) {
			return null;
		}
		const plan = this.beltPlanSignal().get(index);
		if (plan === undefined || plan.layout.belts.length < 2) {
			return null;
		}
		return `${plan.layout.belts.map(belt => Math.round(belt.fill * 100)).join('/')}%`;
	}

	/** Appended to the rate label only when the connection needs more than one line. */
	private overLimitLabelFor(edge: GraphEdge, item: Item | null): string | null
	{
		const limit = this.planManager.activeSettings()?.conveyorLimit;
		if (limit === undefined) {
			return null;
		}
		const fluid = ConveyorCapacity.isFluid(item);
		const count = ConveyorCapacity.countNeeded(edge.amount, ConveyorCapacity.capacity(limit, fluid));
		return count > 1 ? ConveyorCapacity.label(limit, fluid, count) : null;
	}

	private edgeStrokeFor(edge: GraphEdge | undefined): string
	{
		return edge !== undefined && this.overLimitLabelFor(edge, this.itemFor(edge)) !== null
			? EDGE_OVER_LIMIT_STROKE
			: EDGE_STROKE;
	}

	/** Belt lines are each within capacity, so the connection's over-limit amber does not apply to them. */
	private edgeStrokeForCell(cellId: string, edge: GraphEdge | undefined): string
	{
		return this.isBeltLineId(cellId) ? EDGE_STROKE : this.edgeStrokeFor(edge);
	}

	private isBeltLineId(cellId: string): boolean
	{
		return /^edge-\d+-belt-\d+$/.test(cellId);
	}

	private beltViewEnabled(): boolean
	{
		const settings = this.planManager.activeSettings();
		return settings?.conveyorLimit !== undefined && settings.beltLayout?.beltView === true;
	}

	/** Re-labels the rendered edges in place: a limit or belt-mode change must not re-solve or re-lay out the graph. */
	public refreshConveyorLimits(): void
	{
		if (!this.x6Graph) {
			return;
		}
		// Belt view changes how many x6 edges exist, so labels cannot be edited in place in either direction.
		if (this.beltViewEnabled() || this.renderedBeltView) {
			const graph = this.renderedGraph;
			if (graph === null) {
				return;
			}
			const selectedIds = this.selectedNodes().map(node => node.id);
			this.restore(this.x6Graph.container, graph, false);
			if (selectedIds.length > 0) {
				this.selectNodesById(selectedIds);
			}
			return;
		}
		this.refreshBeltPlan(this.renderedGraph);
		const scale = this.edgeScale();
		const boxPad = this.settings.graph().showEdgeLabelBoxes ? LABEL_BOX_PILL_PAD * scale : 0;
		this.x6Graph.getEdges().forEach(cell => {
			const edge = this.edgeById.get(cell.id);
			if (edge === undefined) {
				return;
			}
			const index = this.renderedGraph?.edges.indexOf(edge);
			const label = this.labelTextFor(edge, index !== undefined && index >= 0 ? index : undefined);
			const size = this.labelSizeFor(label);
			cell.prop('labels/0/attrs/rate/text', label.rate);
			cell.prop('labels/0/attrs/rect/x', -size.width / 2 - boxPad);
			cell.prop('labels/0/attrs/rect/width', size.width + boxPad * 2);
			this.applyEdgeStyle(cell as X6Edge);
		});
	}

	/** Recomputes the cached plan for the rendered graph; labels and the inspector both read the same map. */
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

	private labelSizeFor(label: {name: string; rate: string; iconUrl: string | null}): {width: number; height: number}
	{
		const nameLines = label.name.split('\n');
		const textWidth = Math.max(...nameLines.map(line => line.length * LABEL_NAME_CHAR_WIDTH), label.rate.length * LABEL_CHAR_WIDTH);
		const iconWidth = label.iconUrl ? EDGE_ICON_SIZE + EDGE_ICON_GAP : 0;
		const scale = this.edgeScale();
		return {
			width: (textWidth + LABEL_PADDING_X + iconWidth) * scale,
			height: (LABEL_HEIGHT + (nameLines.length - 1) * LABEL_NAME_LINE_HEIGHT) * scale,
		};
	}

	private wrapLabelName(name: string): string
	{
		if (name.length * LABEL_NAME_CHAR_WIDTH <= LABEL_NAME_WRAP_WIDTH) {
			return name;
		}
		const words = name.split(' ');
		let best = name;
		let bestLongest = name.length;
		for (let split = 1; split < words.length; split++) {
			const first = words.slice(0, split).join(' ');
			const second = words.slice(split).join(' ');
			const longest = Math.max(first.length, second.length);
			if (longest < bestLongest) {
				best = `${first}\n${second}`;
				bestLongest = longest;
			}
		}
		return best;
	}

	private onSelectionChanged(x6Graph: X6Graph, selected: Cell[]): void
	{
		const selectedIds = new Set(selected.filter(cell => cell.isNode()).map(cell => cell.id));

		x6Graph.getNodes().forEach(cell => {
			const modelNode = this.nodeById.get(cell.id);
			if (selectedIds.has(cell.id)) {
				cell.attr('body/stroke', SELECTED_STROKE);
				cell.attr('body/strokeWidth', SELECTED_STROKE_WIDTH);
				this.scheduleZChange(cell, this.touchUsed ? SELECTED_TOUCH_Z : NODE_HIGHLIGHT_Z);
			} else if (modelNode) {
				cell.attr('body/stroke', this.styleFor(modelNode).bodyStroke);
				cell.attr('body/strokeWidth', NODE_STROKE_WIDTH);
				this.scheduleZChange(cell, null);
			}
		});

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
		const point = this.x6Graph.clientToLocal(e.clientX, e.clientY);
		this.moveCornerPreview(this.hoveredEdgeView, point.x, point.y);
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

	private isEdgeHighlighted(edge: X6Edge): boolean
	{
		const selection = this.selection;
		return selection !== null
			&& (selection.isSelected(edge.getSourceCellId()) || selection.isSelected(edge.getTargetCellId()));
	}

	private applyEdgeStyle(edge: X6Edge): void
	{
		const highlighted = this.isEdgeHighlighted(edge);

		edge.attr('line/stroke', highlighted ? SELECTED_STROKE : this.edgeStrokeForCell(edge.id, this.edgeById.get(edge.id)));
		edge.attr('line/strokeWidth', highlighted ? SELECTED_EDGE_STROKE_WIDTH : EDGE_STROKE_WIDTH);
		edge.attr('line/class', highlighted ? `${EDGE_LINE_CLASS} ${EDGE_HIGHLIGHT_CLASS}` : EDGE_LINE_CLASS);

		this.applyLabelBoxStyle(edge, highlighted);
		this.scheduleZChange(edge, highlighted ? EDGE_HIGHLIGHT_Z : null);
	}

	/** Class on the view, not an attr: attr writes re-apply all attrs and re-fetch the label icon. `:hover` fails since the vertex tool covers the edge. */
	private applyEdgeHover(view: EdgeView, edge: X6Edge, hovered: boolean): void
	{
		const modelEdge = this.edgeById.get(edge.id);
		const x6Graph = this.x6Graph;
		const cells: X6Edge[] = modelEdge && x6Graph
			? x6Graph.getEdges().filter(cell => this.edgeById.get(cell.id) === modelEdge)
			: [edge];
		cells.forEach(cell => {
			const cellView = cell.id === edge.id ? view : x6Graph?.findViewByCell(cell);
			if (cellView instanceof EdgeView) {
				if (hovered) {
					cellView.addClass(EDGE_HOVER_CLASS);
				} else {
					cellView.removeClass(EDGE_HOVER_CLASS);
				}
			}
			this.scheduleZChange(cell, hovered || this.isEdgeHighlighted(cell) ? EDGE_HIGHLIGHT_Z : null);
		});
	}

	private applyLabelBoxStyle(edge: X6Edge, highlighted: boolean): void
	{
		if (!this.settings.graph().showEdgeLabelBoxes || !edge.getLabelAt(0)) {
			return;
		}
		edge.prop('labels/0/attrs/rect/stroke', highlighted ? SELECTED_STROKE : LABEL_BOX_STROKE);
		edge.prop('labels/0/attrs/rect/strokeWidth', highlighted ? LABEL_BOX_HIGHLIGHT_STROKE_WIDTH : LABEL_BOX_STROKE_WIDTH);
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
		if (!this.readOnly && !edge.hasTools()) {
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
		});
		// x6 notifies every selected node once the drag ends, so the first call sees them all.
		x6Graph.on('node:moved', () => this.endNodeDrag());
	}

	/**
	 * The layout's corners follow a moved end: the corner next to it shifts with it, so the route stays right-angled
	 * instead of collapsing into a diagonal. Both ends moving keeps the shape (x6 translates the corners).
	 */
	private endNodeDrag(): void
	{
		const movedIds = new Set(this.movedNodeIds);
		const starts = new Map(this.dragStartPositions);
		this.movedNodeIds.clear();
		this.dragStartPositions.clear();
		const x6Graph = this.x6Graph;
		if (this.readOnly || movedIds.size === 0 || x6Graph === null) {
			return;
		}

		const followed = [...new Set(this.edgeById.values())].filter(edge => {
			if (edge.autoRouted !== true) {
				return false;
			}
			const sourceMoved = movedIds.has(edge.sourceId);
			const targetMoved = movedIds.has(edge.targetId);
			return sourceMoved !== targetMoved;
		});
		if (followed.length === 0) {
			return;
		}

		// The drag's own vertex translation usually took the snapshot; otherwise take one here, like straightenEdge.
		// Either way it is one step for the whole change: the per-line handler must not take one for each belt edge.
		if (!this.vertexGestureActive) {
			this.vertexGestureActive = true;
			this.graphEditStartSubject.next();
		}
		followed.forEach(edge => {
			const vertices = this.followMovedEnd(x6Graph, edge, movedIds.has(edge.sourceId), starts);
			edge.vertices = vertices;
			// Still the layout's route, so a later move adjusts it again; an empty route has nothing left to adjust.
			edge.autoRouted = vertices.length > 0;
			x6Graph.getEdges().forEach(cell => {
				if (this.edgeById.get(cell.id) === edge) {
					cell.setVertices([...vertices], {autoRoute: true});
				}
			});
		});
		this.graphChangedSubject.next();
	}

	/**
	 * Shifts the corner next to the moved end along with it. The segment into that end keeps its direction (horizontal
	 * stays horizontal), and the segment before it keeps its own, so the route stays right-angled. A corner the move
	 * passed or landed inside the block falls back to a plain two-corner route between the blocks.
	 */
	private followMovedEnd(x6Graph: X6Graph, edge: GraphEdge, sourceMoved: boolean, starts: ReadonlyMap<string, GraphPoint>): GraphPoint[]
	{
		const vertices = (edge.vertices ?? []).map(point => ({x: point.x, y: point.y}));
		const movedId = sourceMoved ? edge.sourceId : edge.targetId;
		const moved = x6Graph.getCellById(movedId);
		const other = x6Graph.getCellById(sourceMoved ? edge.targetId : edge.sourceId);
		const start = starts.get(movedId);
		if (vertices.length === 0 || !(moved instanceof X6Node) || !(other instanceof X6Node) || start === undefined) {
			return [];
		}

		const position = moved.getPosition();
		const dx = position.x - start.x;
		const dy = position.y - start.y;
		const box = moved.getBBox();
		const center = box.getCenter();
		const before = {x: center.x - dx, y: center.y - dy};
		const index = sourceMoved ? 0 : vertices.length - 1;
		const corner = vertices[index];
		const horizontal = Math.abs(corner.y - before.y) <= Math.abs(corner.x - before.x);

		if (horizontal) {
			corner.y += dy;
		} else {
			corner.x += dx;
		}

		// The corner must still be outside the block, on the side it was before; otherwise the line would double back.
		const margin = 10;
		const clear = horizontal
			? Math.sign(corner.x - center.x) === Math.sign(corner.x - before.x) && Math.abs(corner.x - center.x) > box.width / 2 + margin
			: Math.sign(corner.y - center.y) === Math.sign(corner.y - before.y) && Math.abs(corner.y - center.y) > box.height / 2 + margin;
		if (clear) {
			return vertices;
		}

		const source = (sourceMoved ? moved : other).getBBox().getCenter();
		const target = (sourceMoved ? other : moved).getBBox().getCenter();
		if (horizontal) {
			const middle = (source.x + target.x) / 2;
			return Math.abs(source.y - target.y) < 1 ? [] : [{x: middle, y: source.y}, {x: middle, y: target.y}];
		}
		const middle = (source.y + target.y) / 2;
		return Math.abs(source.x - target.x) < 1 ? [] : [{x: source.x, y: middle}, {x: target.x, y: middle}];
	}

	private elkEdgeVertices(edge: ElkExtendedEdge): GraphPoint[]
	{
		const points: GraphPoint[] = [];
		(edge.sections ?? []).forEach((section, i) => {
			if (i > 0) points.push(section.startPoint);
			(section.bendPoints ?? []).forEach(pt => points.push(pt));
		});
		return points;
	}

	/** 0–1 ratio along the route, as x6 positions labels. */
	private elkLabelDistance(edge: ElkExtendedEdge): number
	{
		const label = edge.labels?.[0];
		const points: GraphPoint[] = [];
		(edge.sections ?? []).forEach(section => {
			points.push(section.startPoint);
			(section.bendPoints ?? []).forEach(pt => points.push(pt));
			points.push(section.endPoint);
		});
		if (!label || points.length < 2) {
			return 0.5;
		}

		const center = {
			x: (label.x ?? 0) + (label.width ?? 0) / 2,
			y: (label.y ?? 0) + (label.height ?? 0) / 2,
		};

		let total = 0;
		let bestDistance = Infinity;
		let bestAt = 0;
		for (let i = 0; i < points.length - 1; i++) {
			const a = points[i];
			const b = points[i + 1];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const length = Math.hypot(dx, dy);
			const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / (length * length)));
			const distance = Math.hypot(center.x - (a.x + t * dx), center.y - (a.y + t * dy));
			if (distance < bestDistance) {
				bestDistance = distance;
				bestAt = total + t * length;
			}
			total += length;
		}
		return total === 0 ? 0.5 : bestAt / total;
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
				bodyStroke: '#d4663f',
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

	private nodeIconFor(node: Node): string
	{
		const graph = this.settings.graph();
		let hash: string | null = null;
		if (node instanceof RecipeNode) {
			hash = graph.showNodeBuildingIcons ? node.machine.icon : null;
		} else if (node instanceof GeneratorNode) {
			hash = graph.showNodeBuildingIcons ? node.generator.icon : null;
		} else if (node instanceof AugmenterNode) {
			hash = graph.showNodeBuildingIcons ? node.building.icon : null;
		} else if (node instanceof SinkNode) {
			hash = null;
		} else if (node instanceof ItemAmountNode) {
			hash = graph.showNodeItemIcons ? node.item.icon : null;
		}
		return this.iconUrls.url(hash, 64) ?? '';
	}

	private subplanDisplayName(node: SubplanNode): string
	{
		const plan = this.planManager.plans().find(candidate => candidate.id === node.subplanId);
		return plan ? this.planNames.displayName(plan) : node.getDisplayName();
	}

	private hasLeftIcon(node: Node): boolean
	{
		return this.nodeIconFor(node) !== '';
	}

	private textShiftFor(node: Node): number
	{
		return this.hasLeftIcon(node) ? TEXT_SHIFT * this.nodeScale() : 0;
	}

	private leftIconAttrs(node: Node): Record<string, number> | Record<string, never>
	{
		if (!this.hasLeftIcon(node)) {
			return {};
		}
		const scale = this.nodeScale();
		return {
			refY: 0.5,
			y: -LEFT_ICON_SIZE * scale / 2,
			x: LEFT_ICON_X * scale,
			width: LEFT_ICON_SIZE * scale,
			height: LEFT_ICON_SIZE * scale,
		};
	}

	private recipeSloopBadges(node: Node, textShift: number, labelOffset = 0, fade: {opacity?: number} = {}): Record<string, Record<string, string | number>>
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
			const lineWidth = this.groupStatLine(group).length * RECIPE_STATS_CHAR_WIDTH * scale;
			badges[`statSloop${i}`] = {
				'xlink:href': url,
				display: 'inline',
				x: textShift + lineWidth / 2 + STAT_SLOOP_GAP * scale,
				y: (RECIPE_STATS_Y + i * RECIPE_STATS_LINE_HEIGHT + STAT_SLOOP_CENTER_OFFSET - STAT_SLOOP_SIZE / 2) * scale + labelOffset,
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
		const size = {width: base.width * scale, height: base.height * scale};
		const belts = this.beltViewEnabled() ? this.maxBeltsFor(node) : 0;
		if (belts > 0) {
			// The outermost belt line sits (belts - 1) / 2 gaps from the node centre, so the node must be at least that
			// big on the axis the belts spread over, or those lines start and end beside it instead of on its side.
			const extent = belts * BELT_LINE_GAP * this.edgeScale() + BELT_NODE_PADDING * scale;
			if (this.beltAxisIsHeight()) {
				size.height = Math.max(size.height, extent);
			} else {
				size.width = Math.max(size.width, extent);
			}
		}
		return size;
	}

	/** Largest belt count on one multi-belt connection touching the node; 0 when every attached connection is one belt. */
	private maxBeltsFor(node: Node): number
	{
		let max = 0;
		this.beltPlanSignal().forEach(plan => {
			if (plan.layout.belts.length < 2) {
				return;
			}
			if (plan.edge.sourceId === node.id || plan.edge.targetId === node.id) {
				max = Math.max(max, plan.layout.belts.length);
			}
		});
		return max;
	}

	/** Belt lines spread on the connection normal: vertically in left/right layouts, horizontally in up/down ones. */
	private beltAxisIsHeight(): boolean
	{
		const direction = this.graphLayout.resolve(this.planManager.activePlan()?.settings.graph).direction;
		return direction === 'left' || direction === 'right';
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
		if (node instanceof RecipeNode) {
			const stats = this.recipeStats(node);
			const sloopExtra = stats !== '' && node.groups.some(group => group.sloops > 0) ? STAT_SLOOP_SIZE + STAT_SLOOP_GAP : 0;
			return this.statLinesSize(node.getDisplayName(), this.machinesLine(node), stats, sloopExtra, this.horizontalPadding(node));
		}
		if (node instanceof SinkNode) {
			return this.statLinesSize(node.getDisplayName(), this.sinkPointsLine(node), this.sinkStats(node));
		}
		if (node instanceof MineNode) {
			const stats = this.mineStats(node);
			if (this.extractorStats(node) !== null || stats.includes('\n')) {
				return this.statLinesSize(node.getDisplayName(), '', stats, 0, this.horizontalPadding(node));
			}
		}
		if (this.hasLeftIcon(node)) {
			const style = this.baseStyleFor(node);
			const textWidth = Math.max(
				style.name.length * NODE_NAME_CHAR_WIDTH,
				style.stats.length * RECIPE_STATS_CHAR_WIDTH,
			);
			const width = Math.min(RECIPE_MAX_WIDTH, Math.max(NODE_WIDTH, Math.ceil(TEXT_LEFT_INSET + textWidth + TEXT_RIGHT_PAD)));
			return {width, height: NODE_HEIGHT};
		}
		return {width: NODE_WIDTH, height: NODE_HEIGHT};
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

	private horizontalPadding(node: Node): number
	{
		return this.hasLeftIcon(node) ? TEXT_LEFT_INSET + TEXT_RIGHT_PAD : RECIPE_TEXT_PADDING_X;
	}

	private statLinesSize(name: string, boldLine: string, stats: string, statsExtra = 0, horizontalPadding = RECIPE_TEXT_PADDING_X): {width: number; height: number}
	{
		const lines = stats === '' ? [] : stats.split('\n');
		const height = Math.max(NODE_HEIGHT, RECIPE_STATS_Y + RECIPE_STATS_LINE_HEIGHT * lines.length + RECIPE_BOTTOM_PADDING);
		const textWidth = Math.max(
			name.length * RECIPE_NAME_CHAR_WIDTH,
			boldLine.length * RECIPE_BOLD_CHAR_WIDTH,
			...lines.map(line => line.length * RECIPE_STATS_CHAR_WIDTH + statsExtra),
		);
		const width = Math.min(RECIPE_MAX_WIDTH, Math.max(NODE_WIDTH, Math.ceil(textWidth + horizontalPadding)));
		return {width, height};
	}

	private baseStyleFor(node: Node): NodeStyle
	{
		const accent = this.accentColor(node);
		const fill = NodeFillResolver.fill(accent, this.settings.graph().nodeFillAmount);
		const colors = node.done
			? {bodyFill: DONE_FILL, bodyStroke: DONE_STROKE, darkText: false}
			: {bodyFill: fill, bodyStroke: accent, darkText: NodeFillResolver.needsDarkText(fill)};
		const icons = {lock: '', done: node.done ? this.doneIconUri : '', inputWarning: '', outputWarning: '', capacityWarning: ''};

		if (node instanceof SubplanNode) {
			return {...colors, name: node.getDisplayName(), stats: this.subplanStats(node), machines: '', ...icons};
		}
		if (node instanceof RecipeNode) {
			return {...colors, name: node.getDisplayName(), stats: this.recipeStats(node), machines: this.machinesLine(node), ...icons};
		}
		if (node instanceof GeneratorNode) {
			return {...colors, name: node.getDisplayName(), stats: this.generatorStats(node), machines: '', ...icons};
		}
		if (node instanceof AugmenterNode) {
			return {...colors, name: node.getDisplayName(), stats: this.augmenterStats(node), machines: '', ...icons};
		}
		if (node instanceof SinkNode) {
			return {...colors, name: node.getDisplayName(), machines: this.sinkPointsLine(node), stats: this.sinkStats(node), ...icons};
		}
		if (node instanceof MineNode) {
			return {...colors, name: node.getDisplayName(), stats: this.mineStats(node), machines: '', ...icons};
		}
		if (node instanceof InputNode) {
			return {...colors, name: node.getDisplayName(), stats: this.ioStats('Input', node.amount, node.item), machines: '', ...icons};
		}
		if (node instanceof ProductNode) {
			return {...colors, name: node.getDisplayName(), stats: this.ioStats('Product', node.amount, node.item), machines: '', ...icons};
		}
		if (node instanceof ByproductNode) {
			return {...colors, name: node.getDisplayName(), stats: this.ioStats('Byproduct', node.amount, node.item), machines: '', ...icons};
		}
		return {...colors, name: '?', machines: '', stats: this.rateFormatter.amount(node.amount), ...icons};
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

	private textFill(style: NodeStyle, dark: string): {fill?: string}
	{
		return style.darkText ? {fill: dark} : {};
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
				? `All ${rate(total)} goes to other nodes. Drag to add another connection.`
				: `All ${rate(total)} comes from other nodes. Drag to add another connection.`;
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
				'The calculation will not change this node.',
				'Unlock it from the right-click menu or the Inspector.',
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
		return `${role} · ${this.rateFormatter.rate(amount, item)}`;
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
		return `${this.rateFormatter.amount(count)} extractor${count === 1 ? '' : 's'} · `
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

	private recipeStats(node: RecipeNode): string
	{
		const lines = this.singleLineMachines() ? [] : node.groups.map(group => this.groupStatLine(group));
		return lines.join('\n');
	}

	private labelBlockOffset(stats: string, height: number): number
	{
		const lines = stats === '' ? 0 : stats.split('\n').length;
		const naturalHeight = (RECIPE_STATS_Y + RECIPE_STATS_LINE_HEIGHT * lines + RECIPE_BOTTOM_PADDING) * this.nodeScale();
		return Math.max(0, (height - naturalHeight) / 2);
	}

	/** The somersloop icon is drawn separately (recipeSloopBadges). */
	private groupStatLine(group: MachineGroup): string
	{
		const sloops = group.sloops > 0 ? ` +${group.sloops}` : '';
		return `${group.machines} @ ${this.rateFormatter.clock(group.clockSpeed)}%${sloops}`;
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
