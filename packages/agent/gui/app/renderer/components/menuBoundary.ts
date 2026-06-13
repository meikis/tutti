export const MENU_BOUNDARY_PADDING = 8;

export interface MenuBoundaryRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MENU_BOUNDARY_SELECTOR =
  '.tutti-window, .workspace-node-window, [data-workspace-node-window-root="true"]';

function viewportBoundary(): MenuBoundaryRect {
  return {
    left: 0,
    top: 0,
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight
  };
}

function rectToBoundary(rect: DOMRect): MenuBoundaryRect {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  };
}

export function resolveMenuBoundaryFromElement(
  element: Element | null
): MenuBoundaryRect {
  const boundaryElement = element?.closest(MENU_BOUNDARY_SELECTOR);
  if (!boundaryElement) {
    return viewportBoundary();
  }

  return rectToBoundary(boundaryElement.getBoundingClientRect());
}

export function resolveMenuBoundaryFromPoint(point: {
  x: number;
  y: number;
}): MenuBoundaryRect {
  if (
    typeof document === "undefined" ||
    typeof document.elementsFromPoint !== "function"
  ) {
    return viewportBoundary();
  }

  for (const element of document.elementsFromPoint(point.x, point.y)) {
    const boundaryElement = element.closest(MENU_BOUNDARY_SELECTOR);
    if (boundaryElement) {
      return rectToBoundary(boundaryElement.getBoundingClientRect());
    }
  }

  return viewportBoundary();
}

export function clampMenuPositionToBoundary(options: {
  left: number;
  top: number;
  width: number;
  height: number;
  boundary: MenuBoundaryRect;
  padding?: number;
}): { left: number; top: number } {
  const padding = options.padding ?? MENU_BOUNDARY_PADDING;
  const minLeft = options.boundary.left + padding;
  const minTop = options.boundary.top + padding;
  const maxLeft = Math.max(
    minLeft,
    options.boundary.left + options.boundary.width - padding - options.width
  );
  const maxTop = Math.max(
    minTop,
    options.boundary.top + options.boundary.height - padding - options.height
  );

  return {
    left: Math.max(minLeft, Math.min(options.left, maxLeft)),
    top: Math.max(minTop, Math.min(options.top, maxTop))
  };
}
