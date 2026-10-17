import { t } from "./i18n.js";
import { MODES, NUMBER_COLORS } from "./constants.js";
import { evenOddRulesText } from "./modes/par-ou-impar.js";
import { bolinhoRulesText, DEFAULT_BOLINHO } from "./modes/bolinho.js";
import { eightBallRulesText } from "./modes/bola-8.js";
import { threeBallsRulesText } from "./modes/three-balls.js";
import { loadStats, resetStats, winRate } from "./stats.js";
import { saveSettings } from "./settings.js";

export class UI {
  constructor({ root, settings, audio, onStart, onPauseAction, onOnlineAction, onOnlineCancel }) {
    this.root = root;
    this.settings = settings;
    this.audio = audio;
    this.onStart = onStart;
    this.onPauseAction = onPauseAction;
    this.onOnlineAction = onOnlineAction;
    this.onOnlineCancel = onOnlineCancel;
    this.onFineAim = null;
    this.lang = settings.language;
    this.aimDir = { x: 1, z: 0 };
    this.spin = { x: 0, y: 0 };
    this.power = 0.42;
    this.cueElevation = 0;
    this.game = null;
    this.setup = {
      mode: MODES.EIGHT_BALL,
      vsAi: true,
      difficulty: "medium",
      p1Group: "even",
      aimAssist: settings.aimAssist,
      bolinho: { ...DEFAULT_BOLINHO },
    };
    this._bind();
    this.applyLanguage();
    this.syncSettingsForm();
    this.renderStats();
  }

  tx(key, vars) {
    return t(this.lang, key, vars);
  }

