export interface PickerOption { value: string; label: string }

// A short, styled select-only combobox. Focus remains on the trigger so Tab
// follows the normal page order and arrows never trap scrolling in a menu.
export function createModelPicker(trigger: HTMLButtonElement, menu: HTMLElement, choose: (value: string) => void) {
  const valueLabel = trigger.querySelector<HTMLElement>('[data-picker-label]')!;
  let options: PickerOption[] = [];
  let selected = '';
  let active = 0;
  let search = '';
  let searchTime = 0;

  function highlight() {
    [...menu.children].forEach((element, index) => element.classList.toggle('is-active', index === active));
    const option = menu.children[active];
    if (!menu.hidden && option) trigger.setAttribute('aria-activedescendant', option.id);
    else trigger.removeAttribute('aria-activedescendant');
  }
  function close() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    search = '';
  }
  function open() {
    if (trigger.disabled || !options.length) return;
    active = Math.max(0, options.findIndex(option => option.value === selected));
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    highlight();
  }
  function commit(value: string) {
    close();
    choose(value);
    trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', () => menu.hidden ? open() : close());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (menu.hidden) { open(); return; }
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      highlight(); return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (menu.hidden) open();
      else if (options[active]) commit(options[active].value);
      return;
    }
    if (!menu.hidden && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault(); active = event.key === 'Home' ? 0 : options.length - 1; highlight(); return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (menu.hidden) open();
      const now = performance.now();
      search = (now - searchTime < 700 ? search : '') + event.key.toLocaleLowerCase('es');
      searchTime = now;
      const index = options.findIndex(option => option.label.toLocaleLowerCase('es').startsWith(search));
      if (index >= 0) { active = index; highlight(); }
    }
  });
  menu.addEventListener('mousedown', event => event.preventDefault());
  menu.addEventListener('click', event => {
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-picker-value]');
    if (option && menu.contains(option)) commit(option.dataset.pickerValue!);
  });
  document.addEventListener('pointerdown', event => {
    if (!trigger.contains(event.target as Node) && !menu.contains(event.target as Node)) close();
  });
  document.addEventListener('focusin', event => {
    if (!trigger.contains(event.target as Node) && !menu.contains(event.target as Node)) close();
  });

  return {
    setOptions(next: PickerOption[], value: string) {
      close(); options = next; selected = value;
      valueLabel.textContent = options.find(option => option.value === value)?.label ?? 'Elegí una opción';
      trigger.title = valueLabel.textContent;
      menu.replaceChildren(...options.map((option, index) => {
        const button = document.createElement('button');
        button.type = 'button'; button.tabIndex = -1;
        button.id = menu.id + '-' + index;
        button.dataset.pickerValue = option.value;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.value === value));
        button.textContent = option.label;
        return button;
      }));
    },
    setDisabled(disabled: boolean) { trigger.disabled = disabled; if (disabled) close(); },
  };
}
