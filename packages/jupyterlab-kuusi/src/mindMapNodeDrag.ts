import type { DocumentRegistry } from "@jupyterlab/docregistry";
import type { Notebook } from "@jupyterlab/notebook";
import {
  collectOutlineSelectionRoots,
  findOutlineNode,
  getDropZoneFromPointer,
  isOutlineDescendant,
  LAYOUT_NODE_WIDTH,
  moveOutlineNodes,
  resolveDropTarget,
  resolveSiblingGapDrop,
  type DropZone,
  type OutlineNode,
  type TreeDirection,
} from "kuusi-kernel";
import { applyOutlineToNotebook } from "./notebookSync";
import { extendQuietNotebookSync } from "./notebookViewSync";
import {
  VIEWPORT_PAN_LOCK_MS,
} from "./notebookMindMapTypes";

export type MindMapDragHost = {
  cellNodes: Map<string, HTMLElement>;
  scene: HTMLElement;
  viewport: HTMLElement;
  zoom: number;
  panX: number;
  panY: number;
  treeDirection: TreeDirection;
  siblingGap: number;
  childGap: number;
  notebook: Notebook;
  context: DocumentRegistry.IContext<import("@jupyterlab/notebook").INotebookModel>;
  applyingNotebookChange: boolean;
  pendingFocusCellIndex: number | null;
  pendingFocusCenter: boolean;
  viewportAnchor: { nodeId: string; screenX: number; screenY: number } | null;
  getOutlineSnapshot: () => {
    cells: import("kuusi-kernel").NotebookCell[];
    outline: OutlineNode;
  };
  getSelectedNodeIds: () => string[];
  getCellIndexFromNodeId: (nodeId: string) => number;
  applyLayout: () => void;
  invalidateOutlineCache: () => void;
  refreshEdgesFromCache: () => void;
  selectCellsByModelIds: (modelIds: string[], activeModelId: string) => void;
  cancelCenterFollow: () => void;
  holdViewportPan: () => void;
  lockViewportPan: (ms: number) => void;
  setApplyingNotebookChange: (value: boolean) => void;
  setPendingFocusCellIndex: (value: number | null) => void;
  setPendingFocusCenter: (value: boolean) => void;
  setViewportAnchor: (
    value: { nodeId: string; screenX: number; screenY: number } | null,
  ) => void;
};

export type MindMapDragState = {
  nodeId: string;
  nodeIds: string[];
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  /**
   * Touch only: until this timestamp a finger move pans the canvas instead of
   * starting a reorder (long-press to drag). 0 for mouse / pen.
   */
  holdUntil?: number;
};

/**
 * Node drag / drop / slot-preview for the mind-map canvas.
 * Owns drag session state; calls back into the widget host for layout + outline.
 */
export class MindMapNodeDragController {
  private readonly _host: MindMapDragHost;
  private _dragState: MindMapDragState | null = null;
  private _dragGhost: HTMLElement | null = null;
  private _dropTargetNodeId: string | null = null;
  private _dropZone: DropZone | null = null;
  private _dragBasePositions = new Map<
    string,
    { left: number; top: number; width: number; height: number }
  >();
  private _dragSlotPreviewKey: string | null = null;

  constructor(host: MindMapDragHost) {
    this._host = host;
  }

  get dragState(): MindMapDragState | null {
    return this._dragState;
  }

  set dragState(value: MindMapDragState | null) {
    this._dragState = value;
  }

  get dropZone(): DropZone | null {
    return this._dropZone;
  }

  get dropTargetNodeId(): string | null {
    return this._dropTargetNodeId;
  }

  resolveDragNodeIds(nodeId: string): string[] {
    const selected = this._host.getSelectedNodeIds();

    if (selected.length <= 1 || !selected.includes(nodeId)) {
      return [nodeId];
    }

    const { outline } = this._host.getOutlineSnapshot();
    const roots = collectOutlineSelectionRoots(outline, selected);

    return roots.length > 0 ? roots : [nodeId];
  }

