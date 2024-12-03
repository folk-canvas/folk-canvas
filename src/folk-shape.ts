import { css, html } from './common/tags';
import { ResizeObserverManager } from './common/resize-observer';
import type { Point, RotatedDOMRect } from './common/types';
import { Vector } from './common/Vector';

const resizeObserver = new ResizeObserverManager();

export type Shape = 'rectangle' | 'circle' | 'triangle';

type Handle = 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw' | 'rotation' | 'move';

const resizeCursorUrl = (degrees: number) =>
  `url("data:image/svg+xml,<svg height='32' width='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg'><g fill='none' transform='rotate(${degrees} 16 16)'><path d='M9 9L21 21M9 9H12L9 12V9ZM21 21V18L18 21H21Z' stroke='white' stroke-width='3' stroke-linejoin='miter'/><path d='M9 9L21 21M9 9H12L9 12V9ZM21 21V18L18 21H21Z' stroke='black' stroke-width='1.5' stroke-linejoin='miter'/></g></svg>") 16 16, nwse-resize`;
const rotateCursorUrl = (degrees: number) =>
  `url("data:image/svg+xml,<svg height='32' width='32' viewBox='0 0 32 32' xmlns='http://www.w3.org/2000/svg' style='color: black;'><defs><filter id='shadow' y='-40%' x='-40%' width='180%' height='180%' color-interpolation-filters='sRGB'><feDropShadow dx='1' dy='1' stdDeviation='1.2' flood-opacity='.5'/></filter></defs><g fill='none' transform='rotate(${
    degrees + 45
  } 16 16)' filter='url(%23shadow)'><path d='M22.4789 9.45728L25.9935 12.9942L22.4789 16.5283V14.1032C18.126 14.1502 14.6071 17.6737 14.5675 22.0283H17.05L13.513 25.543L9.97889 22.0283H12.5674C12.6071 16.5691 17.0214 12.1503 22.4789 12.1031L22.4789 9.45728Z' fill='black'/><path fill-rule='evenodd' clip-rule='evenodd' d='M21.4789 7.03223L27.4035 12.9945L21.4789 18.9521V15.1868C18.4798 15.6549 16.1113 18.0273 15.649 21.0284H19.475L13.5128 26.953L7.55519 21.0284H11.6189C12.1243 15.8155 16.2679 11.6677 21.4789 11.1559L21.4789 7.03223ZM22.4789 12.1031C17.0214 12.1503 12.6071 16.5691 12.5674 22.0284H9.97889L13.513 25.543L17.05 22.0284H14.5675C14.5705 21.6896 14.5947 21.3558 14.6386 21.0284C15.1157 17.4741 17.9266 14.6592 21.4789 14.1761C21.8063 14.1316 22.1401 14.1069 22.4789 14.1032V16.5284L25.9935 12.9942L22.4789 9.45729L22.4789 12.1031Z' fill='white'/></g></svg>") 16 16, pointer`;

export type TransformEventDetail = {
  rotate: number;
};

// TODO: expose previous and current rects
export class TransformEvent extends Event {
  constructor() {
    super('transform', { cancelable: true, bubbles: true });
  }

  #xPrevented = false;
  get xPrevented() {
    return this.defaultPrevented || this.#xPrevented;
  }
  preventX() {
    this.#xPrevented = true;
  }

  #yPrevented = false;
  get yPrevented() {
    return this.defaultPrevented || this.#yPrevented;
  }
  preventY() {
    this.#yPrevented = true;
  }

  #heightPrevented = false;
  get heightPrevented() {
    return this.defaultPrevented || this.#heightPrevented;
  }
  preventHeight() {
    this.#heightPrevented = true;
  }

  #widthPrevented = false;
  get widthPrevented() {
    return this.defaultPrevented || this.#widthPrevented;
  }
  preventWidth() {
    this.#widthPrevented = true;
  }

