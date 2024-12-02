import { css } from './common/tags.ts';
import { FolkRope } from './folk-rope.ts';
import * as parser from '@babel/parser';

const styles = new CSSStyleSheet();
styles.replaceSync(css`
  textarea {
    position: absolute;
    width: auto;
    min-width: 3ch;
    height: auto;
    resize: none;
    background: rgba(256, 256, 256, 0.8);
    border: 1px solid #ccc;
    padding: 4px;
    pointer-events: auto;
    overflow: hidden;
    field-sizing: content;
    translate: -50% -50%;
    border-radius: 5px;
  }
`);

export class FolkEventPropagator extends FolkRope {
  static override tagName = 'folk-event-propagator';

  #triggers: string[] = [];
  get triggers() {
    return this.#triggers;
  }
  set triggers(triggers: string | string[]) {
    if (typeof triggers === 'string') {
      triggers = triggers.split(',');
    }
    this.#removeEventListenersToSource();

    this.#triggers = triggers;

    this.#addEventListenersToSource();
  }

  #expression = '';
  #function: Function | null = null;
  get expression() {
    return this.#expression;
  }
  set expression(expression) {
    this.mend();
    this.#expression = expression;
    const processedExp = expression.trim();

    const codeLines: string[] = [];

    // Split the expression into lines, handling different line endings
    const lines = processedExp.split(/\r?\n/);

    for (const line of lines) {
      let line_trimmed = line.trim();
      if (!line_trimmed) continue;

      // Remove trailing comma if it exists (only if it's at the very end of the line)
      if (line_trimmed.endsWith(',')) {
        line_trimmed = line_trimmed.slice(0, -1).trim();
      }

      // Find the first colon index, which separates the key and value.
      // Colons can still be used in ternary operators or other expressions,
      const colonIndex = line_trimmed.indexOf(':');
      if (colonIndex === -1) {
        // Line without a colon, skip or handle error
        console.warn(`Skipping line without colon: "${line_trimmed}"`);
        continue;
      }

      const key = line_trimmed.slice(0, colonIndex).trim();
      const value = line_trimmed.slice(colonIndex + 1).trim();

      if (key === '()') {
        // Anonymous function: directly evaluate the value
        codeLines.push(`${value};`);
      } else if (key.endsWith('()')) {
        // If the key is a method, execute it if the condition is true
        const methodName = key.slice(0, -2);
        codeLines.push(`if (${value}) { to.${methodName}(); }`);
      } else {
        // For property assignments, assign the value directly
        codeLines.push(`to.${key} = ${value};`);
      }
    }

    const functionBody = codeLines.join('\n');

    try {
      parseAst(functionBody);

      this.#function = new Function('from', 'to', 'event', functionBody);
    } catch (error) {
      console.warn('Failed to parse expression:', error, functionBody);
      this.cut();
      this.#function = null;
    }
  }

  #triggerTextarea = document.createElement('textarea');
  #expressionTextarea = document.createElement('textarea');

  constructor() {
    super();

    this.shadowRoot?.adoptedStyleSheets.push(styles);

    this.#triggerTextarea.addEventListener('change', () => {
      this.triggers = this.#triggerTextarea.value;
    });
    this.triggers = this.#triggerTextarea.value = this.getAttribute('triggers') || '';

    this.shadowRoot?.appendChild(this.#triggerTextarea);

    this.#expressionTextarea.addEventListener('input', () => {
      this.expression = this.#expressionTextarea.value;
    });

    this.shadowRoot?.appendChild(this.#expressionTextarea);

    this.expression = this.#expressionTextarea.value = this.getAttribute('expression') || '';
  }

  override render(sourceRect: DOMRectReadOnly, targetRect: DOMRectReadOnly) {
    super.render(sourceRect, targetRect);
  }

  override draw() {
    super.draw();

    const triggerPoint = this.points[Math.floor(this.points.length / 5)];

    if (triggerPoint) {
      this.#triggerTextarea.style.left = `${triggerPoint.pos.x}px`;
      this.#triggerTextarea.style.top = `${triggerPoint.pos.y}px`;
    }

    const expressionPoint = this.points[Math.floor(this.points.length / 2)];

    if (expressionPoint) {
      this.#expressionTextarea.style.left = `${expressionPoint.pos.x}px`;
      this.#expressionTextarea.style.top = `${expressionPoint.pos.y}px`;
    }
  }

  override observeSource() {
    super.observeSource();

    this.#addEventListenersToSource();
  }

  #addEventListenersToSource() {
    for (const trigger of this.#triggers) {
      // TODO: add special triggers for intersection, rAF, etc.
      this.sourceElement?.addEventListener(trigger, this.evaluateExpression);
    }
  }

  override unobserveSource() {
    super.unobserveSource();
    this.#removeEventListenersToSource();
  }

  #removeEventListenersToSource() {
    for (const trigger of this.#triggers) {
      this.sourceElement?.removeEventListener(trigger, this.evaluateExpression);
    }
  }

  override observeTarget() {
    super.observeTarget();
  }

  override unobserveTarget() {
    super.unobserveTarget();
  }

  evaluateExpression = (event?: Event) => {
    if (this.sourceElement === null || this.targetElement === null) return;
    this.stroke = 'black';
    if (!this.#function) return;

    try {
      const toProxy = new Proxy(this.targetElement, {
        set(target, prop, value, receiver) {
          if (!(prop in target)) {
            throw new Error(`Property '${String(prop)}' does not exist on target element.`);
          }
          return Reflect.set(target, prop, value, receiver);
        },
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver);
          if (value === undefined) {
            throw new Error(`Property '${String(prop)}' does not exist on target element.`);
          }
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        },
      });

      this.#function(this.sourceElement, toProxy, event);
    } catch (error) {
      console.warn('Failed to evaluate expression:', error);
      this.stroke = 'red';
    }
  };
}

function parseAst(functionBody: string) {
  const ast = parser.parse(functionBody, {
    sourceType: 'script',
  });

  const toProps = new Set<string>();
  const fromProps = new Set<string>();

  function walkAst(node: any) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'MemberExpression' && node.object?.type === 'Identifier') {
      const objName = node.object.name;
      if (objName !== 'to' && objName !== 'from') return;

      const propSet = objName === 'to' ? toProps : fromProps;

      if (node.property?.type === 'Identifier') {
        propSet.add(node.property.name);
      } else if (node.property?.type === 'StringLiteral') {
        propSet.add(node.property.value);
      }
    }

    // Recursively walk through all properties
    for (const key in node) {
      if (Array.isArray(node[key])) {
        node[key].forEach(walkAst);
      } else if (node[key] && typeof node[key] === 'object') {
        walkAst(node[key]);
      }
    }
  }

  walkAst(ast);

  console.log('Properties accessed on to:', Array.from(toProps));
  console.log('Properties accessed on from:', Array.from(fromProps));
}