/**
 * Shared Mock DOM and Browser Environment for TuneTyper Tests
 * Provides lightweight DOM element and document emulation for testing client-side scripts.
 */

function createMockClassList(initial = []) {
    const classes = new Set(initial);
    return {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (name, force) => {
            const shouldHave = force !== undefined ? Boolean(force) : !classes.has(name);
            if (shouldHave) classes.add(name);
            else classes.delete(name);
            return shouldHave;
        },
        contains: (name) => classes.has(name)
    };
}

function createMockElement(id, initialProps = {}) {
    const listeners = {};
    const attrs = {};
    const children = [];
    const classes = new Set();

    const element = {
        id,
        style: {},
        get className() {
            return Array.from(classes).join(' ');
        },
        set className(val) {
            classes.clear();
            String(val || '').split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
        },
        classList: {
            add: (...names) => {
                names.forEach((n) => classes.add(n));
                element.className = Array.from(classes).join(' ');
            },
            remove: (...names) => {
                names.forEach((n) => classes.delete(n));
                element.className = Array.from(classes).join(' ');
            },
            toggle: (name, force) => {
                const shouldHave = force !== undefined ? Boolean(force) : !classes.has(name);
                if (shouldHave) classes.add(name);
                else classes.delete(name);
                element.className = Array.from(classes).join(' ');
                return shouldHave;
            },
            contains: (name) => classes.has(name)
        },
        innerHTML: '',
        textContent: '',
        value: '',
        placeholder: '',
        src: '',
        alt: '',
        checked: id === 'remove-adlibs',
        disabled: false,
        focused: false,
        complete: true,
        focusCalled: 0,
        blurCalled: 0,
        clickCalled: 0,
        offsetTop: 0,
        offsetHeight: 24,
        clientHeight: 100,
        scrollTop: 0,
        children,
        childNodes: children,

        focus() {
            this.focused = true;
            this.focusCalled++;
            if (listeners.focus) {
                listeners.focus.forEach((fn) => fn());
            }
        },
        blur() {
            this.focused = false;
            this.blurCalled++;
            if (listeners.blur) {
                listeners.blur.forEach((fn) => fn());
            }
        },
        click() {
            this.clickCalled++;
            if (listeners.click) {
                return Promise.all(listeners.click.map((fn) => fn({ preventDefault: () => {} })));
            }
            return Promise.resolve();
        },
        addEventListener(type, fn) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(fn);
        },
        dispatchEvent(evt) {
            const list = listeners[evt.type] || [];
            list.forEach((fn) => fn(evt));
        },
        getAttribute(name) {
            return attrs[name] !== undefined ? attrs[name] : null;
        },
        setAttribute(name, val) {
            attrs[name] = String(val);
        },
        removeAttribute(name) {
            delete attrs[name];
        },
        appendChild(child) {
            child.parentNode = this;
            children.push(child);
            return child;
        },
        removeChild(child) {
            const idx = children.indexOf(child);
            if (idx !== -1) children.splice(idx, 1);
            return child;
        },
        contains(child) {
            return children.includes(child);
        },
        querySelectorAll(sel) {
            const results = [];
            if (sel.startsWith('.')) {
                const cls = sel.slice(1);
                for (const child of children) {
                    if (child.classList && child.classList.contains(cls)) results.push(child);
                    if (child.querySelectorAll) results.push(...child.querySelectorAll(sel));
                }
            }
            return results;
        },
        querySelector(sel) {
            if (sel.startsWith('.')) {
                const cls = sel.slice(1);
                for (const child of children) {
                    if (child.classList && child.classList.contains(cls)) return child;
                    if (child.querySelector) {
                        const found = child.querySelector(sel);
                        if (found) return found;
                    }
                }
            }
            return null;
        },
        closest: () => null,
        scrollTo: () => {},
        select: () => {},

        _listeners: listeners,
        _attrs: attrs,
        ...initialProps
    };

    return element;
}

class MockAudio {
    constructor() {
        this.currentTime = 0;
        this.volume = 1;
        this.paused = true;
    }
    play() {
        this.paused = false;
        return Promise.resolve();
    }
    pause() {
        this.paused = true;
    }
    addEventListener() {}
}

/**
 * Installs or resets a global mock DOM and window environment
 */
function setupMockDom(options = {}) {
    const elements = {};
    const trackCards = options.trackCards || [];
    let coarsePointerMatches = Boolean(options.coarsePointer);

    function getOrCreateElement(id) {
        if (!elements[id]) {
            elements[id] = createMockElement(id);
        }
        return elements[id];
    }

    if (options.elements) {
        for (const [id, props] of Object.entries(options.elements)) {
            elements[id] = createMockElement(id, props);
        }
    }

    const doc = {
        activeElement: null,
        getElementById: (id) => getOrCreateElement(id),
        querySelector: (sel) => {
            if (options.querySelector) {
                const res = options.querySelector(sel);
                if (res !== undefined) return res;
            }
            if (sel === '.navbar-title') return getOrCreateElement('navbar-title');
            if (sel === '.guess-input-container') return getOrCreateElement('guess-input-container');
            if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
            return null;
        },
        querySelectorAll: (sel) => {
            if (options.querySelectorAll) {
                const res = options.querySelectorAll(sel);
                if (res !== undefined) return res;
            }
            if (sel === '.artist-track-card') return trackCards;
            if (sel === '.artist-track-card.active') {
                return trackCards.filter((c) => c.classList && c.classList.contains('active'));
            }
            return [];
        },
        createElement: (tag) => createMockElement(`mock-${tag}-${Math.random().toString(36).slice(2, 7)}`, { tag }),
        body: {
            prepend: () => {},
            appendChild: (child) => child,
            removeChild: (child) => child
        },
        addEventListener: () => {},
        execCommand: () => true
    };

    const win = {
        location: {
            origin: 'https://type.vincentchan.uk',
            pathname: '/',
            search: '',
            hash: ''
        },
        addEventListener: () => {},
        scrollTo: options.scrollTo || (() => {}),
        scrollBy: () => {},
        matchMedia: (query) => ({
            matches: query === '(pointer: coarse)' ? coarsePointerMatches : false
        }),
        __INITIAL_ARTIST__: null,
        ...options.window
    };

    global.document = doc;
    global.window = win;
    global.navigator = { userAgent: options.userAgent || 'Mozilla/5.0 (X11; Linux x86_64)' };
    global.Audio = MockAudio;

    return {
        elements,
        getOrCreateElement,
        trackCards,
        setCoarsePointer: (matches) => { coarsePointerMatches = matches; }
    };
}

module.exports = {
    createMockClassList,
    createMockElement,
    MockAudio,
    setupMockDom
};
