(function () {
    "use strict";

    const observedRoots = new WeakSet();
    const translatedAttributes = ["label", "placeholder", "loading", "title"];
    let translations = {};

    function translateText(value) {
        if (!value) return value;
        const key = value.trim();
        if (!key) return value;

        let translated = translations[key];
        let suffix = "";

        // React-SharpDeck and sdpi-item append a colon to field labels.
        // Keep that punctuation while looking up the label itself.
        if (translated === undefined) {
            const match = key.match(/^(.*?)(\s*[:：])$/);
            if (match) {
                translated = translations[match[1]];
                suffix = match[2];
            }
        }

        if (translated === undefined) return value;
        return value.replace(key, translated + suffix);
    }

    function translateElement(element) {
        for (const attribute of translatedAttributes) {
            if (!element.hasAttribute(attribute)) continue;
            const value = element.getAttribute(attribute);
            const translated = translateText(value);
            if (translated !== value) element.setAttribute(attribute, translated);
        }

        if (element.shadowRoot) {
            translateRoot(element.shadowRoot);
            observe(element.shadowRoot);
        }
    }

    function translateTextNode(node) {
        const value = node.data;
        const translated = translateText(value);
        if (translated !== value) node.data = translated;
    }

    function translateRoot(root) {
        if (root.nodeType === Node.TEXT_NODE) {
            translateTextNode(root);
            return;
        }

        if (root.nodeType === Node.ELEMENT_NODE) translateElement(root);

        const walker = document.createTreeWalker(
            root,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
        );

        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (node.nodeType === Node.TEXT_NODE) {
                translateTextNode(node);
            } else {
                translateElement(node);
            }
        }
    }

    function observe(root) {
        if (observedRoots.has(root)) return;
        observedRoots.add(root);

        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === "attributes") {
                    translateElement(mutation.target);
                    continue;
                }
                if (mutation.type === "characterData") {
                    translateRoot(mutation.target);
                    continue;
                }
                for (const node of mutation.addedNodes) translateRoot(node);
            }
        }).observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: translatedAttributes
        });
    }

    function localeCandidates(language) {
        const normalized = (language || "en").replace("-", "_");
        const lower = normalized.toLowerCase();
        if (lower === "zh" || lower === "zh_cn" || lower === "zh_hans") {
            return ["zh_CN", "en"];
        }
        if (lower === "zh_hk" || lower === "zh_tw" || lower === "zh_hant") {
            return ["zh_HK", "en"];
        }
        return [normalized.split("_")[0], "en"];
    }

    async function loadLocalization(language) {
        for (const locale of [...new Set(localeCandidates(language))]) {
            try {
                const response = await fetch(`../${locale}.json`, { cache: "no-store" });
                if (!response.ok) continue;
                const localeFile = await response.json();
                translations = localeFile.Localization || {};
                translateRoot(document.body);
                observe(document.body);
                return;
            } catch (_) {
                // Try the next locale, ending with the English fallback.
            }
        }
    }

    const connect = window.connectElgatoStreamDeckSocket;
    window.connectElgatoStreamDeckSocket = function (...args) {
        const result = connect && connect.apply(this, args);
        try {
            const appInfo = JSON.parse(args[3]);
            loadLocalization(appInfo.application && appInfo.application.language);
        } catch (_) {
            loadLocalization("en");
        }
        return result;
    };
})();
