import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** Set on a dragged image so the editor can move it instead of copying it. */
export const AUTHOR_IMAGE_DRAG_MIME = "application/x-author-image-pos";

// Fallback for browsers that drop custom dataTransfer types. The drag source
// is remembered here as well so the drop is always treated as a move.
let activeImageDrag: { view: EditorView; pos: number } | null = null;

type LocatedNode = { node: PMNode; pos: number; dom: HTMLElement };

type DropTarget =
  | ({ kind: "image" } & LocatedNode)
  | ({ kind: "row" } & LocatedNode)
  | { kind: "fallback"; index: number };

function imageRowType(view: EditorView) {
  return view.state.schema.nodes.imageRow;
}

function topLevelUnits(doc: PMNode): PMNode[] {
  const units: PMNode[] = [];
  doc.forEach((node) => units.push(node));
  return units;
}

function findUnit(units: PMNode[], node: PMNode) {
  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];
    if (unit === node) return { unitIndex, childIndex: -1 };

    if (unit.type.name === "imageRow") {
      let childIndex = 0;
      for (const child of unit.children) {
        if (child === node) return { unitIndex, childIndex };
        childIndex += 1;
      }
    }
  }
  return null;
}

function removeChild(unit: PMNode, childIndex: number): PMNode | null {
  const children = [...unit.children];
  children.splice(childIndex, 1);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return unit.type.create(unit.attrs, children);
}

/** Keep a dragged image in a row, splitting into a second row at four images. */
function insertIntoRow(unit: PMNode, childIndex: number, image: PMNode) {
  const children = [...unit.children];
  children.splice(childIndex, 0, image);
  if (children.length <= 3) {
    return [unit.type.create(unit.attrs, children)];
  }
  return [
    unit.type.create(unit.attrs, children.slice(0, 3)),
    unit.type.create(unit.attrs, children.slice(3)),
  ];
}

function findDraggedImagePos(view: EditorView, event: DragEvent) {
  const target = event.target as HTMLElement | null;
  const wrapper = target?.closest?.(".react-renderer.node-image") as
    | HTMLElement
    | null;
  if (!wrapper) return null;

  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== "image") return true;
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (dom === wrapper || dom?.contains(wrapper)) found = pos;
    return false;
  });
  return found;
}

function findDropTarget(view: EditorView, event: DragEvent): DropTarget {
  const eventTarget = event.target as HTMLElement | null;
  const pointTarget = document.elementFromPoint(event.clientX, event.clientY) as
    | HTMLElement
    | null;
  // The drop event target is the element the user actually dropped on. Prefer
  // it when it belongs to this editor; elementFromPoint can hit an overlay.
  const element =
    eventTarget && view.dom.contains(eventTarget)
      ? eventTarget
      : (pointTarget ?? eventTarget);
  // Tiptap's NodeView has an inner .author-image-node and an outer
  // .react-renderer wrapper. A drop may land on either one.
  const imageEl =
    (element?.closest?.(".author-image-node") as HTMLElement | null) ??
    (element?.closest?.(".react-renderer.node-image") as HTMLElement | null);
  const rowEl = element?.closest?.(".author-image-row") as HTMLElement | null;

  const images: LocatedNode[] = [];
  const rows: LocatedNode[] = [];
  view.state.doc.descendants((node, pos) => {
    if (
      node.type.name !== "image" &&
      node.type.name !== "imageRow"
    ) {
      return true;
    }
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom) return node.type.name !== "image";
    if (
      node.type.name === "image" &&
      imageEl &&
      (dom === imageEl || dom.contains(imageEl))
    ) {
      images.push({ node, pos, dom });
    }
    if (
      node.type.name === "imageRow" &&
      rowEl &&
      (dom === rowEl || dom.contains(rowEl))
    ) {
      rows.push({ node, pos, dom });
    }
    return node.type.name !== "image";
  });

  if (images.length > 0) return { kind: "image", ...images[0] };
  if (rows.length > 0) return { kind: "row", ...rows[0] };

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) return { kind: "fallback", index: -1 };
  const $pos = view.state.doc.resolve(
    Math.min(coords.pos, view.state.doc.content.size),
  );
  return {
    kind: "fallback",
    index: $pos.depth > 0 ? $pos.index(0) : $pos.index(),
  };
}

function dropAfter(event: DragEvent, dom: HTMLElement) {
  const rect = dom.getBoundingClientRect();
  return event.clientX >= rect.left + rect.width / 2;
}

/**
 * Register where the drag began so the drop handler can move the node.
 * ProseMirror's built-in dragstart still supplies the standard clipboard
 * payload browsers need before they will fire dragover/drop at all.
 */
export function markImageDragStart(view: EditorView, event: DragEvent) {
  const pos = findDraggedImagePos(view, event);
  if (pos === null) return false;
  activeImageDrag = { view, pos };
  if (event.dataTransfer) {
    event.dataTransfer.setData(AUTHOR_IMAGE_DRAG_MIME, String(pos));
  }
  return false;
}

