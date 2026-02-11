/**
 * Focus Firewall — Popup Script
 * Handles UI interactions, goal persistence, and toggle state.
 */

document.addEventListener('DOMContentLoaded', init);

function init() {
  const goalInput    = document.getElementById('goalInput');
  const saveBtn      = document.getElementById('saveGoal');
  const clearBtn     = document.getElementById('clearGoal');
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusDot    = document.getElementById('statusDot');
  const statusText   = document.getElementById('statusText');
  const activeSection = document.getElementById('activeGoalSection');
  const activeText   = document.getElementById('activeGoalText');
  const container    = document.querySelector('.popup-container');

  // ── Load persisted state ──────────────────────────────
  chrome.storage.local.get(['focusGoal', 'isEnabled'], (data) => {
    const goal    = data.focusGoal || '';
    const enabled = data.isEnabled !== false; // default true

    goalInput.value = goal;
    toggleSwitch.checked = enabled;
    applyToggleUI(enabled);

    if (goal.trim()) {
      showActiveGoal(goal);
    }
  });

  // ── Save Goal ─────────────────────────────────────────
  saveBtn.addEventListener('click', () => {
    const goal = goalInput.value.trim();
    if (!goal) {
      showToast('⚠ Please enter a focus goal');
      goalInput.focus();
      return;
    }

    chrome.runtime.sendMessage({ type: 'SET_GOAL', goal }, () => {
      showActiveGoal(goal);
      showToast('🔒 Goal locked in!');

      // Brief visual feedback on save button
      saveBtn.classList.add('saved');
      saveBtn.textContent = '✓ Locked In';
      setTimeout(() => {
        saveBtn.classList.remove('saved');
        saveBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align: middle; margin-right: 6px;">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Lock In Goal`;
      }, 1500);
    });
  });

  // Allow pressing Enter to save
  goalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBtn.click();
  });

  // ── Clear Goal ────────────────────────────────────────
  clearBtn.addEventListener('click', () => {
    goalInput.value = '';
    goalInput.focus();
    chrome.runtime.sendMessage({ type: 'SET_GOAL', goal: '' }, () => {
      activeSection.style.display = 'none';
      showToast('Goal cleared');
    });
  });

  // ── Toggle ON/OFF ─────────────────────────────────────
  toggleSwitch.addEventListener('change', () => {
    const enabled = toggleSwitch.checked;
    chrome.runtime.sendMessage({ type: 'SET_ENABLED', isEnabled: enabled }, () => {
      applyToggleUI(enabled);
      showToast(enabled ? '🛡 Protection activated' : '⏸ Protection paused');
    });
  });

  // ── UI Helpers ────────────────────────────────────────

  function applyToggleUI(enabled) {
    if (enabled) {
      statusDot.classList.remove('off');
      statusText.textContent = 'Protection Active';
      container.classList.remove('disabled');
    } else {
      statusDot.classList.add('off');
      statusText.textContent = 'Protection Paused';
      container.classList.add('disabled');
    }
  }

  function showActiveGoal(goal) {
    activeText.textContent = goal;
    activeSection.style.display = 'block';
  }

  function showToast(message) {
    // Remove existing toast if any
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Auto dismiss
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    }, 2000);
  }
}