  #rotatePrevented = false;
  get rotatePrevented() {
    return this.defaultPrevented || this.#rotatePrevented;
  }
  preventRotate() {
    this.#rotatePrevented = true;
  }
}

export type Dimension = number | 'auto';

const styles = new CSSStyleSheet();
styles.replaceSync(css`
  :host {
    display: block;
    position: absolute;
    cursor: var(--fc-move, move);
    box-sizing: border-box;
  }

  :host::before {
    content: '';
    position: absolute;
    inset: -15px -15px -15px -15px;
    z-index: -1;
  }

  div {
    height: 100%;
    width: 100%;
    overflow: hidden;
    pointer-events: none;
  }

  ::slotted(*) {
    cursor: default;
    pointer-events: auto;
  }

  :host(:focus-within) {
    z-index: calc(infinity - 1);
    outline: solid 1px hsl(214, 84%, 56%);
  }

  :host(:hover) {
    outline: solid 2px hsl(214, 84%, 56%);
  }

  :host(:state(move)),
  :host(:state(rotate)),
  :host(:state(resize-nw)),
  :host(:state(resize-ne)),
  :host(:state(resize-se)),
  :host(:state(resize-sw)) {
    user-select: none;
  }

  [part='resize-nw'],
  [part='resize-ne'],
  [part='resize-se'],
  [part='resize-sw'] {
    display: block;
    position: absolute;
    box-sizing: border-box;
    padding: 0;
    background: hsl(210, 20%, 98%);
    z-index: calc(infinity);
    width: 9px;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border: 1.5px solid hsl(214, 84%, 56%);
    border-radius: 2px;
  }

  [part='resize-nw'] {
    top: 0;
    left: 0;
  }

  [part='resize-ne'] {
    top: 0;
    left: 100%;
  }

  [part='resize-se'] {
    top: 100%;
    left: 100%;
  }

  [part='resize-sw'] {
    top: 100%;
    left: 0;
  }

  [part='resize-nw'],
  [part='resize-se'] {
    cursor: var(--fc-nwse-resize, url('${resizeCursorUrl(0)}') 16 16, nwse-resize);
  }

  [part='resize-ne'],
  [part='resize-sw'] {
    cursor: var(--fc-nesw-resize, url('${resizeCursorUrl(0)}') 16 16, nesw-resize);
  }

  [part='rotation'] {
    z-index: calc(infinity);
    display: block;
    position: absolute;
    box-sizing: border-box;
    padding: 0;
    border: 1.5px solid hsl(214, 84%, 56%);
    border-radius: 50%;
    background: hsl(210, 20%, 98%);
    width: 11px;
    aspect-ratio: 1;
    top: 0;
    left: 50%;
    translate: -50% -150%;
    cursor: var(--fc-rotate, url('${rotateCursorUrl(0)}') 16 16, pointer);
  }

  :state(rotate) {
    cursor: var(--fc-rotate, url('${rotateCursorUrl(0)}') 16 16, pointer) !important;
  }

  :host(:not(:focus-within)) [part^='resize'],
  :host(:not(:focus-within)) [part='rotation'] {
    opacity: 0;
    cursor: default;
  }
`);

declare global {
  interface HTMLElementTagNameMap {
    'folk-shape': FolkShape;
  }
}

// TODO: add z coordinate?
export class FolkShape extends HTMLElement {
  static tagName = 'folk-shape';

  static define() {
    customElements.define(this.tagName, this);
  }

  #shadow = this.attachShadow({ mode: 'open', delegatesFocus: true });

  #internals = this.attachInternals();

  #type = (this.getAttribute('type') || 'rectangle') as Shape;
  get type(): Shape {
    return this.#type;
  }

  set type(type: Shape) {
    this.setAttribute('type', type);
  }

  #previousX = 0;
  #x = Number(this.getAttribute('x')) || 0;
  get x() {
    return this.#x;
  }

  set x(x) {
    this.#previousX = this.#x;
    this.#x = x;
    this.#requestUpdate('x');
  }

