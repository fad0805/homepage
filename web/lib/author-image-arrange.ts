import { type Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** Set on a dragged image so the editor can move it instead of copying it. */
export const AUTHOR_IMAGE_DRAG_MIME = "application/x-author-image-pos";

// Fallback for browsers that drop custom dataTransfer types. The drag source
// is remembered here as well so the drop is always treated as a move.
let activeImageDrag: { view: EditorView; pos: number } | null = null;

type LocatedNode = { node: PMNode; pos: number; dom: HTMLElement };

type DropTarget =
  | ({ kind: "image"; after: boolean } & LocatedNode)
  | ({ kind: "row" } & LocatedNode)
  | { kind: "fallback"; pos: number };

type RowInfo = { pos: number; node: PMNode; childIndex: number };

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
  // Browsers report different drop targets: some give the image wrapper,
  // others give the editor root even when the pointer is over an image. Check
  // the event target first, then fall back to the element under the pointer.
  const candidates = [
    eventTarget && view.dom.contains(eventTarget) ? eventTarget : null,
    pointTarget,
  ].filter((element): element is HTMLElement => Boolean(element));
  // Tiptap's NodeView has an inner .author-image-node and an outer
  // .react-renderer wrapper. A drop may land on either one.
  const imageEl = candidates
    .map((element) =>
      (element.closest?.(".author-image-node") ??
        element.closest?.(".react-renderer.node-image")) as HTMLElement | null,
    )
    .find(Boolean) ?? null;
  const rowEl = candidates
    .map((element) => element.closest?.(".author-image-row") as HTMLElement | null)
    .find(Boolean) ?? null;

  const images: LocatedNode[] = [];
  const rows: LocatedNode[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "image" && node.type.name !== "imageRow") {
      return true;
    }
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom) return node.type.name !== "image";
    if (
      node.type.name === "image" &&
      images.length === 0 &&
      imageEl &&
      (dom === imageEl || dom.contains(imageEl))
    ) {
      images.push({ node, pos, dom });
    }
    if (
      node.type.name === "imageRow" &&
      rows.length === 0 &&
      rowEl &&
      (dom === rowEl || dom.contains(rowEl))
    ) {
      rows.push({ node, pos, dom });
    }
    return node.type.name !== "image";
  });

  if (images.length > 0) {
    const image = images[0];
    const rect = image.dom.getBoundingClientRect();
    return {
      kind: "image",
      ...image,
      after: event.clientX >= rect.left + rect.width / 2,
    };
  }
  if (rows.length > 0) return { kind: "row", ...rows[0] };

  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  return {
    kind: "fallback",
    pos: coords?.pos ?? view.state.doc.content.size,
  };
}

/** Return the imageRow containing ``pos``, if any, at any document depth. */
function enclosingRow(doc: PMNode, pos: number): RowInfo | null {
  const bounded = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(bounded);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "imageRow") {
      return {
        pos: $pos.before(depth),
        node,
        childIndex: $pos.index(depth),
      };
    }
  }
  return null;
}

/** Position before ``childIndex`` inside a row node. */
function childInsertPos(rowPos: number, row: PMNode, childIndex: number) {
  let pos = rowPos + 1;
  for (let index = 0; index < childIndex; index += 1) {
    pos += row.child(index).nodeSize;
  }
  return pos;
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
 *
 * Images may live inside lists or other nested blocks, so positions are
 * mapped through the deletion instead of rebuilding only the top-level nodes.
 */
export function moveDraggedImage(view: EditorView, event: DragEvent): boolean {
  const raw = event.dataTransfer?.getData(AUTHOR_IMAGE_DRAG_MIME);
  const fallback = activeImageDrag?.view === view ? activeImageDrag.pos : null;
  activeImageDrag = null;

  let from = raw ? Number(raw) : NaN;
  if (!Number.isInteger(from) && fallback !== null) from = fallback;

  const doc = view.state.doc;
  const source = Number.isInteger(from) ? doc.nodeAt(from) : null;
  if (!source || source.type.name !== "image") return false;

  const target = findDropTarget(view, event);
  if (target.kind === "image" && target.pos === from) return true;

  // An image that is the only child of a row cannot be removed on its own:
  // the row requires at least one image, so remove the whole row instead.
  let deleteFrom = from;
  let deleteTo = from + source.nodeSize;
  const sourceRow = enclosingRow(doc, from);
  if (sourceRow && sourceRow.node.childCount === 1) {
    deleteFrom = sourceRow.pos;
    deleteTo = sourceRow.pos + sourceRow.node.nodeSize;
  }

  const tr = view.state.tr;
  tr.delete(deleteFrom, deleteTo);

  const targetRemoved = target.pos >= deleteFrom && target.pos < deleteTo;
  const effective: DropTarget = targetRemoved
    ? { kind: "fallback", pos: deleteFrom }
    : target;
  // Node-start positions stick to the node when the source was removed from
  // before it, so map with a negative association.
  const insertAt = tr.mapping.map(effective.pos, -1);
  const rowType = view.state.schema.nodes.imageRow;
  const safePos = Math.min(Math.max(insertAt, 0), tr.doc.content.size);

  if (effective.kind === "image") {
    const targetImage = tr.doc.nodeAt(safePos);
    if (targetImage?.type.name === "image") {
      const row = enclosingRow(tr.doc, safePos);
      if (!row) {
        const images = effective.after
          ? [targetImage, source]
          : [source, targetImage];
        tr.replaceWith(
          safePos,
          safePos + targetImage.nodeSize,
          rowType.create({ align: "center" }, images),
        );
      } else {
        const childIndex = row.childIndex + (effective.after ? 1 : 0);
        tr.insert(childInsertPos(row.pos, row.node, childIndex), source);
      }
    } else {
      tr.insert(safePos, source);
    }
  } else if (effective.kind === "row") {
    const targetRow = tr.doc.nodeAt(safePos);
    if (targetRow?.type.name === "imageRow") {
      tr.insert(safePos + targetRow.nodeSize - 1, source);
    } else {
      tr.insert(safePos, source);
    }
  } else {
    tr.insert(safePos, source);
  }

  let sourcePos = -1;
  tr.doc.descendants((node, pos) => {
    if (node === source) {
      sourcePos = pos;
      return false;
    }
    return true;
  });
  if (sourcePos >= 0) {
    tr.setSelection(NodeSelection.create(tr.doc, sourcePos));
  }

  view.dispatch(tr);
  return true;
}
