// Rig tab, laid out like the iPhone's RigView (ContentView.swift): link card, battery/power/units tiles,
// UNLINK (or FIND YOUR RIG), Look, and Shop tools (Log, Ride the dial, Raw status). Screens only: the only
// rig calls are askDisconnect, dialNudge and dialMode, the same ones the iPhone screens use.

import { BLEManager } from "../rig/ble-manager";
import { RigController } from "../rig/rig-controller";
import type { PeakController } from "../rig/puffco/peak-controller";
import { chargingOf, unitText, sessionOnOf, hapticsOf } from "../rig/frames";
import { h, openSheet, topBar, textBtn, tag, icon } from "./jar-ui";
import { CLEAN_CHOICES } from "./extras";
import type { Jar } from "./jars";
import { loadLife, summarize, rigRows, durText } from "./lifetime";

export interface RigUIHooks {
  build: string;
  onFindRig(): void;
  lookLabel(): string;
  /** Fills the Look page (mode, faces, sound). */
  buildLook(page: HTMLElement): void;
  /** Clean reminder: how many dabs between reminders (the user's pick; Dr. Dabber gives no number). */
  cleanEvery(): number;
  showTutorial(): void;
  cleanOn(): boolean;
  setClean(on: boolean, every: number): void;
  /** Peak test build only: the Peak controller when a Peak is the linked rig, else null. */
  peak?: () => PeakController | null;
  /** Jars, for lifetime stats per jar. */
  jars(): Jar[];
  /** "About N dabs left" or null. */
  dabsLeft(): string | null;
  /** Peak test build only: the "compatible with" line. */
  compatLine?: string;
}

const set = (e: Element, t: string) => { if (e.textContent !== t) e.textContent = t; };

