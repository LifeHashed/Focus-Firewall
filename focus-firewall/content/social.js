/**
 * Focus Firewall — Social Media Content Script
 * Intercepts Instagram & Facebook with a focus-reminder modal.
 *
 * Behaviour:
 * - On page load, shows a blocking modal with the user's current goal.
 * - User can choose "Continue for 5 minutes" or "Go Back".
 * - After 5 minutes, the modal reappears.
 * - If extension is toggled OFF, modal is removed and timer is cleared.
 * - All DOM is injected inside a Shadow DOM to avoid CSS conflicts.
 */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────
  let currentGoal = '';
  let isEnabled   = true;
  let countdownTimer = null;
  let remainingSeconds = 0;
  let shadowRoot = null;
  let hostElement = null;

  // Unique ID prefix to avoid any collisions
  const PREFIX = 'ff-social';

  // ── Create Shadow DOM Host ────────────────────────────
  // We use Shadow DOM to completely isolate our modal styles
  // from Instagram/Facebook's CSS.
  function createShadowHost() {
    if (hostElement) return;

    hostElement = document.createElement('div');
    hostElement.id = `${PREFIX}-host`;
    hostElement.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
    `;
    document.documentElement.appendChild(hostElement);
    shadowRoot = hostElement.attachShadow({ mode: 'closed' });
  }

  // ── Build Modal HTML ──────────────────────────────────
  function getModalHTML(goal) {
    const siteName = location.hostname.includes('instagram') ? 'Instagram' : 'Facebook';
    const siteIcon = location.hostname.includes('instagram')
      ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none">
           <rect x="2" y="2" width="20" height="20" rx="6" stroke="#E1306C" stroke-width="2"/>
           <circle cx="12" cy="12" r="5" stroke="#E1306C" stroke-width="2"/>
           <circle cx="17.5" cy="6.5" r="1.5" fill="#E1306C"/>
         </svg>`
      : `<svg width="28" height="28" viewBox="0 0 24 24" fill="#1877F2">
           <path d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z"/>
         </svg>`;

    return `
      <style>
        /* ── Modal Overlay ── */
        .${PREFIX}-overlay {
          position: fixed;
          top: 0; left: 0;
          width: 100vw; height: 100vh;
          background: rgba(5, 10, 20, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: all;
          animation: ${PREFIX}-fadeIn 0.3s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        @keyframes ${PREFIX}-fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @keyframes ${PREFIX}-slideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes ${PREFIX}-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.3); }
          50%      { box-shadow: 0 0 0 12px rgba(33, 150, 243, 0); }
        }

        /* ── Modal Card ── */
        .${PREFIX}-modal {
          background: linear-gradient(170deg, #0d1224 0%, #111a30 50%, #0a1628 100%);
          border: 1px solid rgba(33, 150, 243, 0.18);
          border-radius: 24px;
          padding: 36px 32px 28px;
          max-width: 400px;
          width: 90vw;
          text-align: center;
          box-shadow:
            0 25px 60px rgba(0, 0, 0, 0.6),
            0 0 80px rgba(33, 150, 243, 0.06);
          animation: ${PREFIX}-slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        /* Decorative glow at top */
        .${PREFIX}-modal::before {
          content: '';
          position: absolute;
          top: -60px; left: 50%;
          transform: translateX(-50%);
          width: 200px; height: 120px;
          background: radial-gradient(circle, rgba(33, 150, 243, 0.15), transparent 70%);
          pointer-events: none;
        }

        /* ── Shield Icon ── */
        .${PREFIX}-shield {
          width: 64px; height: 64px;
          margin: 0 auto 18px;
          background: rgba(33, 150, 243, 0.08);
          border: 1.5px solid rgba(33, 150, 243, 0.2);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ${PREFIX}-pulse 2.5s ease infinite;
          position: relative;
          z-index: 1;
        }

        .${PREFIX}-shield svg {
          filter: drop-shadow(0 2px 8px rgba(33, 150, 243, 0.4));
        }

        /* ── Site Badge ── */
        .${PREFIX}-site-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 6px 14px;
          margin-bottom: 20px;
          position: relative;
          z-index: 1;
        }

        .${PREFIX}-site-name {
          font-size: 13px;
          font-weight: 500;
          color: #8aa8c8;
          letter-spacing: 0.3px;
        }

        /* ── Typography ── */
        .${PREFIX}-title {
          font-size: 18px;
          font-weight: 700;
          color: #e0e6f0;
          margin-bottom: 8px;
          line-height: 1.3;
          position: relative;
          z-index: 1;
        }

        .${PREFIX}-subtitle {
          font-size: 13px;
          color: #6a8aaa;
          margin-bottom: 20px;
          position: relative;
          z-index: 1;
        }

        /* ── Goal Card ── */
        .${PREFIX}-goal-card {
          background: rgba(33, 150, 243, 0.06);
          border: 1px solid rgba(33, 150, 243, 0.15);
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 24px;
          position: relative;
          z-index: 1;
        }

        .${PREFIX}-goal-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 2.5px;
          color: #5a9fd4;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .${PREFIX}-goal-text {
          font-size: 16px;
          font-weight: 600;
          color: #b8d4f0;
          line-height: 1.4;
          word-break: break-word;
        }

        /* ── Timer Display ── */
        .${PREFIX}-timer {
          display: none;
          font-size: 12px;
          color: #5a9fd4;
          margin-bottom: 20px;
          font-variant-numeric: tabular-nums;
          position: relative;
          z-index: 1;
        }

        .${PREFIX}-timer.visible {
          display: block;
        }

        .${PREFIX}-timer-value {
          font-size: 22px;
          font-weight: 700;
          color: #64B5F6;
          display: block;
          margin-top: 4px;
        }

        /* ── Buttons ── */
        .${PREFIX}-buttons {
          display: flex;
          gap: 12px;
          position: relative;
          z-index: 1;
        }

        .${PREFIX}-btn {
          flex: 1;
          padding: 14px 16px;
          border-radius: 14px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.3px;
          transition: all 0.25s ease;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: inherit;
        }

        .${PREFIX}-btn-continue {
          background: linear-gradient(135deg, #1565C0, #2196F3);
          color: #fff;
          box-shadow: 0 4px 15px rgba(33, 150, 243, 0.25);
        }

        .${PREFIX}-btn-continue:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(33, 150, 243, 0.35);
        }

        .${PREFIX}-btn-continue:active {
          transform: translateY(0);
        }

        .${PREFIX}-btn-back {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #8aa8c8;
        }

        .${PREFIX}-btn-back:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: #b8d4f0;
          transform: translateY(-2px);
        }

        .${PREFIX}-btn-back:active {
          transform: translateY(0);
        }

        /* ── No Goal State ── */
        .${PREFIX}-no-goal {
          font-size: 13px;
          color: #6a8aaa;
          margin-bottom: 20px;
          padding: 16px;
          background: rgba(244, 67, 54, 0.06);
          border: 1px solid rgba(244, 67, 54, 0.15);
          border-radius: 14px;
          position: relative;
          z-index: 1;
        }
      </style>

      <div class="${PREFIX}-overlay" id="${PREFIX}-overlay">
        <div class="${PREFIX}-modal">
          <div class="${PREFIX}-shield">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                    fill="url(#ffShieldGrad)" opacity="0.9"/>
              <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"
                    fill="none" stroke="url(#ffShieldStroke)" stroke-width="1.5"/>
              <path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"/>
              <defs>
                <linearGradient id="ffShieldGrad" x1="3" y1="2" x2="21" y2="19">
                  <stop offset="0%" stop-color="#2196F3"/>
                  <stop offset="100%" stop-color="#0D47A1"/>
                </linearGradient>
                <linearGradient id="ffShieldStroke" x1="3" y1="2" x2="21" y2="19">
                  <stop offset="0%" stop-color="#64B5F6"/>
                  <stop offset="100%" stop-color="#1565C0"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div class="${PREFIX}-site-badge">
            ${siteIcon}
            <span class="${PREFIX}-site-name">${siteName} Detected</span>
          </div>

          <h2 class="${PREFIX}-title">Focus Firewall Active</h2>
          <p class="${PREFIX}-subtitle">You are currently working on:</p>

          ${goal
            ? `<div class="${PREFIX}-goal-card">
                 <div class="${PREFIX}-goal-label">YOUR FOCUS GOAL</div>
                 <div class="${PREFIX}-goal-text">${escapeHTML(goal)}</div>
               </div>`
            : `<div class="${PREFIX}-no-goal">
                 No focus goal set. Open Focus Firewall popup to set one.
               </div>`
          }

          <div class="${PREFIX}-timer" id="${PREFIX}-timer">
            <span>Time remaining</span>
            <span class="${PREFIX}-timer-value" id="${PREFIX}-timer-value">5:00</span>
          </div>

          <div class="${PREFIX}-buttons">
            <button class="${PREFIX}-btn ${PREFIX}-btn-back" id="${PREFIX}-btn-back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Go Back
            </button>
            <button class="${PREFIX}-btn ${PREFIX}-btn-continue" id="${PREFIX}-btn-continue">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Continue 5 min
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Helpers ───────────────────────────────────────────

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Show Modal ────────────────────────────────────────
  function showModal() {
    if (!isEnabled) return;

    createShadowHost();
    hostElement.style.pointerEvents = 'auto';

    // Render modal content into shadow DOM
    shadowRoot.innerHTML = getModalHTML(currentGoal);

    // Wire up button handlers
    const btnBack = shadowRoot.getElementById(`${PREFIX}-btn-back`);
    const btnContinue = shadowRoot.getElementById(`${PREFIX}-btn-continue`);

    btnBack.addEventListener('click', () => {
      // Navigate back or close tab
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    });

    btnContinue.addEventListener('click', () => {
      hideModal();
      startTimer();
    });
  }

  // ── Hide Modal ────────────────────────────────────────
  function hideModal() {
    if (shadowRoot) {
      shadowRoot.innerHTML = '';
    }
    if (hostElement) {
      hostElement.style.pointerEvents = 'none';
    }
  }

  // ── 5-Minute Timer ────────────────────────────────────
  // After 5 minutes, the modal reappears as a reminder.
  function startTimer() {
    clearTimer();
    remainingSeconds = 5 * 60; // 5 minutes

    countdownTimer = setInterval(() => {
      remainingSeconds--;

      if (remainingSeconds <= 0) {
        clearTimer();
        // Time's up — show reminder modal again
        showModal();
      }
    }, 1000);
  }

  function clearTimer() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    remainingSeconds = 0;
  }

  // ── Remove Everything ─────────────────────────────────
  function teardown() {
    clearTimer();
    hideModal();
    if (hostElement && hostElement.parentNode) {
      hostElement.parentNode.removeChild(hostElement);
      hostElement = null;
      shadowRoot = null;
    }
  }

  // ── Message Listener ──────────────────────────────────
  // React to real-time updates from popup via background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'GOAL_UPDATED') {
      currentGoal = message.goal || '';
      // If modal is currently showing, refresh it with new goal
      if (shadowRoot && shadowRoot.querySelector(`.${PREFIX}-overlay`)) {
        showModal();
      }
    }

    if (message.type === 'TOGGLE_CHANGED') {
      isEnabled = message.isEnabled;
      if (!isEnabled) {
        teardown();
      } else {
        // Re-show modal when re-enabled
        showModal();
      }
    }
  });

  // ── Initialize ────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      currentGoal = response.focusGoal || '';
      isEnabled   = response.isEnabled !== false;

      if (isEnabled) {
        // Small delay to let page render first, then show modal
        setTimeout(showModal, 800);
      }
    }
  });

})();
