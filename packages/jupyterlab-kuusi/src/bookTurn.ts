/**
 * Apple Books–inspired page turn for Book view: peel leaf + gesture helpers.
 */

export const BOOK_TURN_LEAF_CLASS = "jp-KuusiBook-turnLeaf";
export const BOOK_TURN_NEXT_CLASS = "is-kuusi-book-turn-next";
export const BOOK_TURN_PREV_CLASS = "is-kuusi-book-turn-prev";
export const BOOK_TURNING_CLASS = "is-kuusi-book-turning";
export const BOOK_DRAG_CLASS = "is-kuusi-book-drag-turning";

/** Soft settle tuned like Books' page settle (ms). */
export const BOOK_TURN_MS = 480;
/** Fraction of stage width that counts as an edge tap. */
export const BOOK_EDGE_TAP_RATIO = 0.22;
/** Drag distance (ratio of width) to commit a turn. */
export const BOOK_TURN_COMMIT_RATIO = 0.18;
/** px/ms — flick past this commits even with a short drag. */
export const BOOK_TURN_FLICK_VX = 0.55;

export const prefersReducedBookMotion = (): boolean =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

export const ensureBookTurnLeaf = (stage: HTMLElement): HTMLElement => {
  let leaf = stage.querySelector<HTMLElement>(`.${BOOK_TURN_LEAF_CLASS}`);
  if (!leaf) {
    leaf = document.createElement("div");
    leaf.className = BOOK_TURN_LEAF_CLASS;
    leaf.setAttribute("aria-hidden", "true");
    const front = document.createElement("div");
    front.className = "jp-KuusiBook-turnLeaf-front";
    const shade = document.createElement("div");
    shade.className = "jp-KuusiBook-turnLeaf-shade";
    const gloss = document.createElement("div");
    gloss.className = "jp-KuusiBook-turnLeaf-gloss";
    leaf.append(front, shade, gloss);
    stage.appendChild(leaf);
  }
  return leaf;
};

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const waitAnimationEnd = (
  el: HTMLElement,
  fallbackMs: number,
): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) {
        return;
      }
      done = true;
      el.removeEventListener("animationend", onEnd);
      resolve();
    };
    const onEnd = (event: AnimationEvent): void => {
      if (event.target === el) {
        finish();
      }
    };
    el.addEventListener("animationend", onEnd);
    window.setTimeout(finish, fallbackMs + 80);
  });

export type BookTurnDirection = 1 | -1;

/**
 * Run a peel-turn, swapping the opening at the midpoint of the animation.
 */
export const playBookPageTurn = async (
  stage: HTMLElement,
  direction: BookTurnDirection,
  applyOpening: () => void,
): Promise<void> => {
  ensureBookTurnLeaf(stage);

  if (prefersReducedBookMotion()) {
    applyOpening();
    return;
  }

  stage.classList.remove(BOOK_TURN_NEXT_CLASS, BOOK_TURN_PREV_CLASS);
  stage.classList.add(
    BOOK_TURNING_CLASS,
    direction > 0 ? BOOK_TURN_NEXT_CLASS : BOOK_TURN_PREV_CLASS,
  );

  const mid = Math.round(BOOK_TURN_MS * 0.38);
  await waitMs(mid);
  applyOpening();
  await waitAnimationEnd(stage, BOOK_TURN_MS);

  stage.classList.remove(
    BOOK_TURNING_CLASS,
    BOOK_TURN_NEXT_CLASS,
    BOOK_TURN_PREV_CLASS,
  );
  stage.style.removeProperty("--kuusi-book-turn-progress");
};

/** Map horizontal drag to 0…1 turn progress (direction-aware). */
export const dragTurnProgress = (
  deltaX: number,
  width: number,
  direction: BookTurnDirection,
): number => {
  const raw = direction > 0 ? -deltaX / width : deltaX / width;
  return Math.min(1, Math.max(0, raw));
};

export const shouldCommitTurn = (
  progress: number,
  velocityX: number,
  direction: BookTurnDirection,
): boolean => {
  const flick =
    direction > 0
      ? velocityX <= -BOOK_TURN_FLICK_VX
      : velocityX >= BOOK_TURN_FLICK_VX;
  return progress >= BOOK_TURN_COMMIT_RATIO || flick;
};