export function mountRig(ble: BLEManager, rig: RigController, hooks: RigUIHooks) {
  const panel = document.getElementById("rigPanel")!;
  const linked = () => ble.isConnected || ble.reconnecting || !!hooks.peak?.();

  // Link card
  const linkIcon = h("span", { class: "rigIcon" }, icon("signal"));
  const linkName = h("b", { class: "cond", style: "font-size:26px;display:block" });
  const linkText = h("span", { class: "mono sub", style: "font-size:10px" });
  const linkCard = h("div", { class: "linkCard" }, linkIcon, h("div", { style: "min-width:0" }, linkName, linkText));

  const tile = (title: string) => { const v = h("b"); return { el: h("div", { class: "panel tile" }, tag(title, "font-size:9px"), v), v }; };
  const tBat = tile("BATTERY"), tPow = tile("POWER"), tUnit = tile("UNITS");

  const unlink = h("button", { class: "unlink", onclick: () => { const pk = hooks.peak?.(); if (pk) pk.disconnect(); else rig.askDisconnect(); } }, "UNLINK");
  const unlinkNote = h("p", { class: "mono sub", style: "font-size:10.5px;margin:0" }, "Dab's still going. It finishes first, then the app lets go of the rig.");
  const findRig = h("button", { class: "findRig", onclick: hooks.onFindRig }, "FIND YOUR RIG");

  const row = (title: string, ico: string, note: () => string, noteColor: string, open: () => void) => {
    const n = h("span", { class: "tag", style: `color:${noteColor}` });
    const b = h("button", { class: "toolRow", onclick: open }, h("span", { class: "toolIcon" }, icon(ico)), h("span", { class: "cond", style: "font-size:20px" }, title), h("span", { style: "flex:1" }), n, h("span", { class: "chev" }, "›"));
    return { b, upd: () => set(n, note()) };
  };
  const look = row("Look", "look", () => hooks.lookLabel(), "var(--dim)", openLook);
  const clean = row("Deep clean", "check", () => hooks.cleanOn() ? `EVERY ${hooks.cleanEvery()} DABS` : "OFF", "var(--dim)", openClean);
  const howTo = row("How it works", "list", () => "REPLAY", "var(--dim)", () => hooks.showTutorial());
  const log = row("Log", "list", () => "SHARE IT", "var(--dim)", openLog);
  const dial = row("Ride the dial", "dial", () => "TEST", "var(--gold)", openDial);
  const raw = row("Raw status", "pulse", () => "", "var(--dim)", openRaw);
  const settings = row("Rig settings", "rig", () => { const s = rig.live; return s ? `${s.brightness === 0 ? "STEALTH" : s.brightness + "%"} · °${unitText(s)}` : ""; }, "var(--dim)", openSettings);
  const stats = row("Lifetime stats", "list", () => rig.rigStats.heatCycles !== undefined ? `${rig.rigStats.heatCycles} CYCLES` : "", "var(--gold)", openStats);

  panel.replaceChildren(
    h("h2", {}, "RIG"),
    linkCard,
    h("div", { class: "tiles" }, tBat.el, tPow.el, tUnit.el),
    h("div", { class: "stackS" }, unlink, unlinkNote, findRig),
    h("div", { class: "panel toolList" }, settings.b, h("hr"), stats.b, h("hr"), clean.b, h("hr"), howTo.b),
    h("div", {}, tag("SHOP TOOLS", "font-size:9.5px"), h("div", { class: "panel toolList", style: "margin-top:8px" }, log.b, h("hr"), raw.b)),
    h("p", { class: "mono dim center", style: "font-size:9.5px;margin-top:6px" }, `${hooks.compatLine ?? "Compatible with Dr. Dabber Switch 2. Not an official Dr. Dabber app."} Build ${hooks.build}.`),
  );

  let pageUpd: (() => void) | null = null;
  let lastStatusTime: number | null = null, seenAt = new Date();

  function render() {
    const pk = hooks.peak?.() ?? null;
    const s = pk ? pk.live : rig.live;
    set(linkName, pk ? (pk.info.name ?? pk.transport?.name ?? "Puffco Peak") : ble.peripheralName || "No rig");
    set(linkText, pk ? `Peak · ${pk.link === "ready" ? pk.phaseText : pk.link}${pk.info.firmware ? " · firmware " + pk.info.firmware : ""}` : ble.connectionText);
    linkCard.classList.toggle("on", pk ? pk.connected : ble.isConnected);
    set(tBat.v, s ? `${s.battery}%` : "--");
    set(tPow.v, s ? (chargingOf(s) ? "Charging" : "On battery") : "--");
    set(tUnit.v, s ? "°" + unitText(s) : "--");
    const l = linked();
    unlink.hidden = !l;
    set(unlink, !pk && rig.disconnectWaiting ? "UNLINK NOW" : "UNLINK");
    unlinkNote.hidden = !(l && !pk && rig.disconnectWaiting);
    findRig.hidden = l;
    settings.b.hidden = !!pk; settings.b.nextElementSibling?.toggleAttribute("hidden", !!pk);
    look.upd(); clean.upd(); settings.upd(); stats.upd(); howTo.upd(); log.upd(); dial.upd(); raw.upd();
    pageUpd?.();
  }

  function page(title: string, fill: (body: HTMLElement) => (() => void) | void) {
    openSheet(close => {
      const body = h("div", { class: "pageBody" });
      const done = () => { pageUpd = null; close(); };
      body.append(topBar(null, null, textBtn("DONE", done, "var(--live)")), h("h2", { style: "font-size:40px;margin:0" }, title));
      const upd = fill(body);
      pageUpd = upd ?? null;
      upd?.();
      return body;
    });
  }

  function openClean() {
    page("DEEP CLEAN", body => {
      const pick = h("select", { class: "cleanPick", style: "font:inherit;font-size:20px;padding:10px 12px;border-radius:12px;background:var(--panel,#111);color:inherit;border:1px solid var(--line,#333);width:100%" }) as HTMLSelectElement;
      for (const n of CLEAN_CHOICES) pick.append(h("option", { value: String(n) }, `Every ${n} dabs`));
      pick.value = String(hooks.cleanEvery());
      const sw = h("input", { type: "checkbox", style: "width:28px;height:28px;accent-color:var(--gold)" }) as HTMLInputElement;
      sw.checked = hooks.cleanOn();
      const sync = () => { pick.disabled = !sw.checked; pick.style.opacity = sw.checked ? "1" : ".4"; hooks.setClean(sw.checked, Number(pick.value)); render(); };
      sw.onchange = sync; pick.onchange = sync; pick.disabled = !sw.checked; pick.style.opacity = sw.checked ? "1" : ".4";
      body.append(
        h("p", { class: "sub cond", style: "font-size:19px;margin:0" }, "A reminder on Home when it's time to deep clean."),
        h("label", { class: "toolRow", style: "cursor:pointer" }, h("span", { class: "cond", style: "font-size:20px" }, "Remind me"), h("span", { style: "flex:1" }), sw),
        pick);
    });
  }

  // MARK: Rig settings (app-5.16): what the Switch 2 protocol lets an app change, like the Dr. Dabber Device page.

  function openSettings() {
    page("RIG SETTINGS", body => {
      const kv = (k: string, v: HTMLElement | string) => h("div", { class: "kv" }, h("span", {}, k), typeof v === "string" ? h("b", {}, v) : v);
      const sw = () => h("input", { type: "checkbox", style: "width:28px;height:28px;accent-color:var(--gold)" }) as HTMLInputElement;
      const label = (t: string, sub: string | null, ctl: HTMLElement) => h("label", { class: "toolRow", style: "cursor:pointer;min-height:60px" },
        h("div", { style: "flex:1;min-width:0" }, h("b", { class: "cond", style: "font-size:20px;font-weight:500;display:block" }, t), sub ? h("small", { class: "mono dim", style: "font-size:10px" }, sub) : ""), ctl);

      // Lights: stealth is brightness 0 (same as the official app); turning it off goes back to the last level.
      const stealth = sw();
      let lastBright = 50;
      stealth.onchange = () => rig.setBrightness(stealth.checked ? 0 : lastBright || 50);
      const bright = h("input", { type: "range", min: "0", max: "100", step: "1", style: "flex:1;accent-color:var(--live)" }) as HTMLInputElement;
      const brightV = h("b", { class: "cond", style: "width:48px;text-align:right;font-size:20px" });
      let brightAt = 0;
      bright.oninput = () => { brightAt = Date.now(); set(brightV, bright.value + "%"); rig.setBrightness(Number(bright.value)); };
      const haptics = sw();
      haptics.onchange = () => rig.setHaptics(haptics.checked);

      // Auto shut-off: 0 = never, 1-60 min on the Switch 2.
      const offPick = h("select", { class: "textLine", style: "margin:0;width:auto;font-size:17px" }) as HTMLSelectElement;
      const offChoices = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
      const fillOff = (cur: number) => {
        const list = offChoices.includes(cur) ? offChoices : [...offChoices, cur].sort((a, b) => a - b);
        if (offPick.options.length !== list.length) offPick.replaceChildren(...list.map(n => h("option", { value: String(n) }, n ? `${n} min` : "Never")));
      };
      offPick.onchange = () => rig.setAutoShutOff(Number(offPick.value));
      const offLeft = h("small", { class: "mono dim", style: "font-size:10px" });

      const segF = h("button", { onclick: () => rig.setCelsius(false) }, "°F");
      const segC = h("button", { onclick: () => rig.setCelsius(true) }, "°C");
      const unitNote = h("small", { class: "mono dim", style: "font-size:10px" });

      // Cleaning assist (0xC6): the rig's own short warm-up for cleaning.
      const cleanBtn = h("button", { class: "btn2 wide" }) as HTMLButtonElement;
      const cleanLine = h("p", { class: "mono sub", style: "font-size:10.5px;margin:0" });

      const health = h("div", { class: "panel pad" });

      body.append(
        h("p", { class: "sub cond", style: "font-size:19px;margin:0" }, "Saved on the rig itself."),
        tag("LIGHTS", "font-size:9.5px"),
        h("div", { class: "panel toolList" },
          label("Stealth", "Lights off. Turn it off to go back to your level.", stealth), h("hr"),
          h("div", { class: "toolRow", style: "gap:12px" }, h("span", { class: "cond", style: "font-size:20px" }, "Brightness"), bright, brightV)),
        tag("FEEL AND POWER", "font-size:9.5px"),
        h("div", { class: "panel toolList" },
          label("Haptics", "The rig buzzes when it's ready.", haptics), h("hr"),
          h("div", { class: "toolRow" }, h("div", { style: "flex:1;min-width:0" }, h("b", { class: "cond", style: "font-size:20px;font-weight:500;display:block" }, "Auto shut-off"), offLeft), offPick)),
        tag("UNITS", "font-size:9.5px"),
        h("div", { class: "seg", style: "grid-template-columns:1fr 1fr;margin-top:0" }, segF, segC), unitNote,
        tag("CLEANING ASSIST", "font-size:9.5px"),
        h("div", { class: "panel pad stackS" },
          h("p", { class: "cond", style: "font-size:18px;margin:0" }, "The rig warms the chamber for about 30 seconds so residue wipes out easier. Swab it while it's warm."),
          cleanBtn, cleanLine),
        tag("BATTERY AND HEALTH", "font-size:9.5px"), health);

      return () => {
        const s = rig.live, ok = rig.canControl, heating = rig.sessionOn;
        if (s) {
          if (s.brightness > 0) lastBright = s.brightness;
          stealth.checked = s.brightness === 0;
          if (Date.now() - brightAt > 1500 && document.activeElement !== bright) { bright.value = String(s.brightness); set(brightV, s.brightness + "%"); }
          haptics.checked = hapticsOf(s);
          fillOff(s.autoShutOff);
          if (document.activeElement !== offPick) offPick.value = String(s.autoShutOff);
          set(offLeft, s.autoShutOff ? `Turns off after ${s.autoShutOff} min idle` + (s.autoShutOffRemaining ? ` · ${s.autoShutOffRemaining} min left` : "") : "Stays on until you turn it off");
          segF.classList.toggle("on", s.unitByte === 15); segC.classList.toggle("on", s.unitByte === 12);
        }
        for (const c of [stealth, bright, haptics]) c.disabled = !ok;
        offPick.disabled = !ok || heating;
        (segF as HTMLButtonElement).disabled = (segC as HTMLButtonElement).disabled = !ok || heating;
        set(unitNote, heating ? "Change units after the dab." : "Changes the rig's screen and the whole app.");
        const ca = rig.cleanAssist;
        const running = !!ca && ca.secondsLeft > 0 && Date.now() - ca.at < 5000;
        set(cleanBtn, running ? "CANCEL" : "START CLEANING ASSIST");
        cleanBtn.onclick = () => rig.cleaningAssist(!running);
        cleanBtn.disabled = !ok || (!running && heating);
        set(cleanLine, running ? `Warming · ${ca!.secondsLeft}s left` : heating ? "Not while a dab is heating." : "First time on your rig: stay with it.");
        const di = ble.deviceInfo, fw = ble.extra["Firmware (0xC3)"] ?? Object.entries(di).find(([k]) => /firmware|software/i.test(k))?.[1];
        const left = hooks.dabsLeft();
        health.replaceChildren(
          kv("Battery", s ? `${s.battery}%${chargingOf(s) ? " · charging" : ""}` : "--"),
          left ? kv("Dabs left", left) : "",
          kv("Rig", ble.peripheralName || "--"),
          fw ? kv("Firmware", fw) : "",
          ...Object.entries(di).filter(([k]) => /model|serial|hardware/i.test(k)).map(([k, v]) => kv(k, v)),
          rig.healthFlags ? kv("Status codes", rig.healthFlags.join(" · ")) : "",
          rig.healthFlags ? h("p", { class: "mono dim", style: "font-size:10px;margin:6px 0 0" }, "The rig's own codes (device, battery, board, chamber). We don't know what each number means yet.") : "");
      };
    });
  }

  // MARK: Lifetime stats (app-5.16)

  function openStats() {
    rig.requestStats();
    page("LIFETIME", body => {
      const rigBox = h("div", { class: "panel pad" });
      const mine = h("div", { class: "panel pad" });
      const jarBox = h("div", { class: "stackS" });
      body.append(
        tag("YOUR RIG, ALL TIME", "font-size:9.5px"), rigBox,
        tag("WITH TORCHLESS", "font-size:9.5px"), mine,
        tag("BY JAR", "font-size:9.5px"), jarBox);
      const kv = (k: string, v: string) => h("div", { class: "kv" }, h("span", {}, k), h("b", {}, v));
      let shownAt: number | undefined = -1;
      const life = loadLife();
      return () => {
        const celsius = rig.live?.unitByte === 12;
        if (rig.rigStats.at !== shownAt) {
          shownAt = rig.rigStats.at;
          const rows = rigRows(rig.rigStats, celsius);
          rigBox.replaceChildren(...(rows.length ? rows.map(([k, v]) => kv(k, v))
            : [h("p", { class: "mono dim", style: "margin:0;font-size:11px" }, rig.canControl ? "Asking the rig…" : "Link the rig to read its counters.")]));
          const sm = summarize(life, hooks.jars(), celsius);
          const since = sm.since ? new Date(sm.since).toLocaleDateString() : null;
          mine.replaceChildren(...(sm.dabs ? [
            kv("Dabs", String(sm.dabs)),
            kv("Heat time", durText(sm.seconds)),
            kv("Average dab", durText(sm.avgSeconds)),
            sm.favTemp !== undefined ? kv("Favorite temp", `${sm.favTemp}°`) : "",
            sm.favPreset !== undefined ? kv("Favorite preset", `P${sm.favPreset}`) : "",
            sm.favProfile ? kv("Favorite profile", sm.favProfile) : "",
            sm.hottest !== undefined ? kv("Hottest peak", `${sm.hottest}°`) : "",
            kv("Last 7 days", String(sm.last7)),
            sm.busiestDay ? kv("Busiest day", `${sm.busiestDay.n} on ${new Date(sm.busiestDay.day).toLocaleDateString()}`) : "",
            sm.avgRating !== undefined ? kv("Average rating", `${sm.avgRating} (${sm.rated} rated)`) : "",
            sm.grams ? kv("Logged", `${sm.grams} g`) : "",
            since ? h("p", { class: "mono dim", style: "font-size:10px;margin:6px 0 0" }, `Since ${since}. Counts dabs this phone saw.`) : "",
          ] : [h("p", { class: "mono dim", style: "margin:0;font-size:11px" }, "No dabs yet. They show up here after your first one.")]));
          jarBox.replaceChildren(...(sm.jars.length ? sm.jars.slice(0, 12).map(j => h("div", { class: "panel pad" },
            h("div", { class: "row" }, h("b", { class: "cond", style: "font-size:20px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, j.name),
              j.avg !== undefined ? h("b", { class: "cond gold", style: "font-size:22px" }, j.avg.toFixed(1)) : ""),
            h("small", { class: "mono dim", style: "font-size:10.5px" }, [
              `${j.dabs} dab${j.dabs === 1 ? "" : "s"}`,
              j.best !== undefined ? `best at ${j.best}°` : j.temp !== undefined ? `usually ${j.temp}°` : "",
              j.grams ? `${j.grams} g` : "",
            ].filter(Boolean).join(" · "))))
            : [h("p", { class: "mono dim", style: "margin:0;font-size:11px" }, "Pick a jar on Home and your dabs land on it.")]));
        }
      };
    });
  }

  function openLook() { page("LOOK", body => { body.append(h("p", { class: "sub cond", style: "font-size:19px;margin:0" }, "Make it yours.")); hooks.buildLook(body); }); }

  function openLog() {
    page("LOG", body => {
      const copy = h("button", { class: "btn2", style: "flex:1", onclick: async () => {
        try { await navigator.clipboard.writeText(ble.exportText(hooks.build)); set(copy, "Copied"); }
        catch { set(copy, "Copy failed: use Share"); }
      } }, "Copy");
      const share = h("button", { class: "goldBtn", style: "flex:1;margin:0;min-height:48px;font-size:18px", onclick: async () => {
        const text = ble.exportText(hooks.build);
        const name = `torchless-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
        const file = new File([text], name, { type: "text/plain" });
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        try { if (nav.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: "Torchless log" }); return; } } catch { /* fall through */ }
        const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } }, "Share");
      const lines = h("pre", { class: "logLines" });
      body.append(h("div", { class: "row", style: "gap:10px" }, share, copy), lines);
      let shown = -1;
      return () => {
        if (ble.logLines.length === shown) return;
        shown = ble.logLines.length;
        lines.textContent = ble.logLines.slice(-1500).join("\n");
        set(copy, "Copy");
      };
    });
  }

  function openDial() {
    page("RIDE THE DIAL", body => {
      const why = h("p", { class: "cond", style: "color:var(--warn);font-size:17px;margin:0" });
      const segA = h("button", { onclick: () => { rig.dialMode = "live"; render(); } }, "A: Live slot");
      const segB = h("button", { onclick: () => { rig.dialMode = "active"; render(); } }, "B: Active preset");
      const down = h("button", { class: "btn2 nudge", onclick: () => rig.dialNudge(-RigController.dialStep) }, `−${RigController.dialStep}°`);
      const up = h("button", { class: "btn2 nudge", onclick: () => rig.dialNudge(RigController.dialStep) }, `+${RigController.dialStep}°`);
      const nums = h("div", { class: "mono", style: "color:var(--gold);font-size:12px;line-height:1.6" });
      const readout = h("b", { class: "cond", style: "font-size:19px" });
      const numbers = h("p", { class: "mono dim", style: "font-size:11px;margin:0" });
      body.append(
        h("p", { class: "mono dim", style: "font-size:11px;margin:0" }, `Only works while a heat session is already running. Never starts or stops one. Each tap moves the temp target ${RigController.dialStep}°F, up to 50°F from where it started. Put back when the session ends.`),
        h("div", { class: "seg", style: "grid-template-columns:1fr 1fr" }, segA, segB), why,
        h("div", { class: "row", style: "gap:12px" }, down, up), nums, readout, numbers);
      return () => {
        const w = rig.dialDisabledReason;
        segA.classList.toggle("on", rig.dialMode === "live"); segB.classList.toggle("on", rig.dialMode === "active");
        set(why, w ?? ""); why.hidden = !w;
        (down as HTMLButtonElement).disabled = !!w; (up as HTMLButtonElement).disabled = !!w;
        set(nums, `Starting target: ${rig.dialStart !== null ? rig.dialStart + "°F" : "---"}\nTest target: ${rig.dialCurrent !== null ? rig.dialCurrent + "°F" : "---"}\nLive temp: ${rig.liveTempF !== null && rig.liveTempF !== undefined ? rig.liveTempF + "°F" : "---"}`);
        nums.style.whiteSpace = "pre-line";
        set(readout, rig.dialReadout);
        set(numbers, rig.dialNumbers); numbers.hidden = !rig.dialNumbers;
      };
    });
  }

  function openRaw() {
    page("RAW STATUS", body => {
      const conn = h("div", { class: "panel pad stackS" });
      const live = h("div", { class: "panel pad" });
      const extra = h("div", { class: "panel pad" });
      const info = h("div", { class: "panel pad" });
      body.append(tag("CONNECTION", "font-size:9.5px"), conn, tag("LIVE STATUS", "font-size:9.5px"), live, extra, info,
        h("p", { class: "mono dim", style: "font-size:10px" }, "Web Bluetooth only sees the services the app asks for, so the full service list from the iPhone app isn't shown here."));
      const kv = (k: string, v: string) => h("div", { class: "kv" }, h("span", {}, k), h("b", {}, v));
      return () => {
        const disc = h("button", { class: "btn2 danger", onclick: () => rig.askDisconnect() }, rig.disconnectWaiting ? "Disconnect now" : "Disconnect");
        conn.replaceChildren(h("b", { class: "cond", style: "font-size:22px" }, ble.connectionText),
          ble.peripheralName ? h("div", { class: "mono", style: "font-size:11px" }, `${ble.peripheralName}\n${ble.peripheralID}`) : "",
          linked() ? disc : "",
          rig.disconnectWaiting ? h("p", { class: "mono sub", style: "font-size:11px;margin:0" }, "Dab's still going. It finishes first, then the app lets go of the rig.") : "");
        const s = ble.status;
        if (ble.statusTime !== lastStatusTime) { lastStatusTime = ble.statusTime; seenAt = new Date(); }
        if (!s) live.replaceChildren(h("p", { class: "dim", style: "margin:0" }, "No status frame yet."));
        else {
          const temp = s.unitByte === 15 ? `${s.tempRaw} F` : s.unitByte === 12 ? `${s.tempRaw} C` : `${s.tempRaw} (unit byte ${s.unitByte})`;
          live.replaceChildren(h("b", { class: "cond", style: "font-size:44px" }, temp),
            kv("Session", sessionOnOf(s) ? "ON" : `off (byte ${s.sessionByte})`), kv("Active preset", String(s.preset)),
            kv("Light mode", String(s.lightMode)), kv("Time remaining", String(s.sessionTimeRemaining)),
            kv("Battery", `${s.battery}%`), kv("Charging", chargingOf(s) ? "yes" : `no (byte ${s.chargingByte})`),
            kv("Haptics", hapticsOf(s) ? "on" : `off (byte ${s.hapticsByte})`), kv("Brightness", String(s.brightness)),
            kv("Unit", unitText(s)), kv("Auto shut-off / remaining", `${s.autoShutOff} / ${s.autoShutOffRemaining}`),
            kv("Session extend", String(s.sessionExtend)),
            ble.statusTime !== null ? h("p", { class: "mono dim", style: "font-size:11px" }, "Updated " + seenAt.toLocaleTimeString()) : "");
        }
        const ex = Object.keys(ble.extra).sort();
        extra.hidden = !ex.length;
        extra.replaceChildren(tag("OTHER DECODED FRAMES", "font-size:9.5px"), ...ex.map(k => h("div", { class: "kv" }, h("span", {}, k), h("b", { class: "mono" }, ble.extra[k]))));
        const di = Object.keys(ble.deviceInfo).sort();
        info.hidden = !di.length;
        info.replaceChildren(tag("DEVICE INFO", "font-size:9.5px"), ...di.map(k => kv(k, ble.deviceInfo[k])));
      };
    });
  }

  return { render, openLook };
}