  isDraggedRelatedNode(
    outline: OutlineNode,
    draggedIds: readonly string[],
    nodeId: string,
  ): boolean {
    return draggedIds.some(
      (draggedId) =>
        draggedId === nodeId ||
        isOutlineDescendant(outline, draggedId, nodeId),
    );
  }

  startGhost(
    nodeId: string,
    clientX: number,
    clientY: number,
  ): void {
    const source = this._host.cellNodes.get(nodeId);

    if (!source) {
      return;
    }

    this._dragGhost?.remove();

    const ghost = source.cloneNode(true) as HTMLElement;
    ghost.classList.add("jp-KuusiNotebookMindMap-drag-ghost");
    ghost.classList.remove(
      "is-selected",
      "is-drag-source",
      "is-drop-before",
      "is-drop-inside",
      "is-drop-after",
      "is-slot-neighbor",
      "is-resizing",
      "jp-mod-active",
    );
    ghost.removeAttribute("id");
    // The clone lives in the document too — drop descendant ids so they stay unique.
    ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    ghost.querySelectorAll(
      ".jp-KuusiNotebookMindMap-collapse, .jp-KuusiNotebookMindMap-resizeHandle",
    ).forEach((el) => el.remove());

    // Keep layout size; screen size comes from canvas zoom via transform.
    ghost.style.width = `${source.offsetWidth}px`;
    ghost.style.height = `${source.offsetHeight}px`;
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.margin = "0";
    // The ghost lives outside the scene, so scene-scoped padding rules don't reach it.
    ghost.style.padding = getComputedStyle(source).padding;
    ghost.style.zIndex = "10000";
    ghost.style.pointerEvents = "none";
    ghost.style.transformOrigin = "top left";

    // Ghost lives on document.body — copy scene tokens so fonts/colors match.
    const sceneStyle = getComputedStyle(this._host.scene);
    for (let i = 0; i < sceneStyle.length; i += 1) {
      const name = sceneStyle.item(i);

      if (
        name.startsWith("--kuusi-") ||
        name.startsWith("--jp-content-font") ||
        name.startsWith("--jp-code-font") ||
        name.startsWith("--jp-ui-font") ||
        name.startsWith("--jp-mirror-editor")
      ) {
        ghost.style.setProperty(name, sceneStyle.getPropertyValue(name));
      }
    }

    if (this._host.scene.dataset.kuusiNodeContrast === "1") {
      const fg =
        source.style.getPropertyValue("--kuusi-node-foreground") ||
        sceneStyle.getPropertyValue("--kuusi-node-foreground");

      if (fg) {
        ghost.style.setProperty("--kuusi-node-foreground", fg);
        ghost.style.color = fg;
      }
    }

    document.body.appendChild(ghost);
    this._dragGhost = ghost;
    this.moveGhost(clientX, clientY);
  }

  moveGhost(clientX: number, clientY: number): void {
    if (!this._dragGhost) {
      return;
    }

    const zoom = this._host.zoom;
    this._dragGhost.style.transform = `translate(${clientX + 12}px, ${clientY + 12}px) scale(${zoom})`;
  }

  updateDropTarget(clientX: number, clientY: number): void {
    this._host.cellNodes.forEach((node) => {
      node.classList.remove(
        "is-drop-before",
        "is-drop-inside",
        "is-drop-after",
        "is-slot-neighbor",
      );
    });

    this._dropTargetNodeId = null;
    this._dropZone = null;

    const draggedIds = this._dragState?.nodeIds ?? [];

    if (draggedIds.length === 0) {
      return;
    }

    // Hit-test against pre-drag layout boxes in scene space so sibling gap
    // transforms do not move the drop bands under the cursor.
    const viewportRect = this._host.viewport.getBoundingClientRect();
    const sceneX = (clientX - viewportRect.left - this._host.panX) / this._host.zoom;
    const sceneY = (clientY - viewportRect.top - this._host.panY) / this._host.zoom;

    const resolved = this.resolveDropAtScene(draggedIds, sceneX, sceneY);

    if (!resolved) {
      this.updateSlotPreview(draggedIds, sceneX, sceneY);
      return;
    }

    this._dropTargetNodeId = resolved.targetNodeId;
    this._dropZone = resolved.zone;

    const targetHost = this._host.cellNodes.get(resolved.targetNodeId);

    // Sibling slots use live gap animation; only "inside" keeps a ring hint.
    if (resolved.zone === "inside" && targetHost) {
      targetHost.classList.add("is-drop-inside");
    }

    this.updateSlotPreview(draggedIds, sceneX, sceneY);
  }

