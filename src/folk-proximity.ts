import { collisionDetection } from './collision';
import { FolkHull } from './folk-hull';
import { FolkGeometry } from './canvas/fc-geometry.ts';

interface ElementConstructor<E extends Element = Element> {
  new (): E;
}

export interface ElementConfig<E extends Element = Element> {
  constructor: ElementConstructor<E>;
  events?: Record<string, (event: Event) => Record<string, any>>;
  onAdd?(element: E): void | Record<string, any>;
  onUpdate?(element: E, data: ReadonlyMap<string, any>, updatedValues: Set<string>): void;
  onRemove?(element: E): void;
}

// TODO don't hard code this
const PROXIMITY = 50;

declare global {
  interface HTMLElementTagNameMap {
    'folk-cluster': FolkCluster;
    'folk-proximity': FolkProximity;
  }
}

export class FolkCluster extends FolkHull {
  static tagName = 'folk-cluster';

  static #config = new Map<ElementConstructor, ElementConfig>();

  static registerElement<E extends Element>(config: ElementConfig<E>) {
    this.#config.set(config.constructor, config);
  }

  #data = new Map();

  isElementInCluster(element: FolkGeometry) {
    return this.sourceElements.includes(element);
  }

  isElementInProximity(element: FolkGeometry) {
    for (const el of this.sourceElements as FolkGeometry[]) {
      if (collisionDetection(el.getClientRect(), element.getClientRect(), PROXIMITY)) return true;
    }
    return false;
  }

  addElements(...elements: FolkGeometry[]) {
    this.sources = this.sourceElements
      .concat(elements)
      .map((el) => `#${el.id}`)
      .join(', ');

    let data = {};

    for (const geometry of elements) {
      const element = geometry.firstElementChild;

      if (element === null) continue;

      const config = this.#getConfig(element);

      if (config) {
        for (const event of Object.keys(config.events || {})) {
          element.addEventListener(event, this.#handleEvent);
        }

        const newData = config.onAdd?.(element);
        data = Object.assign(data, newData);
      }
    }

    this.#handleUpdate(data);
  }

  #handleEvent = (event: Event) => {
    const config = this.#getConfig(event.currentTarget as Element);

    if (config) {
      const data = config.events?.[event.type]?.(event);
      if (data === undefined) return;
      this.#handleUpdate(data);
    }
  };

  #handleUpdate(data: Record<string, any>) {
    const keys = new Set(Object.keys(data));
    for (const key of keys) {
      this.#data.set(key, data[key]);
    }

    for (const geometry of this.sourceElements) {
      const element = geometry.firstElementChild;

      if (element === null) continue;

      const config = this.#getConfig(element);

      config?.onUpdate?.(element, this.#data, keys);
    }
  }

  removeElement(geometry: FolkGeometry) {
    this.sources = this.sourceElements
      .filter((el) => el !== geometry)
      .map((el) => `#${el.id}`)
      .join(', ');

    const element = geometry.firstElementChild;

    if (element === null) return;

    const config = this.#getConfig(element);

    if (config) {
      for (const event of Object.keys(config.events || {})) {
        element.removeEventListener(event, this.#handleEvent);
      }

      config.onRemove?.(element);
    }
  }

  #getConfig(element: Element) {
    const config = (this.constructor as typeof FolkCluster).#config;
    return config.get(element.constructor as ElementConstructor);
  }
}

export class FolkProximity extends HTMLElement {
  static tagName = 'folk-proximity';

  static define() {
    customElements.define(this.tagName, this);
  }

  #clusters = new Set<FolkCluster>();
  #geometries = Array.from(this.querySelectorAll('fc-geometry'));

  constructor() {
    super();

    this.addEventListener('move', this.#handleProximity);
    this.addEventListener('resize', this.#handleProximity);
  }

  #handleProximity = (e) => {
    const el = e.target as FolkGeometry;

    const cluster = this.#findCluster(el);

    if (cluster === null) {
      for (const cluster of this.#clusters) {
        // what if its in proximity to multiple clusters?
        if (cluster.isElementInProximity(el)) {
          cluster.addElements(el);
          return;
        }
      }

      for (const geometry of this.#geometries) {
        if (geometry === el) break;

        if (collisionDetection(geometry.getClientRect(), el.getClientRect(), PROXIMITY)) {
          const cluster = document.createElement('folk-cluster');
          cluster.addElements(geometry, el);
          this.#clusters.add(cluster);
          this.appendChild(cluster);
          return;
        }
      }
    } else {
      const isInCluster = (cluster.sourceElements as FolkGeometry[])
        .filter((element) => el !== element)
        .some((element) => collisionDetection(el.getClientRect(), element.getClientRect(), PROXIMITY));

      if (!isInCluster) {
        cluster.removeElement(el);

        if (cluster.sourcesMap.size === 1) {
          this.#clusters.delete(cluster);
          cluster.remove();
        }
      }
    }
  };

  #findCluster(element) {
    for (const cluster of this.#clusters) {
      if (cluster.isElementInCluster(element)) return cluster;
    }
    return null;
  }
}