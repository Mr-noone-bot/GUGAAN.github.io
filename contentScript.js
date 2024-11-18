// This function is used to generate the actual function names
function generateFunctionNames(index) {
    const functionNameList = [
        'log', 'XHMGe', 'HYdlC', 'getUrlAndExtensionData', 'addEventListener', 'message',
        'source', 'data', 'YAsIA', 'FuVmA', 'WLjEa', 'MmICe', 'ynAFR', 'BAgre', 'jteOW',
        'currentKey', 'runtime', 'sendMessage', 'createElement', 'span', 'id', 'body',
        'appendChild', 'postMessage', 'url', 'querySelector', 'remove', 'onMessage',
        'addListener', 'qpGge', 'jVtto', 'OeAOr', 'arMVV', 'KwRHD', 'action', 'type'
    ];
    return functionNameList[index - 250];
}

// Main code starts here
window.addEventListener('message', (event) => {
    if (event.source === window) {
        const { msg } = event.data;
        if (msg === 'pageReloaded' || msg === 'windowFocused' || msg === 'openNewTabs') {
            const type = msg === 'pageReloaded' ? 'pageReloaded' :
                         msg === 'windowFocused' ? 'windowFocused' : 'openNewTabs';
            const message = {
                type: type,
                key: event.data.currentKey
            };
            chrome.runtime.sendMessage(message);
        }
    }
});

// In contentScript.js - Replace existing panic mode listener with this:

function setupPanicModeListener() {
    // Main document listener
    function panicHandler(e) {
        if (e.altKey && e.key === '1') {
            e.preventDefault();
            chrome.runtime.sendMessage({
                message: "potus-panic-101"
            });
        }
    }

    // Add to both document and window
    document.addEventListener('keydown', panicHandler, true);
    window.addEventListener('keydown', panicHandler, true);

    // Handle iframes
    function addListenerToIframes() {
        const frames = document.getElementsByTagName('iframe');
        for (let frame of frames) {
            try {
                frame.contentDocument?.addEventListener('keydown', panicHandler, true);
            } catch (e) {
                // Skip if cross-origin
            }
        }
    }

    // Watch for DOM changes to maintain listeners
    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.addedNodes.length) {
                addListenerToIframes();
            }
        }
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initial iframe setup
    addListenerToIframes();
}

// Run immediately
setupPanicModeListener();

// Re-run on dynamic page changes
document.addEventListener('DOMContentLoaded', setupPanicModeListener);
window.addEventListener('load', setupPanicModeListener);

window.addEventListener('beforeunload', removeInjectedElement);

function sendMessageToWebsite(message) {
    removeInjectedElement();
    const element = document.createElement('span');
    element.id = `x-template-base-${message.currentKey}`;
    document.body.appendChild(element);
    console.log('message', message);
    window.postMessage({ url: message.url, currentKey: message.currentKey }, '*');
}

function removeInjectedElement() {
    const element = document.querySelector('[id^="x-template-base-"]');
    if (element) {
        element.remove();
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received in content script:', message);
    if (message.type === 'pageReload') {
        if (message.url) {
            sendMessageToWebsite(message);
        }
    } else if (message.type === 'removeInjectedElement') {
        removeInjectedElement();
    }
    sendResponse({received: true});
});

console.log('Content script loaded');

// Enable default paste behavior across all pages
document.addEventListener('keydown', (e) => {
    // Check if it's Ctrl+V (Windows) or Cmd+V (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Get the active/focused element
        const activeElement = document.activeElement;
        
        // Check if the element is an input, textarea, or contenteditable
        const isEditableTarget = (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.getAttribute('contenteditable') === 'true'
        );

        if (isEditableTarget) {
            // Allow the default paste behavior
            return true;
        }
    }
});

// Enable default copy behavior across all pages
document.addEventListener('keydown', (e) => {
    // Check if it's Ctrl+C (Windows) or Cmd+C (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const selectedText = window.getSelection().toString();
        
        if (selectedText) {
            // Try modern Clipboard API first
            navigator.clipboard.writeText(selectedText).catch(err => {
                // Fallback for older browsers
                const textarea = document.createElement('textarea');
                textarea.value = selectedText;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                
                try {
                    document.execCommand('copy');
                } catch (err) {
                    console.warn('Copy failed', err);
                }
                
                document.body.removeChild(textarea);
            });
            
            // Prevent any interference with copy operation
            return true;
        }
    }
});
