// DOM command bar: resource readout, context-sensitive action buttons, a
// feedback line for invalid commands, and the victory/defeat banner. Kept free
// of Phaser so UI wiring stays separate from the scene's game logic.

export function createCommandPanel(handlers = {}) {
  const panel = document.querySelector('#command-panel');
  const feedback = document.querySelector('#feedback');
  const resourceEl = document.querySelector('#resource-info');
  const banner = document.querySelector('#banner');
  const exportButton = document.querySelector('#log-export');
  const soundButton = document.querySelector('#sound-toggle');
  const raidAlert = document.querySelector('#raid-alert');
  const onboarding = document.querySelector('#onboarding');
  const onboardingClose = document.querySelector('#onboarding-close');

  function dismissOnboarding() {
    onboarding?.classList.add('onboarding--hidden');
  }

  // Let the player close the quick-start card manually; it also auto-hides on
  // the first issued order (wired from the scene). No persistence by design.
  if (onboardingClose) {
    onboardingClose.addEventListener('click', (event) => {
      event.stopPropagation();
      dismissOnboarding();
    });
  }

  // The export button is persistent (not part of the context-sensitive command
  // bar), so wiring it here keeps the train/build buttons untouched.
  if (exportButton && handlers.onExportLog) {
    exportButton.addEventListener('click', (event) => {
      event.stopPropagation();
      handlers.onExportLog();
    });
  }

  // Opt-in sound toggle. The click is the user gesture that unlocks Web Audio,
  // so the scene only creates/resumes the AudioContext from inside this handler.
  function renderSoundButton(enabled) {
    if (!soundButton) return;
    soundButton.setAttribute('aria-pressed', String(Boolean(enabled)));
    soundButton.textContent = enabled ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt';
  }
  if (soundButton && handlers.onToggleSound) {
    soundButton.addEventListener('click', (event) => {
      event.stopPropagation();
      renderSoundButton(handlers.onToggleSound());
    });
  }

  const buttons = {
    trainVillager: makeButton('Huấn luyện Villager (50 Food)', handlers.onTrainVillager),
    buildBarracks: makeButton('Xây Barracks (125 Wood)', handlers.onBuildBarracks),
    trainClubman: makeButton('Huấn luyện Clubman (50 Food)', handlers.onTrainClubman),
  };
  Object.values(buttons).forEach((button) => panel?.appendChild(button));

  function makeButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cmd-btn';
    button.textContent = label;
    button.style.display = 'none';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!button.disabled) onClick?.();
    });
    return button;
  }

  let feedbackTimer = null;

  return {
    /** Update the Food / Wood / Population readout. */
    setResources({ food, wood, population, cap }) {
      if (resourceEl) {
        resourceEl.textContent = `Food: ${food} · Wood: ${wood} · Dân số: ${population}/${cap}`;
      }
    },

    /**
     * Toggle each button. `config` maps button key -> { visible, enabled, label }.
     * Hidden buttons are fully removed from the flow so the bar stays compact.
     */
    setButtons(config = {}) {
      for (const [key, button] of Object.entries(buttons)) {
        const spec = config[key];
        if (!spec?.visible) {
          button.style.display = 'none';
          continue;
        }
        button.style.display = 'inline-block';
        button.disabled = !spec.enabled;
        if (spec.label) button.textContent = spec.label;
      }
    },

    /** Show a transient, user-facing message (e.g. an invalid-command reason). */
    setFeedback(message, { sticky = false } = {}) {
      if (!feedback) return;
      feedback.textContent = message ?? '';
      feedback.classList.toggle('feedback--active', Boolean(message));
      if (feedbackTimer) clearTimeout(feedbackTimer);
      if (message && !sticky) {
        feedbackTimer = setTimeout(() => {
          feedback.textContent = '';
          feedback.classList.remove('feedback--active');
        }, 2600);
      }
    },

    /** Reveal the end-of-game banner (victory or defeat). */
    showBanner(text, kind = 'win') {
      if (!banner) return;
      banner.textContent = text;
      banner.className = `banner banner--${kind} banner--visible`;
    },

    /**
     * Show the raid countdown / raid-begins alert. `level` is 'warn' (pending
     * countdown) or 'alert' (raid underway). An empty message clears it.
     */
    setRaidAlert(message, level = 'warn') {
      if (!raidAlert) return;
      if (!message) {
        this.clearRaidAlert();
        return;
      }
      raidAlert.textContent = message;
      raidAlert.className = `raid-alert raid-alert--${level} raid-alert--visible`;
    },

    /** Hide the raid alert. */
    clearRaidAlert() {
      if (!raidAlert) return;
      raidAlert.textContent = '';
      raidAlert.className = 'raid-alert';
    },

    /** Reflect the current sound on/off state on the toggle button. */
    setSoundEnabled: renderSoundButton,

    /** Dismiss the first-session onboarding card (close button or first order). */
    dismissOnboarding,
  };
}
