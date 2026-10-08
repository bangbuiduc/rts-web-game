// DOM command bar: resource readout, context-sensitive action buttons, a
// feedback line for invalid commands, and the victory/defeat banner. Kept free
// of Phaser so UI wiring stays separate from the scene's game logic.

export function createCommandPanel(handlers = {}) {
  const panel = document.querySelector('#command-panel');
  const feedback = document.querySelector('#feedback');
  const resourceEl = document.querySelector('#resource-info');
  const banner = document.querySelector('#banner');
  const exportButton = document.querySelector('#log-export');

  // The export button is persistent (not part of the context-sensitive command
  // bar), so wiring it here keeps the train/build buttons untouched.
  if (exportButton && handlers.onExportLog) {
    exportButton.addEventListener('click', (event) => {
      event.stopPropagation();
      handlers.onExportLog();
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
  };
}