  #previousY = 0;
  #y = Number(this.getAttribute('y')) || 0;
  get y() {
    return this.#y;
  }

  set y(y) {
    this.#previousY = this.#y;
    this.#y = y;
    this.#requestUpdate('y');
  }

  #autoContentRect = this.getBoundingClientRect();

  #previousWidth: Dimension = 0;
  #width: Dimension = 0;
  get width(): number {
    if (this.#width === 'auto') {
      return this.#autoContentRect.width;
    }
    return this.#width;
  }

  set width(width: Dimension) {
    if (width === 'auto') {
      resizeObserver.observe(this, this.#onAutoResize);
    } else if (this.#width === 'auto' && this.#height !== 'auto') {
      resizeObserver.unobserve(this, this.#onAutoResize);
    }
    this.#previousWidth = this.#width;
    this.#width = width;
    this.#requestUpdate('width');
  }

  #previousHeight: Dimension = 0;
  #height: Dimension = 0;
  get height(): number {
    if (this.#height === 'auto') {
      return this.#autoContentRect.height;
    }
    return this.#height;
  }

  set height(height: Dimension) {
    if (height === 'auto') {
      resizeObserver.observe(this, this.#onAutoResize);
    } else if (this.#height === 'auto' && this.#width !== 'auto') {
      resizeObserver.unobserve(this, this.#onAutoResize);
    }

    this.#previousHeight = this.#height;
    this.#height = height;
    this.#requestUpdate('height');
  }

  #initialRotation = 0;
  #startAngle = 0;
  #previousRotation = 0;

  // use degrees in the DOM, but store in radians internally
  #rotation = (Number(this.getAttribute('rotation')) || 0) * (Math.PI / 180);

  get rotation(): number {
    return this.#rotation;
  }

  set rotation(rotation: number) {
    this.#previousRotation = this.#rotation;
    this.#rotation = rotation;
    this.#requestUpdate('rotation');
  }

  constructor() {
    super();

    this.addEventListener('pointerdown', this);

    this.#shadow.adoptedStyleSheets.push(styles);
    // Ideally we would creating these lazily on first focus, but the resize handlers need to be around for delegate focus to work.
    // Maybe can add the first resize handler here, and lazily instantiate the rest when needed?
    // I can see it becoming important at scale
    this.#shadow.innerHTML = html` <button part="rotation"></button>
      <button part="resize-nw"></button>
      <button part="resize-ne"></button>
      <button part="resize-se"></button>
      <button part="resize-sw"></button>
      <div><slot></slot></div>`;

    this.height = Number(this.getAttribute('height')) || 'auto';
    this.width = Number(this.getAttribute('width')) || 'auto';
  }

  #isConnected = false;
  connectedCallback() {
    this.#isConnected = true;
    this.#update(new Set(['type', 'x', 'y', 'height', 'width', 'rotation']));
  }

  getClientRect(): RotatedDOMRect {
    const { x, y, width, height, rotation } = this;

    return {
      x,
      y,
      width,
      height,
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      rotation,

      center(): Point {
        return {
          x: this.x + this.width / 2,
          y: this.y + this.height / 2,
        };
      },
      vertices(): Point[] {
        // TODO: Implement
        return [];
      },

      corners() {
        const center = this.center();
        const { x, y, width, height, rotation } = this;

        return [
          Vector.rotateAround({ x, y }, center, rotation),
          Vector.rotateAround({ x: x + width, y }, center, rotation),
          Vector.rotateAround({ x: x + width, y: y + height }, center, rotation),
          Vector.rotateAround({ x, y: y + height }, center, rotation),
        ];
      },

      toJSON: undefined as any,
    };
  }

  // Similar to `Element.getClientBoundingRect()`, but returns an SVG path that precisely outlines the shape.
  getBoundingPath(): string {
    return '';
  }

  // We might also want some kind of utility function that maps a path into an approximate set of vertices.
  getBoundingVertices() {
    return [];
  }

  handleEvent(event: PointerEvent) {
    switch (event.type) {
      case 'pointerdown': {
        if (event.button !== 0 || event.ctrlKey) return;

        const target = event.composedPath()[0] as HTMLElement;

        // Store initial angle on rotation start
        if (target.getAttribute('part') === 'rotation') {
          const center = this.getClientRect().center();
          this.#initialRotation = this.#rotation;
          this.#startAngle = Vector.angleFromOrigin({ x: event.clientX, y: event.clientY }, center);
        }

        // ignore interactions from slotted elements.
        if (target !== this && !target.hasAttribute('part')) return;

        this.addEventListener('pointermove', this);
        this.addEventListener('lostpointercapture', this);
        target.setPointerCapture(event.pointerId);

        const interaction = target.getAttribute('part') || 'move';
        this.#internals.states.add(interaction);

        this.focus();
        return;
      }
      case 'pointermove': {
        const target = event.composedPath()[0] as HTMLElement;
        if (target === null) return;

        if (target === this) {
          this.x += event.movementX;
          this.y += event.movementY;
          return;
        }

        const handle = target.getAttribute('part') as Handle;
        if (handle === null) return;

        if (handle.includes('resize')) {
          const mouse = { x: event.clientX, y: event.clientY };

          // Map each resize handle to its opposite corner index
          const OPPOSITE_CORNERS = {
            'resize-se': 0,
            'resize-sw': 1,
            'resize-nw': 2,
            'resize-ne': 3,
          } as const;

          // Get the opposite corner for the current resize handle
          const corners = this.getClientRect().corners();
          const oppositeCorner = corners[OPPOSITE_CORNERS[handle as keyof typeof OPPOSITE_CORNERS]];

          // Calculate new dimensions based on mouse position and opposite corner
          const newCenter = Vector.lerp(oppositeCorner, mouse, 0.5);
          const unrotatedHandle = Vector.rotateAround(mouse, newCenter, -this.rotation);
          const unrotatedAnchor = Vector.rotateAround(oppositeCorner, newCenter, -this.rotation);

          const HANDLE_BEHAVIOR = {
            'resize-se': {
              flipX: unrotatedHandle.x < unrotatedAnchor.x,
              flipY: unrotatedHandle.y < unrotatedAnchor.y,
              handleX: 'resize-sw',
              handleY: 'resize-ne',
            },
            'resize-sw': {
              flipX: unrotatedHandle.x > unrotatedAnchor.x,
              flipY: unrotatedHandle.y < unrotatedAnchor.y,
              handleX: 'resize-se',
              handleY: 'resize-nw',
            },
            'resize-nw': {
              flipX: unrotatedHandle.x > unrotatedAnchor.x,
              flipY: unrotatedHandle.y > unrotatedAnchor.y,
              handleX: 'resize-ne',
              handleY: 'resize-sw',
            },
            'resize-ne': {
              flipX: unrotatedHandle.x < unrotatedAnchor.x,
              flipY: unrotatedHandle.y > unrotatedAnchor.y,
              handleX: 'resize-nw',
              handleY: 'resize-se',
            },
          } as const;

          const behavior = HANDLE_BEHAVIOR[handle as keyof typeof HANDLE_BEHAVIOR];
          const hasFlippedX = behavior.flipX;
          const hasFlippedY = behavior.flipY;

          if (hasFlippedX || hasFlippedY) {
            const nextHandle = hasFlippedX ? behavior.handleX : behavior.handleY;
            const newTarget = this.#shadow.querySelector(`[part="${nextHandle}"]`) as HTMLElement;

            if (newTarget) {
              // Clean up old handle state
              this.#internals.states.delete(handle);
              target.removeEventListener('pointermove', this);
              target.removeEventListener('lostpointercapture', this);

              // Set up new handle state
              this.#internals.states.add(nextHandle);
              newTarget.addEventListener('pointermove', this);
              newTarget.addEventListener('lostpointercapture', this);

              // Transfer pointer capture
              target.releasePointerCapture(event.pointerId);
              newTarget.setPointerCapture(event.pointerId);
            }
          }

          this.x = Math.min(unrotatedHandle.x, unrotatedAnchor.x);
          this.y = Math.min(unrotatedHandle.y, unrotatedAnchor.y);
          this.width = Math.abs(unrotatedAnchor.x - unrotatedHandle.x);
          this.height = Math.abs(unrotatedAnchor.y - unrotatedHandle.y);
          return;
        }

        if (handle === 'rotation') {
          const center = this.getClientRect().center();
          const currentAngle = Vector.angleFromOrigin({ x: event.clientX, y: event.clientY }, center);
          this.rotation = this.#initialRotation + (currentAngle - this.#startAngle);
          return;
        }

        return;
      }
      case 'lostpointercapture': {
        const target = event.composedPath()[0] as HTMLElement;
        const interaction = target.getAttribute('part') || 'move';
        this.#internals.states.delete(interaction);
        this.removeEventListener('pointermove', this);
        this.removeEventListener('lostpointercapture', this);
        document.body.style.cursor = 'default';
        return;
      }
    }
  }

  #updatedProperties = new Set<string>();
  #isUpdating = false;

  async #requestUpdate(property: string) {
    if (!this.#isConnected) return;

    this.#updatedProperties.add(property);

    if (this.#isUpdating) return;

    this.#isUpdating = true;
    await true;
    this.#isUpdating = false;
    this.#update(this.#updatedProperties);
    this.#updatedProperties.clear();
  }

  // Any updates that should be batched should happen here like updating the DOM or emitting events should be executed here.
  #update(updatedProperties: Set<string>) {
    if (updatedProperties.has('rotation')) {
      const degrees = (this.#rotation * 180) / Math.PI;

      this.style.setProperty('--fc-nwse-resize', resizeCursorUrl(degrees));
      this.style.setProperty('--fc-nesw-resize', resizeCursorUrl(degrees + 90));
      this.style.setProperty('--fc-rotate', rotateCursorUrl(degrees));
      document.body.style.cursor = rotateCursorUrl(degrees);
    }

    this.#dispatchTransformEvent(updatedProperties);
  }

  #dispatchTransformEvent(updatedProperties: Set<string>) {
    const event = new TransformEvent();

    this.dispatchEvent(event);

    if (updatedProperties.has('x')) {
      if (event.xPrevented) {
        this.#x = this.#previousX;
      } else {
        this.style.left = `${this.#x}px`;
      }
    }

    if (updatedProperties.has('y')) {
      if (event.yPrevented) {
        this.#y = this.#previousY;
      } else {
        this.style.top = `${this.#y}px`;
      }
    }

    if (updatedProperties.has('height')) {
      if (event.heightPrevented) {
        this.#height = this.#previousHeight;
      } else {
        this.style.height = this.#height === 'auto' ? '' : `${this.#height}px`;
      }
    }

    if (updatedProperties.has('width')) {
      if (event.widthPrevented) {
        this.#width = this.#previousWidth;
      } else {
        this.style.width = this.#width === 'auto' ? '' : `${this.#width}px`;
      }
    }

    if (updatedProperties.has('rotation')) {
      if (event.rotatePrevented) {
        this.#rotation = this.#previousRotation;
      } else {
        this.style.rotate = `${this.#rotation}rad`;
      }
    }
  }

  #onAutoResize = (entry: ResizeObserverEntry) => {
    const previousRect = this.#autoContentRect;
    this.#autoContentRect = entry.contentRect;
    this.#previousHeight = previousRect.height;
    this.#previousWidth = previousRect.width;
    this.#dispatchTransformEvent(new Set(['width', 'height']));
  };
}

if (!customElements.get('folk-shape')) {
  FolkShape.define();
}