/** Clear the remembered drag source when a drag ends outside the editor. */
export function endImageDrag() {
  activeImageDrag = null;
}

/** True while an image from this editor is being dragged. */
export function isImageDragActive() {
  return activeImageDrag !== null;
}

/**
 * Move the dragged image to the drop position. Dropping it onto another image
 * (or into a row) groups the images side by side; dropping it elsewhere makes
 * it a standalone image again. The original node is always removed first, so
 * a drag never produces a duplicate.
 */
export function moveDraggedImage(view: EditorView, event: DragEvent): boolean {
  const raw = event.dataTransfer?.getData(AUTHOR_IMAGE_DRAG_MIME);
  const fallback = activeImageDrag?.view === view ? activeImageDrag.pos : null;
  activeImageDrag = null;

  let from = raw ? Number(raw) : NaN;
  if (!Number.isInteger(from) && fallback !== null) from = fallback;

  const doc = view.state.doc;
  let source = Number.isInteger(from) ? doc.nodeAt(from) : null;
  if (!source && fallback !== null) {
    from = fallback;
    source = doc.nodeAt(from);
  }
  if (!source || source.type.name !== "image") {
    return false;
  }

  const target = findDropTarget(view, event);
  const units = topLevelUnits(doc);
  const sourceLocation = findUnit(units, source);
  if (!sourceLocation) return false;

  if (target.kind === "image" && target.node === source) {
    return true;
  }

  const sourceRow =
    sourceLocation.childIndex >= 0 ? units[sourceLocation.unitIndex] : null;
  let targetImage: PMNode | null =
    target.kind === "image" ? target.node : null;
  let targetRow: PMNode | null = target.kind === "row" ? target.node : null;
  let fallbackIndex = target.kind === "fallback" ? target.index : -1;
  const after =
    target.kind === "image" ? dropAfter(event, target.dom) : false;

  if (sourceLocation.childIndex === -1) {
    units.splice(sourceLocation.unitIndex, 1);
  } else {
    const replacement = removeChild(
      units[sourceLocation.unitIndex],
      sourceLocation.childIndex,
    );
    if (replacement) {
      units[sourceLocation.unitIndex] = replacement;
    } else {
      units.splice(sourceLocation.unitIndex, 1);
    }

    // Dragging within one row: retarget to whatever is left of that row.
    if (sourceRow && targetRow === sourceRow) {
      targetRow =
        replacement?.type.name === "imageRow" ? replacement : null;
      if (replacement?.type.name === "image") {
        targetImage = replacement;
        targetRow = null;
      }
      if (!replacement) fallbackIndex = sourceLocation.unitIndex;
    }
  }

  // A one-image row collapses to the image itself; don't group an image with
  // itself when it was dropped on that row's empty space.
  if (targetImage === source) {
    targetImage = null;
    targetRow = null;
    fallbackIndex = sourceLocation.unitIndex;
  }

  if (
    fallbackIndex >= 0 &&
    sourceLocation.childIndex === -1 &&
    sourceLocation.unitIndex < fallbackIndex
  ) {
    fallbackIndex -= 1;
  }
  if (fallbackIndex > units.length) fallbackIndex = units.length;

  const imageLocation = targetImage ? findUnit(units, targetImage) : null;
  const rowLocation = targetRow ? findUnit(units, targetRow) : null;
  const rowNode = imageRowType(view);

  if (imageLocation && imageLocation.childIndex === -1) {
    const standalone = units[imageLocation.unitIndex];
    units[imageLocation.unitIndex] = rowNode.create(
      { align: "center" },
      after ? [standalone, source] : [source, standalone],
    );
  } else if (imageLocation) {
    const unit = units[imageLocation.unitIndex];
    units.splice(
      imageLocation.unitIndex,
      1,
      ...insertIntoRow(
        unit,
        imageLocation.childIndex + (after ? 1 : 0),
        source,
      ),
    );
  } else if (rowLocation) {
    const unit = units[rowLocation.unitIndex];
    units.splice(
      rowLocation.unitIndex,
      1,
      ...insertIntoRow(unit, unit.childCount, source),
    );
  } else {
    units.splice(fallbackIndex >= 0 ? fallbackIndex : units.length, 0, source);
  }

  const finalLocation = findUnit(units, source);
  let position = 0;
  if (finalLocation) {
    for (let index = 0; index < finalLocation.unitIndex; index += 1) {
      position += units[index].nodeSize;
    }
    if (finalLocation.childIndex >= 0) {
      position += 1;
      let index = 0;
      for (const child of units[finalLocation.unitIndex].children) {
        if (index >= finalLocation.childIndex) break;
        position += child.nodeSize;
        index += 1;
      }
    }
  }

  const tr = view.state.tr;
  tr.replaceWith(0, doc.content.size, Fragment.fromArray(units));
  if (finalLocation) {
    const targetPos = Math.min(position, tr.doc.content.size - 1);
    if (targetPos >= 0) {
      tr.setSelection(NodeSelection.create(tr.doc, targetPos));
    }
  }
  view.dispatch(tr);
  return true;
}
