/** Runs in the browser via context.addInitScript. Uses no dependencies. */
export function installCaptureListeners(): void {
  type EmitAction = { type: 'click'; selector: string } | { type: 'fill'; selector: string; value: string } | { type: 'check'; selector: string; checked: boolean };
  const emit = (window as unknown as { __ghostbug_emit?: (action: EmitAction) => void }).__ghostbug_emit;
  if (typeof emit !== 'function') return;

  /** `selector` if it matches el alone, Playwright's `selector >> nth=i` if el is one of several matches. */
  function locate(selector: string, el: Element): { selector: string; unique: boolean } | undefined {
    let matches: Element[];
    try { matches = Array.from(document.querySelectorAll(selector)); } catch { return undefined; }
    const index = matches.indexOf(el);
    if (index === -1) return undefined;
    return matches.length === 1 ? { selector, unique: true } : { selector: `${selector} >> nth=${index}`, unique: false };
  }

  function cssSelector(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const attributes: string[] = [];
    const testid = el.getAttribute('data-testid');
    if (testid && testid.length < 120) attributes.push(`[data-testid=${JSON.stringify(testid)}]`);
    if (el.id && el.id.length < 120) attributes.push(`#${CSS.escape(el.id)}`);
    const aria = el.getAttribute('aria-label');
    if (aria && aria.length < 120) attributes.push(`${tag}[aria-label=${JSON.stringify(aria)}]`);
    const name = el.getAttribute('name');
    if (name && name.length < 120) attributes.push(`${tag}[name=${JSON.stringify(name)}]`);
    // Lists often repeat a data-testid: prefer an attribute that identifies el alone, else keep the first
    // attribute with an index, which survives layout changes (such as a bug fix) better than a DOM path.
    const found = attributes.map(selector => locate(selector, el)).filter(candidate => candidate !== undefined);
    const path = domPath(el);
    return (found.find(candidate => candidate.unique) ?? found[0] ?? locate(path, el))?.selector ?? path;
  }

  function domPath(el: Element): string {
    const parts: string[] = [];
    let cursor: Element | null = el;
    while (cursor && cursor !== document.documentElement && parts.length < 9) {
      const tag = cursor.tagName.toLowerCase();
      const parent: Element | null = cursor.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      const siblings = Array.from(parent.children).filter(c => c.tagName === cursor!.tagName);
      const segment = siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(cursor) + 1})` : tag;
      parts.unshift(segment);
      if (parent.tagName.toLowerCase() === 'body') { parts.unshift('body'); break; }
      cursor = parent;
    }
    return parts.join(' > ');
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const target = event.target.closest('a,button,[role="button"],[data-testid],input,select,textarea') ?? event.target;
    if (target instanceof HTMLInputElement && ['checkbox', 'radio', 'text', 'email', 'password'].includes(target.type)) return;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    emit({ type: 'click', selector: cssSelector(target) });
  }, true);

  document.addEventListener('change', event => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      if (target.type === 'checkbox' || target.type === 'radio') {
        emit({ type: 'check', selector: cssSelector(target), checked: target.checked });
      } else if (!['file', 'hidden', 'submit', 'button'].includes(target.type)) {
        emit({ type: 'fill', selector: cssSelector(target), value: target.value });
      }
    } else if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      emit({ type: 'fill', selector: cssSelector(target), value: target.value });
    }
  }, true);
}
