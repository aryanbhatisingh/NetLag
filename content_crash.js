/**
 * content_crash.js — Tab Freeze Script (Mode C)
 *
 * PURPOSE: Blocks the main thread of the current tab, making it unresponsive.
 * This simulates a "crash" or DoS state for educational purposes.
 *
 * HOW IT WORKS:
 *  - Runs a synchronous infinite loop that blocks the JavaScript event loop.
 *  - The browser's per-tab process isolation ensures ONLY this tab is affected.
 *  - The user can still close the tab via the tab's close button or Chrome's
 *    Task Manager (Shift+Esc).
 *
 * ⚠ WARNING: This is for LOCAL EDUCATIONAL TESTING ONLY.
 */

(function freezeTab() {
  'use strict';

  // Visual indicator — overlay a warning before freezing
  const overlay = document.createElement('div');
  overlay.setAttribute('style', `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: #0a0a0f;
    color: #ff3355;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    font-size: 18px;
    letter-spacing: 2px;
  `);
  overlay.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 20px;">💀</div>
    <div style="color: #ff3355; font-weight: bold; font-size: 22px;">TAB FROZEN</div>
    <div style="color: #7a7a8e; font-size: 12px; margin-top: 10px;">WebAdvisor // Mode C Active</div>
    <div style="color: #7a7a8e; font-size: 11px; margin-top: 6px;">Close this tab with Shift+Esc → Task Manager</div>
  `;
  document.documentElement.appendChild(overlay);

  // Force a paint so the overlay is visible before we block
  void overlay.offsetHeight;

  // Block the main thread with a synchronous infinite loop.
  // This makes the tab completely unresponsive.
  // Modern browsers sandbox this per-tab so other tabs are unaffected.
  while (true) {
    // Intentionally empty — this IS the freeze.
    // The browser will flag this tab as "Not Responding".
  }
})();
