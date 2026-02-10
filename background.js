/**
 * background.js — WebAdvisor Service Worker
 *
 * Handles:
 *  - Mode A (INFINITE LOAD): declarativeNetRequest redirect to closed local port
 *  - Mode B (REDIRECT): declarativeNetRequest redirect to user-specified URL
 *  - Mode C (TAB FREEZE): chrome.scripting.executeScript injection of content_crash.js
 *
 * Rule ID scheme: each target gets a unique rule ID based on its index (starting at 1000).
 */

// ============================================================
// Constants
// ============================================================
const HANG_REDIRECT_URL = 'http://192.0.2.1:48291';
const DEFAULT_REDIRECT_URL = 'http://google.com';
const RULE_ID_OFFSET = 1000;

// Track domains set to "crash" mode so we can inject on navigation
let crashDomains = [];

// ============================================================
// Message Listener — receives commands from popup.js
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateRules') {
        handleUpdateRules(message.targets);
        sendResponse({ status: 'ok' });
    } else if (message.action === 'clearRules') {
        handleClearRules();
        sendResponse({ status: 'ok' });
    }
    return true; // Keep channel open for async
});

// ============================================================
// On Install / Startup — restore saved state
// ============================================================
chrome.runtime.onStartup.addListener(restoreState);
chrome.runtime.onInstalled.addListener(restoreState);

/**
 * Restore targets and reapply rules from saved storage.
 */
function restoreState() {
    chrome.storage.local.get(['targets', 'isActive'], (data) => {
        if (data.isActive && data.targets && data.targets.length > 0) {
            handleUpdateRules(data.targets);
        }
    });
}

// ============================================================
// Rule Management
// ============================================================

/**
 * Apply declarativeNetRequest rules for Mode A and Mode B targets,
 * and set up tab listeners for Mode C targets.
 *
 * @param {Array<{domain: string, mode: string}>} targets
 */
async function handleUpdateRules(targets) {
    // 1. Remove all existing dynamic rules first
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(r => r.id);

    // 2. Build new rules for Mode A and Mode B
    const addRules = [];
    crashDomains = []; // Reset crash domain tracking

    targets.forEach((target, index) => {
        const ruleId = RULE_ID_OFFSET + index;

        if (target.mode === 'hang') {
            // Mode A: Redirect to a closed local port → infinite hang
            addRules.push({
                id: ruleId,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: { url: HANG_REDIRECT_URL }
                },
                condition: {
                    urlFilter: `||${target.domain}`,
                    resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'stylesheet', 'image', 'font', 'media', 'other']
                }
            });
        } else if (target.mode === 'redirect') {
            // Mode B: Redirect to user-specified URL (or default)
            const redirectUrl = target.redirectUrl || DEFAULT_REDIRECT_URL;
            addRules.push({
                id: ruleId,
                priority: 1,
                action: {
                    type: 'redirect',
                    redirect: { url: redirectUrl }
                },
                condition: {
                    urlFilter: `||${target.domain}`,
                    resourceTypes: ['main_frame']
                }
            });
        } else if (target.mode === 'crash') {
            // Mode C: Track domain for tab injection (no declarativeNetRequest rule)
            crashDomains.push(target.domain);
        }
    });

    // 3. Apply the rule update atomically
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: addRules
    });

    console.log(`[WebAdvisor] Rules applied: ${addRules.length} network rules, ${crashDomains.length} crash targets`);
}

/**
 * Clear all dynamic rules and crash domain tracking.
 */
async function handleClearRules() {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existingRuleIds,
        addRules: []
    });

    crashDomains = [];
    console.log('[WebAdvisor] All rules cleared.');
}

// ============================================================
// Mode C: Tab Freeze — Inject content_crash.js on navigation
// ============================================================

/**
 * Listen for tab updates. When a tab finishes loading and its URL
 * matches a crash-mode domain, inject the crash script.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only act when the page has finished loading
    if (changeInfo.status !== 'complete') return;
    if (!tab.url) return;

    // Check if any crash domain matches this tab's URL
    const matchedDomain = crashDomains.find(domain => {
        try {
            const tabHost = new URL(tab.url).hostname;
            return tabHost === domain || tabHost.endsWith('.' + domain);
        } catch {
            return false;
        }
    });

    if (matchedDomain) {
        console.log(`[WebAdvisor] Injecting crash script into tab ${tabId} (${matchedDomain})`);
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content_crash.js']
        }).catch(err => {
            console.warn(`[WebAdvisor] Failed to inject crash script: ${err.message}`);
        });
    }
});