  /**
   * Resolve drop target from scene coordinates: card bands first, then the
   * empty gap between sibling cards (so the pointer can sit between two nodes).
   */
  resolveDropAtScene(
    draggedIds: readonly string[],
    sceneX: number,
    sceneY: number,
  ): { targetNodeId: string; zone: DropZone } | null {
    const { outline } = this._host.getOutlineSnapshot();
    let targetNodeId: string | null = null;
    let targetBase:
      | { left: number; top: number; width: number; height: number }
      | null = null;

    this._dragBasePositions.forEach((base, nodeId) => {
      if (
        this.isDraggedRelatedNode(outline, draggedIds, nodeId) ||
        !this._host.cellNodes.has(nodeId)
      ) {
        return;
      }

      if (
        sceneX >= base.left &&
        sceneX <= base.left + base.width &&
        sceneY >= base.top &&
        sceneY <= base.top + base.height
      ) {
        if (
          !targetBase ||
          base.width * base.height < targetBase.width * targetBase.height
        ) {
          targetNodeId = nodeId;
          targetBase = base;
        }
      }
    });

    if (targetNodeId && targetBase) {
      return {
        targetNodeId,
        zone: getDropZoneFromPointer(
          targetBase,
          sceneX,
          sceneY,
          this._host.treeDirection,
        ),
      };
    }

    const alongY =
      this._host.treeDirection === "LR" || this._host.treeDirection === "RL";
    const axis = alongY ? sceneY : sceneX;
    const cross = alongY ? sceneX : sceneY;
    const primaryId = draggedIds[0]!;
    const origin = findOutlineNode(outline, primaryId);
    const draggedSet = new Set(draggedIds);

    const candidates: Array<{
      targetNodeId: string;
      zone: "before" | "after";
      score: number;
    }> = [];

    const considerParent = (parent: OutlineNode, prefer: boolean) => {
      const items = parent.children
        .filter((child) => !draggedSet.has(child.id))
        .map((child) => {
          const base = this._dragBasePositions.get(child.id);

          if (!base) {
            return null;
          }

          return {
            id: child.id,
            start: alongY ? base.top : base.left,
            end: alongY ? base.top + base.height : base.left + base.width,
            crossStart: alongY ? base.left : base.top,
            crossEnd: alongY
              ? base.left + base.width
              : base.top + base.height,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const gap = resolveSiblingGapDrop(items, axis, cross, {
        // Stay in the sibling column; past the first/last sibling any distance
        // along the stack still means insert at top / bottom.
        crossPad: 64,
        extremeAxisPad: Number.POSITIVE_INFINITY,
      });

      if (!gap) {
        return;
      }

      candidates.push({
        targetNodeId: gap.targetNodeId,
        zone: gap.zone,
        score: prefer ? -1 : Math.abs(cross - (items[0]?.crossStart ?? 0)),
      });
    };

    if (origin) {
      considerParent(origin.parent, true);
    }

    const walk = (node: OutlineNode) => {
      if (!origin || node.id !== origin.parent.id) {
        considerParent(node, false);
      }

      node.children.forEach(walk);
    };

    walk(outline);

    if (candidates.length === 0) {
      // Empty space behind a card (tree-growth side) → nest as its child.
      const childLane = this.resolveChildLaneAtScene(
        draggedIds,
        sceneX,
        sceneY,
      );

      if (childLane) {
        return childLane;
      }

      return null;
    }

    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0]!;

    return { targetNodeId: best.targetNodeId, zone: best.zone };
  }

  /**
   * Pointer in the gutter behind a card (child side of the tree) counts as
   * nesting under that card — where the translucent placeholder will sit.
   */
  resolveChildLaneAtScene(
    draggedIds: readonly string[],
    sceneX: number,
    sceneY: number,
  ): { targetNodeId: string; zone: "inside" } | null {
    const { outline } = this._host.getOutlineSnapshot();
    const primaryId = draggedIds[0]!;
    const draggedBase = this._dragBasePositions.get(primaryId);
    const draggedSpan = draggedBase
      ? this._host.treeDirection === "LR" || this._host.treeDirection === "RL"
        ? draggedBase.width
        : draggedBase.height
      : LAYOUT_NODE_WIDTH.min * 0.35;
    const depth = this._host.childGap + Math.max(draggedSpan, 80);
    const crossPad = 28;

    let bestId: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    this._dragBasePositions.forEach((base, nodeId) => {
      if (
        this.isDraggedRelatedNode(outline, draggedIds, nodeId) ||
        !this._host.cellNodes.has(nodeId)
      ) {
        return;
      }

      let inLane = false;
      let score = Number.POSITIVE_INFINITY;

      switch (this._host.treeDirection) {
        case "LR": {
          const laneLeft = base.left + base.width;
          const laneRight = laneLeft + depth;
          inLane =
            sceneX >= laneLeft &&
            sceneX <= laneRight &&
            sceneY >= base.top - crossPad &&
            sceneY <= base.top + base.height + crossPad;
          score = Math.abs(sceneX - (laneLeft + this._host.childGap / 2));
          break;
        }
        case "RL": {
          const laneRight = base.left;
          const laneLeft = laneRight - depth;
          inLane =
            sceneX <= laneRight &&
            sceneX >= laneLeft &&
            sceneY >= base.top - crossPad &&
            sceneY <= base.top + base.height + crossPad;
          score = Math.abs(sceneX - (laneRight - this._host.childGap / 2));
          break;
        }
        case "TB": {
          const laneTop = base.top + base.height;
          const laneBottom = laneTop + depth;
          inLane =
            sceneY >= laneTop &&
            sceneY <= laneBottom &&
            sceneX >= base.left - crossPad &&
            sceneX <= base.left + base.width + crossPad;
          score = Math.abs(sceneY - (laneTop + this._host.childGap / 2));
          break;
        }
        case "BT": {
          const laneBottom = base.top;
          const laneTop = laneBottom - depth;
          inLane =
            sceneY <= laneBottom &&
            sceneY >= laneTop &&
            sceneX >= base.left - crossPad &&
            sceneX <= base.left + base.width + crossPad;
          score = Math.abs(sceneY - (laneBottom - this._host.childGap / 2));
          break;
        }
      }

      if (!inLane || score >= bestScore) {
        return;
      }

      bestScore = score;
      bestId = nodeId;
    });

    return bestId ? { targetNodeId: bestId, zone: "inside" } : null;
  }

  captureBasePositions(): void {
    this._dragBasePositions.clear();
    this._dragSlotPreviewKey = null;

    this._host.cellNodes.forEach((node, nodeId) => {
      this._dragBasePositions.set(nodeId, {
        left: Number.parseFloat(node.style.left) || 0,
        top: Number.parseFloat(node.style.top) || 0,
        width: node.offsetWidth,
        height: node.offsetHeight,
      });
    });
  }

  /**
   * Which side of a sibling insert gap the pointer sits on.
   * - `after`: pointer is past the gap (below for LR/RL, right for TB) →
   *   shift the before-side (upper/left) away to open space.
   * - `before`: pointer is before the gap (above / left) → shift the
   *   after-side (lower/right) away.
   */
  resolveSlotGapBias(
    neighborPrevId: string | null,
    neighborNextId: string | null,
    alongY: boolean,
    sceneX: number,
    sceneY: number,
  ): "before" | "after" {
    const prevBase = neighborPrevId
      ? this._dragBasePositions.get(neighborPrevId)
      : undefined;
    const nextBase = neighborNextId
      ? this._dragBasePositions.get(neighborNextId)
      : undefined;

    if (!prevBase && nextBase) {
      // Insert at start — only the after-side can move.
      return "before";
    }

    if (prevBase && !nextBase) {
      // Insert at end — only the before-side can move.
      return "after";
    }

    if (!prevBase || !nextBase) {
      return "before";
    }

    const gapMid = alongY
      ? (prevBase.top + prevBase.height + nextBase.top) / 2
      : (prevBase.left + prevBase.width + nextBase.left) / 2;
    const pointer = alongY ? sceneY : sceneX;

    return pointer >= gapMid ? "after" : "before";
  }

  /**
   * iOS-style drop preview: collapse the hole left by the dragged card,
   * open a gap at the before/after insert index, and move the translucent
   * placeholder into that intended drop slot. For “inside” (become child),
   * park the placeholder in the child lane behind the target — where the
   * node will appear after drop.
   *
   * Sibling gap bias: if the pointer is on the after side of the gap, the
   * before-side neighbors slide away (full slot); if on the before side, the
   * after-side neighbors slide away. The near side stays put.
   */
  updateSlotPreview(
    draggedIds: readonly string[],
    sceneX = 0,
    sceneY = 0,
  ): void {
    const alongY =
      this._host.treeDirection === "LR" || this._host.treeDirection === "RL";
    const primaryId = draggedIds[0];
    const draggedBase = primaryId
      ? this._dragBasePositions.get(primaryId)
      : undefined;
    const draggedSet = new Set(draggedIds);

    if (!primaryId || !draggedBase) {
      return;
    }

    const slotSize =
      draggedIds.reduce((total, nodeId) => {
        const base = this._dragBasePositions.get(nodeId);

        if (!base) {
          return total;
        }

        const span = alongY ? base.height : base.width;
        return total + span + this._host.siblingGap;
      }, 0) ||
      (alongY ? draggedBase.height : draggedBase.width) + this._host.siblingGap;

    const { outline } = this._host.getOutlineSnapshot();
    const origin = findOutlineNode(outline, primaryId);
    const offsets = new Map<string, number>();

    const addOffset = (nodeId: string, delta: number) => {
      offsets.set(nodeId, (offsets.get(nodeId) ?? 0) + delta);
    };

    /**
     * Close the holes left by every dragged root, per original parent, so a
     * multi-select that spans several parents collapses all of them.
     */
    const collapseOriginHoles = (): void => {
      const spanByParent = new Map<string, number>();

      draggedIds.forEach((nodeId) => {
        const located = findOutlineNode(outline, nodeId);
        const base = this._dragBasePositions.get(nodeId);

        if (!located || !base) {
          return;
        }

        const span = (alongY ? base.height : base.width) + this._host.siblingGap;
        spanByParent.set(
          located.parent.id,
          (spanByParent.get(located.parent.id) ?? 0) + span,
        );
      });

      const seen = new Set<string>();

      draggedIds.forEach((nodeId) => {
        const located = findOutlineNode(outline, nodeId);

        if (!located || seen.has(located.parent.id)) {
          return;
        }

        seen.add(located.parent.id);
        const size = spanByParent.get(located.parent.id) ?? slotSize;
        const firstDraggedIndex = located.parent.children.findIndex((child) =>
          draggedSet.has(child.id),
        );

        located.parent.children.forEach((child, index) => {
          if (!draggedSet.has(child.id) && index > firstDraggedIndex) {
            addOffset(child.id, -size);
          }
        });
      });
    };

    let previewKey = `origin:${origin?.parent.id ?? "none"}`;
    let neighborPrev: string | null = null;
    let neighborNext: string | null = null;
    /** Scene-space destination for the translucent drag-source card. */
    let placeholderLeft = draggedBase.left;
    let placeholderTop = draggedBase.top;
    let movePlaceholder = false;

    // Open a gap at the sibling drop index (before / after).
    if (
      this._dropTargetNodeId &&
      this._dropZone &&
      this._dropZone !== "inside"
    ) {
      const drop = resolveDropTarget(
        outline,
        primaryId,
        this._dropTargetNodeId,
        this._dropZone,
      );

      if (drop) {
        const parent =
          drop.parentId === "root"
            ? outline
            : (findOutlineNode(outline, drop.parentId)?.node ?? null);

        if (parent) {
          const remaining = parent.children.filter(
            (child) => !draggedSet.has(child.id),
          );
          let insertAt = drop.insertIndex;
          let removedBefore = 0;

          if (origin && origin.parent.id === parent.id) {
            parent.children.forEach((child, index) => {
              if (draggedSet.has(child.id) && index < drop.insertIndex) {
                removedBefore += 1;
              }
            });
          }

          insertAt -= removedBefore;
          insertAt = Math.max(0, Math.min(insertAt, remaining.length));

          const sameParentHome =
            !!origin &&
            origin.parent.id === parent.id &&
            (() => {
              // Compacted home index of the first dragged root among remaining.
              const firstDragged = parent.children.findIndex((child) =>
                draggedSet.has(child.id),
              );
              if (firstDragged < 0) {
                return false;
              }
              const compacted = parent.children
                .slice(0, firstDragged)
                .filter((child) => !draggedSet.has(child.id)).length;
              return insertAt === compacted;
            })();

          neighborPrev = remaining[insertAt - 1]?.id ?? null;
          neighborNext = remaining[insertAt]?.id ?? null;
          const gapBias = this.resolveSlotGapBias(
            neighborPrev,
            neighborNext,
            alongY,
            sceneX,
            sceneY,
          );
          previewKey = `slot:${parent.id}:${insertAt}:${gapBias}`;

          if (sameParentHome) {
            // Dropping back into the original slot — keep everyone still.
          } else if (origin && origin.parent.id === parent.id) {
            collapseOriginHoles();
            remaining.forEach((child, index) => {
              if (gapBias === "after") {
                if (index < insertAt) {
                  addOffset(child.id, -slotSize);
                }
              } else if (index >= insertAt) {
                addOffset(child.id, slotSize);
              }
            });
            movePlaceholder = true;
          } else {
            collapseOriginHoles();

            remaining.forEach((child, index) => {
              if (gapBias === "after") {
                if (index < insertAt) {
                  addOffset(child.id, -slotSize);
                }
              } else if (index >= insertAt) {
                addOffset(child.id, slotSize);
              }
            });
            movePlaceholder = true;
          }

          if (movePlaceholder) {
            if (neighborNext) {
              const nextBase = this._dragBasePositions.get(neighborNext);

              if (nextBase) {
                const nextShift = offsets.get(neighborNext) ?? 0;

                if (alongY) {
                  placeholderLeft = nextBase.left;
                  placeholderTop = nextBase.top + nextShift - slotSize;
                } else {
                  placeholderLeft = nextBase.left + nextShift - slotSize;
                  placeholderTop = nextBase.top;
                }
              }
            } else if (neighborPrev) {
              const prevBase = this._dragBasePositions.get(neighborPrev);

              if (prevBase) {
                const prevShift = offsets.get(neighborPrev) ?? 0;

                if (alongY) {
                  placeholderLeft = prevBase.left;
                  placeholderTop =
                    prevBase.top +
                    prevShift +
                    prevBase.height +
                    this._host.siblingGap;
                } else {
                  placeholderLeft =
                    prevBase.left +
                    prevShift +
                    prevBase.width +
                    this._host.siblingGap;
                  placeholderTop = prevBase.top;
                }
              }
            }
          }
        }
      }
    } else if (this._dropZone === "inside" && this._dropTargetNodeId) {
      previewKey = `inside:${this._dropTargetNodeId}`;

      const targetNode =
        this._dropTargetNodeId === "root"
          ? outline
          : (findOutlineNode(outline, this._dropTargetNodeId)?.node ?? null);
      const targetBase = this._dragBasePositions.get(this._dropTargetNodeId);
      const remainingChildren =
        targetNode?.children.filter((child) => !draggedSet.has(child.id)) ??
        [];
      const insertAt = remainingChildren.length;
      const sameParentHome =
        !!origin &&
        origin.parent.id === (targetNode?.id ?? "") &&
        (() => {
          const firstDragged = origin.parent.children.findIndex((child) =>
            draggedSet.has(child.id),
          );
          if (firstDragged < 0) {
            return false;
          }
          const compacted = origin.parent.children
            .slice(0, firstDragged)
            .filter((child) => !draggedSet.has(child.id)).length;
          return compacted === insertAt;
        })();

      neighborPrev = remainingChildren[insertAt - 1]?.id ?? null;

      if (!sameParentHome) {
        collapseOriginHoles();

        movePlaceholder = true;

        if (neighborPrev) {
          const prevBase = this._dragBasePositions.get(neighborPrev);

          if (prevBase) {
            const prevShift = offsets.get(neighborPrev) ?? 0;

            if (alongY) {
              // LR/RL: append below the last existing child.
              placeholderLeft = prevBase.left;
              placeholderTop =
                prevBase.top +
                prevShift +
                prevBase.height +
                this._host.siblingGap;
            } else {
              placeholderLeft =
                prevBase.left +
                prevShift +
                prevBase.width +
                this._host.siblingGap;
              placeholderTop = prevBase.top;
            }
          }
        } else if (targetBase) {
          // First child: sit in the growth-direction lane behind the parent.
          const gap = this._host.childGap;

          switch (this._host.treeDirection) {
            case "LR":
              placeholderLeft = targetBase.left + targetBase.width + gap;
              placeholderTop =
                targetBase.top +
                (targetBase.height - draggedBase.height) / 2;
              break;
            case "RL":
              placeholderLeft =
                targetBase.left - gap - draggedBase.width;
              placeholderTop =
                targetBase.top +
                (targetBase.height - draggedBase.height) / 2;
              break;
            case "TB":
              placeholderLeft =
                targetBase.left +
                (targetBase.width - draggedBase.width) / 2;
              placeholderTop = targetBase.top + targetBase.height + gap;
              break;
            case "BT":
              placeholderLeft =
                targetBase.left +
                (targetBase.width - draggedBase.width) / 2;
              placeholderTop =
                targetBase.top - gap - draggedBase.height;
              break;
          }
        }
      }
    } else if (origin) {
      // No sibling target yet — only collapse the origin hole.
      collapseOriginHoles();
    }

    if (previewKey === this._dragSlotPreviewKey) {
      return;
    }

    this._dragSlotPreviewKey = previewKey;

    const placeholderDx = movePlaceholder
      ? placeholderLeft - draggedBase.left
      : 0;
    const placeholderDy = movePlaceholder
      ? placeholderTop - draggedBase.top
      : 0;

    this._host.cellNodes.forEach((node, nodeId) => {
      node.classList.remove("is-slot-neighbor");

      if (draggedSet.has(nodeId)) {
        // Keep the primary card as the moving placeholder; others stay faded.
        if (nodeId === primaryId) {
          node.style.transform =
            placeholderDx === 0 && placeholderDy === 0
              ? ""
              : `translate(${placeholderDx}px, ${placeholderDy}px)`;
        } else {
          node.style.transform = "";
        }
        return;
      }

      const shift = offsets.get(nodeId) ?? 0;
      node.style.transform =
        shift === 0
          ? ""
          : alongY
            ? `translateY(${shift}px)`
            : `translateX(${shift}px)`;

      if (nodeId === neighborPrev || nodeId === neighborNext) {
        node.classList.add("is-slot-neighbor");
      }
    });

    // Keep connectors glued to the translucent placeholder / shifted siblings.
    this._host.refreshEdgesFromCache();
  }

  clearSlotPreview(): void {
    this._dragSlotPreviewKey = null;
    this._dragBasePositions.clear();
    this._host.cellNodes.forEach((node) => {
      node.style.transform = "";
      node.classList.remove("is-slot-neighbor");
    });
  }

  completeNodeDrag(draggedIds: readonly string[]): void {
    if (!this._dropTargetNodeId || !this._dropZone || draggedIds.length === 0) {
      return;
    }

    const primaryId = draggedIds[0]!;
    const { cells, outline } = this._host.getOutlineSnapshot();

    if (
      draggedIds.some(
        (nodeId) =>
          nodeId === this._dropTargetNodeId ||
          isOutlineDescendant(outline, nodeId, this._dropTargetNodeId!),
      )
    ) {
      return;
    }

    const dropTarget = resolveDropTarget(
      outline,
      primaryId,
      this._dropTargetNodeId,
      this._dropZone,
    );

    if (!dropTarget) {
      return;
    }

    const movedOutline = moveOutlineNodes(
      outline,
      draggedIds,
      dropTarget.parentId,
      dropTarget.insertIndex,
    );

    if (!movedOutline) {
      return;
    }

    const modelIds: string[] = [];
    let activeModelId = "";

    draggedIds.forEach((nodeId) => {
      const index = this._host.getCellIndexFromNodeId(nodeId);
      const cell = index >= 0 ? this._host.notebook.widgets[index] : null;

      if (!cell) {
        return;
      }

      modelIds.push(cell.model.id);

      if (nodeId === primaryId) {
        activeModelId = cell.model.id;
      }
    });

    // Freeze the camera before cells reorder / layout so the window does not
    // chase the moved node (notebook sync + ensure-visible would pan otherwise).
    this._host.cancelCenterFollow();
    this._host.lockViewportPan(VIEWPORT_PAN_LOCK_MS);
    this._host.holdViewportPan();
    extendQuietNotebookSync(VIEWPORT_PAN_LOCK_MS);
    this._host.setViewportAnchor(null);
    this._host.setPendingFocusCellIndex(null);
    this._host.setPendingFocusCenter(false);

    this._host.setApplyingNotebookChange(true);

    try {
      applyOutlineToNotebook(this._host.context.model, movedOutline, cells);
    } catch (error) {
      // A partial reorder cannot be undone safely here; resync the canvas
      // from the notebook so it shows what is actually in the model.
      console.error("jupyterlab-kuusi: node drop failed", error);
      this._host.invalidateOutlineCache();
      this.clearSlotPreview();
      this._host.applyLayout();
      return;
    } finally {
      this._host.setApplyingNotebookChange(false);
    }

    if (modelIds.length > 0) {
      this._host.selectCellsByModelIds(modelIds, activeModelId || modelIds[0]!);
    }

    this._host.invalidateOutlineCache();
    this.clearSlotPreview();
    this._host.applyLayout();
  }

  clearUi(): void {
    this._dragGhost?.remove();
    this._dragGhost = null;
    this._dropTargetNodeId = null;
    this._dropZone = null;
    this._host.viewport.classList.remove("is-node-dragging");
    this.clearSlotPreview();
    this._host.cellNodes.forEach((node) => {
      node.classList.remove(
        "is-drop-before",
        "is-drop-inside",
        "is-drop-after",
        "is-drag-source",
        "is-slot-neighbor",
      );
    });
    this._host.refreshEdgesFromCache();
  }

  readCssTranslate(node: HTMLElement): { x: number; y: number } {
    const value = node.style.transform;

    if (!value || value === "none") {
      return { x: 0, y: 0 };
    }

    if (value.startsWith("translateX(")) {
      return { x: Number.parseFloat(value.slice(11)) || 0, y: 0 };
    }

    if (value.startsWith("translateY(")) {
      return { x: 0, y: Number.parseFloat(value.slice(11)) || 0 };
    }

    const match = /^translate\(\s*([^,)]+)\s*(?:,\s*([^)]+))?\)/.exec(value);

    if (!match) {
      return { x: 0, y: 0 };
    }

    return {
      x: Number.parseFloat(match[1]!) || 0,
      y: match[2] ? Number.parseFloat(match[2]!) || 0 : 0,
    };
  }

}
