/**
 * Focus Firewall — YouTube Content Script
 * Filters irrelevant video recommendations by comparing titles
 * against the user's current focus goal using keyword matching.
 *
 * Features:
 * - Blurs thumbnails of irrelevant videos
 * - Adds overlay badge "Irrelevant to current goal"
 * - Uses MutationObserver for infinite scroll support
 * - Debounced scanning for performance
 * - Listens for real-time goal/toggle updates from background
 */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────
  let currentGoal = '';
  let isEnabled   = true;
  let scanTimer   = null;

  // CSS class prefix to avoid collisions
  const PREFIX = 'ff-yt';

  // ── Inject Styles ─────────────────────────────────────
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    .${PREFIX}-blurred ytd-thumbnail,
    .${PREFIX}-blurred .ytd-thumbnail,
    .${PREFIX}-blurred #thumbnail {
      filter: blur(12px) saturate(0.3) !important;
      transition: filter 0.4s ease !important;
    }

    .${PREFIX}-blurred {
      opacity: 0.55 !important;
      position: relative !important;
    }

    .${PREFIX}-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      pointer-events: none;
    }

    .${PREFIX}-badge {
      background: linear-gradient(135deg, rgba(13, 71, 161, 0.92), rgba(21, 101, 192, 0.92));
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 8px;
      letter-spacing: 0.3px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(100, 181, 246, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      backdrop-filter: blur(4px);
      pointer-events: none;
    }

    /* Undo all filtering when extension is off */
    .${PREFIX}-cleared .${PREFIX}-blurred {
      opacity: 1 !important;
    }
    .${PREFIX}-cleared .${PREFIX}-blurred ytd-thumbnail,
    .${PREFIX}-cleared .${PREFIX}-blurred .ytd-thumbnail,
    .${PREFIX}-cleared .${PREFIX}-blurred #thumbnail {
      filter: none !important;
    }
    .${PREFIX}-cleared .${PREFIX}-overlay {
      display: none !important;
    }
  `;
  document.head.appendChild(styleSheet);

  // ── Keyword Extraction ────────────────────────────────
  // Extract meaningful keywords from the user's goal
  // Filters out common stop words and short words
  const STOP_WORDS = new Set([
    'the','a','an','and','or','but','in','on','at','to','for',
    'of','with','by','from','is','it','as','be','was','are',
    'this','that','i','my','me','we','our','you','your','am',
    'do','does','did','will','would','could','should','can',
    'not','no','so','if','its','than','then','just','about',
    'into','over','after','up','down','out','off','how','what',
    'when','where','why','which','who','all','each','some'
  ]);

  function extractKeywords(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')  // Remove special chars
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  // ── Relevance Check ───────────────────────────────────
  // Returns true if the video title is relevant to the current goal
  function isRelevant(videoTitle) {
    if (!currentGoal) return true; // No goal set — everything is relevant

    const keywords = extractKeywords(currentGoal);
    if (keywords.length === 0) return true;

    const titleLower = videoTitle.toLowerCase();

    // Check if at least one goal keyword appears in the title
    return keywords.some(keyword => titleLower.includes(keyword));
  }

  // ── Apply / Remove Filtering ──────────────────────────

  function markIrrelevant(videoElement) {
    if (videoElement.classList.contains(`${PREFIX}-blurred`)) return;

    videoElement.classList.add(`${PREFIX}-blurred`);

    // Create overlay with badge
    const overlay = document.createElement('div');
    overlay.className = `${PREFIX}-overlay`;

    const badge = document.createElement('div');
    badge.className = `${PREFIX}-badge`;
    badge.textContent = '🛡 Irrelevant to current goal';
    overlay.appendChild(badge);

    // Insert overlay relative to the thumbnail container
    const thumbContainer = videoElement.querySelector('#thumbnail, ytd-thumbnail, .ytd-thumbnail');
    if (thumbContainer && thumbContainer.parentElement) {
      thumbContainer.parentElement.style.position = 'relative';
      thumbContainer.parentElement.appendChild(overlay);
    } else {
      videoElement.style.position = 'relative';
      videoElement.appendChild(overlay);
    }
  }

  function markRelevant(videoElement) {
    videoElement.classList.remove(`${PREFIX}-blurred`);
    // Remove any overlay we added
    const overlays = videoElement.querySelectorAll(`.${PREFIX}-overlay`);
    overlays.forEach(o => o.remove());

    // Also check parent of thumbnail
    const thumbParents = videoElement.querySelectorAll(`[style*="position: relative"]`);
    thumbParents.forEach(p => {
      const ol = p.querySelector(`.${PREFIX}-overlay`);
      if (ol) ol.remove();
    });
  }

  // ── Scan All Visible Videos ───────────────────────────
  // Selectors cover the main feed, search results, sidebar, and shorts
  const VIDEO_SELECTORS = [
    'ytd-rich-item-renderer',          // Home feed grid items
    'ytd-video-renderer',              // Search results
    'ytd-compact-video-renderer',      // Sidebar / related
    'ytd-grid-video-renderer',         // Channel page grids
    'ytd-reel-item-renderer'           // Shorts shelf
  ].join(', ');

  function scanVideos() {
    if (!isEnabled || !currentGoal) {
      clearAllFilters();
      return;
    }

    const videos = document.querySelectorAll(VIDEO_SELECTORS);

    videos.forEach(video => {
      // Extract video title from the known title elements
      const titleEl =
        video.querySelector('#video-title') ||
        video.querySelector('#video-title-link') ||
        video.querySelector('a#video-title') ||
        video.querySelector('[id="video-title"]') ||
        video.querySelector('h3 a') ||
        video.querySelector('.title');

      if (!titleEl) return;

      const title = (titleEl.textContent || titleEl.getAttribute('title') || '').trim();
      if (!title) return;

      if (isRelevant(title)) {
        markRelevant(video);
      } else {
        markIrrelevant(video);
      }
    });
  }

  // ── Clear All Filters ─────────────────────────────────
  function clearAllFilters() {
    document.querySelectorAll(`.${PREFIX}-blurred`).forEach(el => {
      markRelevant(el);
    });
  }

  // ── Debounced Scan ────────────────────────────────────
  // Prevents excessive scanning during rapid DOM changes (infinite scroll)
  function debouncedScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(scanVideos, 300);
  }

  // ── MutationObserver ──────────────────────────────────
  // Watches for new videos being added to the DOM (infinite scroll, navigation)
  const observer = new MutationObserver((mutations) => {
    let hasNewContent = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewContent = true;
        break;
      }
    }
    if (hasNewContent) {
      debouncedScan();
    }
  });

  function startObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // ── Message Listener ──────────────────────────────────
  // React to real-time updates from popup via background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'GOAL_UPDATED') {
      currentGoal = message.goal || '';
      scanVideos();
    }
    if (message.type === 'TOGGLE_CHANGED') {
      isEnabled = message.isEnabled;
      if (!isEnabled) {
        clearAllFilters();
      } else {
        scanVideos();
      }
    }
  });

  // ── Initialize ────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      currentGoal = response.focusGoal || '';
      isEnabled   = response.isEnabled !== false;
      scanVideos();
    }
  });

  // Start observing for dynamically loaded content
  startObserver();

  // Also rescan on navigation within YouTube SPA
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      debouncedScan();
    }
  }, 1000);

})();