  _bind() {
    this.root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-nav]");
      if (btn) {
        this.audio.click();
        this.showScreen(btn.dataset.nav);
      }
      const start = e.target.closest("[data-start]");
      if (start) this._openRulesThenStart();
      const onlineAction = e.target.closest("[data-online-action]");
      if (onlineAction) this._handleOnlineAction(onlineAction.dataset.onlineAction);
      if (e.target.closest("#cancelOnline")) this.onOnlineCancel?.();
      if (e.target.closest("#copyRoomCode")) this._copyRoomCode();
      const pause = e.target.closest("[data-pause-action]");
      if (pause) this.onPauseAction?.(pause.dataset.pauseAction);
      const cat = e.target.closest("[data-group]");
      if (cat) this.setup.p1Group = cat.dataset.group;
      const reset = e.target.closest("[data-reset-stats]");
      if (reset) {
        resetStats();
        this.renderStats();
      }
      const fs = e.target.closest("[data-fullscreen]");
      if (fs) this.toggleFullscreen();
      const controlsToggle = e.target.closest("[data-controls-toggle]");
      if (controlsToggle) {
        const panel = this.root.querySelector("#mobileControlsPanel");
        this._setMobileControlsOpen(!panel?.classList.contains("open"));
      }
      const shoot = e.target.closest("[data-shoot]");
      if (shoot) this.game?.shoot();
      const historyToggle = e.target.closest("[data-history-toggle]");
      if (historyToggle) {
        this.audio.click();
        this._toggleHistory();
      }
      const fineAim = e.target.closest("[data-aim-fine]");
      if (fineAim) {
        this.onFineAim?.(fineAim.dataset.aimFine === "left" ? -1 : 1);
        return;
      }
      const cam = e.target.closest("[data-cam]");
      if (cam && this.game) {
        if (cam.dataset.cam === "reset") this.game.cameraRig.reset();
        if (cam.dataset.cam === "angle") this.game.cameraRig.cycleAngle();
        if (cam.dataset.cam === "in") this.game.cameraRig.zoom(-0.25);
        if (cam.dataset.cam === "out") this.game.cameraRig.zoom(0.25);
        if (cam.dataset.cam === "left") this.game.cameraRig.orbit(40, 0);
        if (cam.dataset.cam === "right") this.game.cameraRig.orbit(-40, 0);
      }
    });

    this.root.querySelector("#modeSelect")?.addEventListener("change", (e) => {
      this.setup.mode = e.target.value;
      this._toggleModeExtras();
    });
    this.root.querySelector("#playerSelect")?.addEventListener("change", (e) => {
      this.setup.vsAi = e.target.value === "ai";
      this._togglePlayerExtras();
    });
    this.root.querySelector("#diffSelect")?.addEventListener("change", (e) => {
      this.setup.difficulty = e.target.value;
    });
    this.root.querySelector("#matchAimAssist")?.addEventListener("change", (e) => {
      this.setup.aimAssist = e.target.checked;
    });
    this.root.querySelector("#powerSlider")?.addEventListener("input", (e) => {
      this.power = Number(e.target.value);
      this._powerLabel();
    });
    this.root.querySelector("#cueElevation")?.addEventListener("input", (e) => {
      this.cueElevation = Number(e.target.value);
      this._elevationLabel();
    });

    const spinBall = this.root.querySelector("#spinBall");
    spinBall?.addEventListener("pointerdown", (e) => {
      if (spinBall.disabled) return;
      e.preventDefault();
      spinBall.setPointerCapture(e.pointerId);
      this._setSpinFromPointer(spinBall, e);
    });
    spinBall?.addEventListener("pointermove", (e) => {
      if (spinBall.hasPointerCapture(e.pointerId)) this._setSpinFromPointer(spinBall, e);
    });
    spinBall?.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.25 : 0.1;
      const changes = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const change = changes[e.key];
      if (!change) return;
      e.preventDefault();
      e.stopPropagation();
      this._setSpin(this.spin.x + change[0], this.spin.y + change[1]);
    });

    this.root.querySelectorAll("[data-setting]").forEach((el) => {
      el.addEventListener("change", () => this._readSettings());
      el.addEventListener("input", () => this._readSettings());
    });

    document.addEventListener("fullscreenchange", () => this._syncFullscreenButton());
  }

  _toggleModeExtras() {
    const even = this.root.querySelector("#evenOddSetup");
    const bol = this.root.querySelector("#bolinhoSetup");
    if (even) even.hidden = this.setup.mode !== MODES.EVEN_ODD;
    if (bol) bol.hidden = this.setup.mode !== MODES.BOLINHO;
  }

  _togglePlayerExtras() {
    const online = this.root.querySelector("#onlineSetup");
    const start = this.root.querySelector("[data-start]");
    const isOnline = this.root.querySelector("#playerSelect")?.value === "online";
    if (online) online.hidden = !isOnline;
    if (start) start.hidden = isOnline;
    this.setup.vsAi = this.root.querySelector("#playerSelect")?.value === "ai";
  }

  _handleOnlineAction(action) {
    if (action === "host") {
      this._openRulesThenStart("host");
      return;
    }
    const code = this.root.querySelector("#roomCodeInput")?.value.trim().toLowerCase() || "";
    if (!/^[2-9a-hj-np-z]{6}$/.test(code)) {
      this.showMessage(this.tx("invalidRoomCode"));
      return;
    }
    this.onOnlineAction?.({ action: "join", code });
  }

  showOnlineLobby({ hosting, code = "" }) {
    const roomCode = this.root.querySelector("#onlineRoomCode");
    const copyButton = this.root.querySelector("#copyRoomCode");
    if (roomCode) {
      roomCode.textContent = code;
      roomCode.hidden = !hosting;
    }
    if (copyButton) copyButton.hidden = !hosting;
    this.setOnlineStatus("onlineConnecting");
    this.setOnlineWarning("");
    this.showScreen("screen-online");
  }

  setOnlineStatus(key, detail = "") {
    const status = this.root.querySelector("#onlineStatus");
    if (status) status.textContent = `${this.tx(key)}${detail ? `: ${detail}` : ""}`;
  }

  setOnlineWarning(key) {
    const warning = this.root.querySelector("#onlineWarning");
    if (!warning) return;
    warning.hidden = !key;
    warning.textContent = key ? this.tx(key) : "";
  }

  async _copyRoomCode() {
    const code = this.root.querySelector("#onlineRoomCode")?.textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.setOnlineStatus("codeCopied");
    } catch (error) {
      this.setOnlineStatus("onlineCopyError", error.message);
    }
  }

  _readSettings() {
    const g = (id) => this.root.querySelector(id);
    this.settings = saveSettings({
      quality: g("#setQuality")?.value,
      sfx: Number(g("#setSfx")?.value ?? this.settings.sfx),
      music: Number(g("#setMusic")?.value ?? this.settings.music),
      aimSensitivity: Number(g("#setAim")?.value ?? 1),
      cameraSpeed: Number(g("#setCamSpeed")?.value ?? 1),
      cameraDistance: Number(g("#setCamDist")?.value ?? 1),
      language: g("#setLang")?.value,
      vibrate: g("#setVibrate")?.checked,
      fullscreen: g("#setFull")?.checked,
      aimAssist: g("#setAimAssist")?.checked,
    });
    this.setup.aimAssist = this.settings.aimAssist;
    const matchAimAssist = g("#matchAimAssist");
    if (matchAimAssist) matchAimAssist.checked = this.setup.aimAssist;
    this.lang = this.settings.language;
    this.audio.setVolumes(this.settings);
    this.applyLanguage();
    this.onSettingsChange?.(this.settings);
    if (this.settings.fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  playerInitial(name) {
    return String(name || "?").trim().charAt(0).toUpperCase() || "?";
  }

  syncSettingsForm() {
    const s = this.settings;
    const set = (id, val, type = "value") => {
      const el = this.root.querySelector(id);
      if (!el) return;
      if (type === "checked") el.checked = val;
      else el.value = val;
    };
    set("#setQuality", s.quality);
    set("#setSfx", s.sfx);
    set("#setMusic", s.music);
    set("#setAim", s.aimSensitivity);
    set("#setCamSpeed", s.cameraSpeed);
    set("#setCamDist", s.cameraDistance);
    set("#setLang", s.language);
    set("#setVibrate", s.vibrate, "checked");
    set("#setFull", s.fullscreen, "checked");
    set("#setAimAssist", s.aimAssist, "checked");
    const matchAimAssist = this.root.querySelector("#matchAimAssist");
    if (matchAimAssist) {
      matchAimAssist.checked = s.aimAssist;
      this.setup.aimAssist = s.aimAssist;
    }
  }

  applyLanguage() {
    this.root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = this.tx(el.dataset.i18n);
    });
    this.root.querySelector("[data-history-toggle].history-toggle")
      ?.setAttribute("aria-label", this.tx("history"));
    this.root.querySelector(".history-close")
      ?.setAttribute("aria-label", this.tx("historyClose"));
    this._setMobileControlsOpen(false);
    this._syncFullscreenButton();
    const spinBall = this.root.querySelector("#spinBall");
    if (spinBall) {
      spinBall.title = this.tx("spinHelp");
      spinBall.setAttribute("aria-label", this.tx("spinHelp"));
    }
    this._toggleModeExtras();
    this.renderStats();
  }

  showScreen(id) {
    this.root.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
    const hud = this.root.querySelector("#hud");
    const playing = id === "screen-game";
    if (hud) hud.hidden = !playing;
    if (!playing) this._setMobileControlsOpen(false);
    if (id === "screen-stats") this.renderStats();
    if (id === "screen-play") this._toggleModeExtras();
  }

  _openRulesThenStart(onlineAction = null) {
    const list = this.root.querySelector("#rulesList");
    list.innerHTML = "";
    const lang = this.lang;
    let lines = [];
    if (this.setup.mode === MODES.EVEN_ODD) lines = evenOddRulesText(lang);
    else if (this.setup.mode === MODES.BOLINHO) {
      const count = Number(this.root.querySelector("#bolinhoCount")?.value || 8);
      this.setup.bolinho = { ...DEFAULT_BOLINHO, ballCount: count };
      lines = bolinhoRulesText(lang, this.setup.bolinho);
    } else if (this.setup.mode === MODES.THREE_BALLS) lines = threeBallsRulesText(lang);
    else lines = eightBallRulesText(lang);
    lines.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      list.appendChild(li);
    });
    this.showScreen("screen-rules");
    const go = this.root.querySelector("#confirmRules");
    go.onclick = () => {
      this.audio.click();
      this.showScreen("screen-game");
      if (onlineAction) {
        this.onOnlineAction?.({
          action: onlineAction,
          config: { ...this.setup, vsAi: false, multiplayer: true, multiplayerHost: true, localPlayer: 0 },
        });
      } else {
        this.onStart({ ...this.setup });
      }
    };
  }

  updateHud({ players, current, mode, modeState, history }) {
    const p1 = this.root.querySelector("#hudP1");
    const p2 = this.root.querySelector("#hudP2");
    if (p1 && p2 && players) {
      p1.classList.toggle("active-player", current === 0);
      p2.classList.toggle("active-player", current === 1);
      p1.querySelector(".name").textContent = players[0].name;
      p2.querySelector(".name").textContent = players[1].name;
      p1.querySelector(".player-avatar").textContent = this.playerInitial(players[0].name);
      p2.querySelector(".player-avatar").textContent = this.playerInitial(players[1].name);
      p1.querySelector(".ball-rack").setAttribute("aria-label", this.tx("remaining"));
      p2.querySelector(".ball-rack").setAttribute("aria-label", this.tx("remaining"));
      p1.querySelector(".meta").textContent = this._playerMeta(0, mode, modeState, players[0]);
      p2.querySelector(".meta").textContent = this._playerMeta(1, mode, modeState, players[1]);
      this._renderBallRack(p1.querySelector(".ball-rack"), this._playerBalls(0, mode, modeState));
      this._renderBallRack(p2.querySelector(".ball-rack"), this._playerBalls(1, mode, modeState));
    }
    const modeEl = this.root.querySelector("#hudMode");
    if (modeEl) {
      modeEl.textContent =
        mode === MODES.EVEN_ODD
          ? this.tx("evenOdd")
          : mode === MODES.BOLINHO
            ? this.tx("bolinho")
            : mode === MODES.THREE_BALLS
              ? this.tx("threeBalls")
              : this.tx("eightBall");
    }
    const hist = this.root.querySelector("#hudHistory");
    if (hist && history) {
      hist.innerHTML = history
        .slice(0, 6)
        .map((h) => `<li><strong>${h.player}</strong> — ${h.text}${h.potted?.length ? ` (${h.potted.join(",")})` : ""}</li>`)
        .join("");
    }
    const turn = this.root.querySelector("#hudTurn");
    if (turn && players) {
      const mine = current === 0 || !players[current].isAi;
      turn.textContent = players[current].isAi && current === 1 ? this.tx("opponentTurn") : this.tx("playerTurn", { name: players[current].name });
      void mine;
    }
  }

  _playerMeta(i, mode, st, player) {
    const fouls = `${this.tx("fouls")}: ${player.fouls}`;
    if (mode === MODES.BOLINHO) {
      return `${this.tx("score")}: ${st.scores[i]} · ${this.tx("remaining")}: ${st.objectBalls.length} · ${fouls}`;
    }
    if (mode === MODES.THREE_BALLS) {
      return `${this.tx("remaining")}: ${st.objectBalls.length} · ${fouls}`;
    }
    if (mode === MODES.EVEN_ODD) {
      const g = st.playerGroups[i];
      const label = g === "even" ? this.tx("even") : this.tx("odd");
      return `${label} · ${fouls}`;
    }
    const g = st.playerGroups[i];
    const label = !st.groupsAssigned ? "—" : g === "solids" ? this.tx("solids") : this.tx("stripes");
    return `${label} · ${fouls}`;
  }

  _playerBalls(i, mode, st) {
    if (mode === MODES.BOLINHO || mode === MODES.THREE_BALLS) return st.objectBalls;
    if (mode === MODES.EVEN_ODD) return st.remaining[st.playerGroups[i]] || [];

    if (!st.groupsAssigned) return [...st.solids, ...st.stripes];
    const group = st.playerGroups[i];
    const remaining = group === "solids" ? st.solids : st.stripes;
    if (remaining.length) return remaining;
    return st.solids.length || st.stripes.length ? [8] : [];
  }

  _renderBallRack(rack, numbers) {
    if (!rack) return;
    rack.replaceChildren();
    for (const number of numbers || []) {
      const ball = document.createElement("span");
      const color = NUMBER_COLORS[number] || 0xcccccc;
      ball.className = `rack-ball${number >= 9 ? " striped" : ""}${number === 8 ? " eight-ball" : ""}`;
      ball.textContent = String(number);
      ball.style.setProperty("--ball-color", `#${color.toString(16).padStart(6, "0")}`);
      ball.setAttribute("aria-label", `${this.tx("ball")} ${number}`);
      rack.appendChild(ball);
    }
  }

  _toggleHistory() {
    const panel = this.root.querySelector("#historyPanel");
    const toggles = this.root.querySelectorAll("[data-history-toggle]");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    toggles.forEach((toggle) => toggle.setAttribute("aria-expanded", String(!panel.hidden)));
  }

  showMessage(text, ms = 1600) {
    const el = this.root.querySelector("#toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this._toast);
    this._toast = setTimeout(() => el.classList.remove("show"), ms);
  }

  showGameOver({ winner, youWin, vsAi }) {
    const el = this.root.querySelector("#gameOver");
    el.hidden = false;
    el.querySelector("h2").textContent = vsAi ? (youWin ? this.tx("victory") : this.tx("defeat")) : this.tx("gameOver");
    el.querySelector("p").textContent = winner;
  }

  hideGameOver() {
    const el = this.root.querySelector("#gameOver");
    if (el) el.hidden = true;
  }

  setPause(open) {
    this.root.querySelector("#pauseMenu").hidden = !open;
  }

  setControlsEnabled(on) {
    const bar = this.root.querySelector("#aimDock");
    if (bar) bar.classList.toggle("disabled", !on);
    const spinBall = this.root.querySelector("#spinBall");
    if (spinBall) spinBall.disabled = !on;
  }

  _setMobileControlsOpen(open) {
    const panel = this.root.querySelector("#mobileControlsPanel");
    if (!panel) return;
    panel.classList.toggle("open", open);
    this.root.querySelectorAll("[data-controls-toggle]").forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
      const label = this.tx(open ? "closeControls" : "controls");
      button.setAttribute("aria-label", label);
      button.title = label;
      const text = button.querySelector("[data-i18n]");
      if (text) text.textContent = label;
    });
  }

  _setSpinFromPointer(element, event) {
    const bounds = element.getBoundingClientRect();
    const range = bounds.width * 0.32;
    this._setSpin(
      (event.clientX - (bounds.left + bounds.width / 2)) / range,
      ((bounds.top + bounds.height / 2) - event.clientY) / range
    );
  }

  resetSpin() {
    this._setSpin(0, 0);
  }

  _setSpin(x, y) {
    this.spin.x = Math.max(-1, Math.min(1, x));
    this.spin.y = Math.max(-1, Math.min(1, y));
    const dot = this.root.querySelector("#spinBall .spin-dot");
    if (dot) {
      dot.style.left = `${50 + this.spin.x * 32}%`;
      dot.style.top = `${50 - this.spin.y * 32}%`;
    }
  }

  setBallInHand(on, kitchen) {
    const el = this.root.querySelector("#placeDock");
    if (el) {
      el.hidden = !on;
      el.querySelector("small").textContent = kitchen ? this.tx("kitchenHint") : this.tx("ballInHand");
    }
    this.setControlsEnabled(!on);
  }

  syncAimWidgets() {
    const sl = this.root.querySelector("#powerSlider");
    if (sl) sl.value = String(this.power);
    this._powerLabel();
  }

  _powerLabel() {
    const el = this.root.querySelector("#powerValue");
    if (el) el.textContent = Math.round(this.power * 100) + "%";
  }

  _elevationLabel() {
    const el = this.root.querySelector("#cueElevationValue");
    if (el) el.textContent = `${Math.round(this.cueElevation * 18)}°`;
  }

  renderStats() {
    const stats = loadStats();
    const box = this.root.querySelector("#statsBody");
    if (!box) return;
    const row = (title, b) =>
      `<article class="stat-card"><h3>${title}</h3>
        <p>${this.tx("matches")}: ${b.matches}</p>
        <p>${this.tx("wins")}: ${b.wins} · ${this.tx("losses")}: ${b.losses}</p>
        <p>${this.tx("winRate")}: ${winRate(b)}%</p>
        <p>${this.tx("ballsPocketed")}: ${b.ballsPocketed}</p>
        <p>${this.tx("foulsMade")}: ${b.fouls}</p>
        <p>${this.tx("bestRun")}: ${b.bestRun}</p></article>`;
    box.innerHTML =
      row(this.tx("stats"), stats) +
      row(this.tx("evenOdd"), stats.modes[MODES.EVEN_ODD]) +
      row(this.tx("bolinho"), stats.modes[MODES.BOLINHO]) +
      row(this.tx("eightBall"), stats.modes[MODES.EIGHT_BALL]) +
      row(this.tx("threeBalls"), stats.modes[MODES.THREE_BALLS]);
  }

  toggleFullscreen() {
    const target = document.fullscreenElement ? document : document.documentElement;
    const action = document.fullscreenElement ? target.exitFullscreen : target.requestFullscreen;
    if (typeof action !== "function") {
      this.showMessage(this.tx("fullscreenUnavailable"));
      return;
    }
    Promise.resolve(action.call(target)).catch((error) => {
      this.showMessage(error.message || this.tx("fullscreenUnavailable"));
    });
  }

  _syncFullscreenButton() {
    const button = this.root.querySelector("[data-fullscreen]");
    if (!button) return;
    const label = this.tx(document.fullscreenElement ? "exitFullscreen" : "fullscreen");
    button.setAttribute("aria-pressed", String(Boolean(document.fullscreenElement)));
    button.setAttribute("aria-label", label);
    button.title = label;
    const text = button.querySelector("[data-i18n]");
    if (text) text.textContent = label;
  }
}
