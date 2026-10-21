/* ==========================================================================
   RehabPlus — front-end behaviour (vanilla JS, no dependencies besides Lucide)
   Modules: images, header, reveal, config fill, dialogs, testimonials,
            launcher, booking, chat, contact.
   Backend wiring happens in config.js — nothing here needs rewriting.
   ========================================================================== */
(() => {
  "use strict";

  const CFG = window.REHABPLUS_CONFIG || {};
  CFG.endpoints = CFG.endpoints || {};
  CFG.clinic = CFG.clinic || { social: {} };
  CFG.services = CFG.services || [];
  CFG.doctors = CFG.doctors || [];
  CFG.faq = CFG.faq || [];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const live = (key) => Boolean(CFG.endpoints[key]);
  const getCfg = (path) =>
    path.split(".").reduce((o, k) => (o == null ? o : o[k]), CFG);
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Tiny DOM builder. Text is always set via textContent (no HTML injection). */
  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function")
        node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : String(v));
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c != null && c !== false)
        node.append(c.nodeType ? c : document.createTextNode(c));
    });
    return node;
  }
  const icon = (name) =>
    h("i", { class: "fa-solid fa-" + name, "aria-hidden": "true" });

  /** Fetch wrapper used by every backend call. */
  async function api(key, { method = "POST", body, query } = {}) {
    let url = CFG.endpoints[key];
    if (!url) throw new Error("Endpoint not configured: " + key);
    if (query)
      url +=
        (url.includes("?") ? "&" : "?") + new URLSearchParams(query).toString();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      let res;
      try {
        res = await fetch(url, {
          method,
          headers: body
            ? { "Content-Type": "application/json", Accept: "application/json" }
            : { Accept: "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
        });
      } catch (e) {
        if (e && e.name !== "AbortError") e.unreachable = true; // network error: no server answering
        throw e;
      }
      let data = null;
      let isJson = false;
      try {
        data = await res.json();
        isJson = true;
      } catch (_) {
        /* non-JSON body */
      }
      // 404/405 or an HTML page instead of JSON means the API isn't deployed here (e.g. a plain static server).
      if ([404, 405, 501].includes(res.status) || (res.ok && !isJson)) {
        const err = new Error("API not available at " + url);
        err.unreachable = true;
        err.status = res.status;
        throw err;
      }
      if (!res.ok) {
        const err = new Error(
          (data && data.error) || "Request failed (" + res.status + ")",
        );
        err.status = res.status;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------------ images */
  function initImages(root = document) {
    $$(".media img", root).forEach((img) => {
      if (img.dataset.watched) return;
      img.dataset.watched = "1";
      const holder = img.closest(".media");
      const mark = () => holder && holder.classList.add("img-missing");
      if (img.complete && img.naturalWidth === 0) mark();
      else img.addEventListener("error", mark, { once: true });
    });
  }

  /* ------------------------------------------------------------------ header */
  function initHeader() {
    const header = $("[data-header]");
    const toggle = $(".nav-toggle");
    if (header && !header.classList.contains("scrolled")) {
      const onScroll = () =>
        header.classList.toggle("scrolled", window.scrollY > 24);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    if (!toggle) return;
    const setOpen = (open) => {
      document.body.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", () =>
      setOpen(!document.body.classList.contains("nav-open")),
    );
    $$("#primary-nav a").forEach((a) =>
      a.addEventListener("click", () => setOpen(false)),
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  /* ------------------------------------------------------------------ reveal */
  function initReveal() {
    const items = $$(".reveal");
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      items.forEach((i) => i.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );
    items.forEach((i) => io.observe(i));
  }

  /* ------------------------------------------------------- config → markup */
  function initConfigFill() {
    $$("[data-cfg]").forEach((node) => {
      const value = getCfg(node.dataset.cfg);
      if (!value) return;
      node.classList.remove("placeholder-text");
      const type = node.dataset.link;
      if (type) {
        const target =
          type === "tel" ? String(value).replace(/[^\d+]/g, "") : value;
        node.replaceChildren(
          h("a", { href: type + ":" + target }, [
            node.dataset.icon ? icon(node.dataset.icon) : null,
            node.dataset.icon ? " " + value : value,
          ]),
        );
      } else {
        node.textContent = value;
      }
    });
    $$("[data-cfg-href]").forEach((a) => {
      const v = getCfg(a.dataset.cfgHref);
      if (v) {
        a.setAttribute("href", v);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener");
      }
    });
    $$("[data-sample-note]").forEach((n) => {
      n.hidden = CFG.showSampleNotes === false;
    });
    $$("[data-year]").forEach((n) => {
      n.textContent = new Date().getFullYear();
    });

    const nets = [
      ["facebook", "Facebook", "fa-facebook-f"],
      ["instagram", "Instagram", "fa-instagram"],
      ["linkedin", "LinkedIn", "fa-linkedin-in"],
      ["youtube", "YouTube", "fa-youtube"],
    ];
    $$("[data-socials]").forEach((box) => {
      nets.forEach(([key, label, cls]) => {
        const url = (CFG.clinic.social || {})[key];
        const glyph = h("i", {
          class: "fa-brands " + cls,
          "aria-hidden": "true",
        });
        box.append(
          url
            ? h(
                "a",
                {
                  href: url,
                  target: "_blank",
                  rel: "noopener",
                  "aria-label": label,
                },
                glyph,
              )
            : h(
                "span",
                {
                  class: "is-placeholder",
                  "aria-hidden": "true",
                  title: label + " link not set (config.js)",
                },
                glyph,
              ),
        );
      });
    });
  }

  /* ------------------------------------------------------------------ dialogs */
  function initDialogs() {
    const mountVideo = (d) => {
      const frame = $("[data-video-frame]", d);
      const v = CFG.storyVideo;
      if (!frame || !v || !v.id) return;
      const title = $("[data-video-title]", d);
      if (title && v.title) title.textContent = v.title;
      const link = $("[data-video-link]", d);
      if (link)
        link.href =
          "https://www.youtube.com/watch?v=" + encodeURIComponent(v.id);
      frame.replaceChildren(
        h("iframe", {
          src:
            "https://www.youtube-nocookie.com/embed/" +
            encodeURIComponent(v.id) +
            "?autoplay=1&rel=0&modestbranding=1&playsinline=1",
          title: v.title || "Our story video",
          allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
          referrerpolicy: "strict-origin-when-cross-origin",
        }),
      );
    };
    $$("[data-open-dialog]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const d = document.getElementById(btn.dataset.openDialog);
        if (!d) return;
        if (d.showModal) d.showModal();
        else d.setAttribute("open", "");
        mountVideo(d);
      }),
    );
    $$("dialog").forEach((d) => {
      d.addEventListener("click", (e) => {
        if (e.target === d) d.close();
      });
      d.addEventListener("close", () => {
        const f = $("[data-video-frame]", d);
        if (f) f.replaceChildren();
      });
      $$("[data-close-dialog]", d).forEach((b) =>
        b.addEventListener("click", () => d.close()),
      );
    });
    const sd = $("#service-dialog");
    if (!sd) return;
    $$("[data-service]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const s = CFG.services.find((x) => x.id === btn.dataset.service);
        if (!s) return;
        $("[data-dialog-title]", sd).textContent = s.name;
        $("[data-dialog-text]", sd).textContent = s.long;
        $("[data-dialog-book]", sd).setAttribute(
          "href",
          "booking.html?service=" + encodeURIComponent(s.id),
        );
        const holder = $(".service-icon", sd);
        holder.replaceChildren(icon(s.icon));

        sd.showModal();
      }),
    );
  }

  /* ----------------------------------------------------------- testimonials */
  function initTestimonials() {
    const track = $("[data-t-track]");
    if (!track) return;
    const step = (dir) => {
      const card = $(".t-card", track);
      track.scrollBy({
        left: dir * ((card ? card.offsetWidth : 300) + 16),
        behavior: "smooth",
      });
    };
    const prev = $("[data-t-prev]");
    const next = $("[data-t-next]");
    if (prev) prev.addEventListener("click", () => step(-1));
    if (next) next.addEventListener("click", () => step(1));
  }

  /* ------------------------------------------------------------- launcher */
  function initLauncher() {
    const box = $("[data-launcher]");
    if (!box) return;
    const btn = $(".launcher-btn", box);
    const panel = $(".launcher-panel", box);
    const set = (open) => {
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    };
    btn.addEventListener("click", () => set(panel.hidden));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") set(false);
    });
    document.addEventListener("click", (e) => {
      if (!box.contains(e.target)) set(false);
    });
  }

  /* ------------------------------------------------------ validation helpers */
  function fieldError(input) {
    const isCheck = input.type === "checkbox";
    const v = isCheck ? input.checked : input.value.trim();
    if (input.required && !v)
      return isCheck ? "Please accept to continue." : "This field is required.";
    if (input.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
      return "Enter a valid email address.";
    if (input.hasAttribute("data-phone") && v) {
      const d = v.replace(/\D/g, "");
      if (d.length < 6 || d.length > 14) return "Enter a valid phone number.";
    }
    if (input.dataset.min && v && v.length < Number(input.dataset.min))
      return "Please enter at least " + input.dataset.min + " characters.";
    return "";
  }
  function showFieldError(input, msg) {
    const out = document.getElementById(input.id + "-error");
    if (!out) return;
    out.textContent = msg;
    out.hidden = !msg;
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (msg) input.setAttribute("aria-describedby", out.id);
    else input.removeAttribute("aria-describedby");
  }
  function validateForm(form) {
    let first = null;
    $$("input, select, textarea", form).forEach((i) => {
      if (!i.id || !document.getElementById(i.id + "-error")) return;
      const m = fieldError(i);
      showFieldError(i, m);
      if (m && !first) first = i;
    });
    if (first) first.focus();
    return !first;
  }
  function liveValidate(form) {
    $$("input, select, textarea", form).forEach((i) => {
      if (!i.id || !document.getElementById(i.id + "-error")) return;
      i.addEventListener("blur", () => showFieldError(i, fieldError(i)));
      i.addEventListener("input", () => {
        if (i.getAttribute("aria-invalid") === "true")
          showFieldError(i, fieldError(i));
      });
      i.addEventListener("change", () => {
        if (i.getAttribute("aria-invalid") === "true")
          showFieldError(i, fieldError(i));
      });
    });
  }
  function setLoading(btn, loading, label) {
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.disabled = true;
      btn.replaceChildren(
        h("span", { class: "spinner", "aria-hidden": "true" }),
        " " + label,
      );
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  /* ----------------------------------------------------------------- booking */
  const COUNTRIES = [
    ["AU", "Australia", "+61"],
    ["AT", "Austria", "+43"],
    ["BH", "Bahrain", "+973"],
    ["BD", "Bangladesh", "+880"],
    ["BE", "Belgium", "+32"],
    ["BR", "Brazil", "+55"],
    ["CA", "Canada", "+1"],
    ["CN", "China", "+86"],
    ["DK", "Denmark", "+45"],
    ["EG", "Egypt", "+20"],
    ["FI", "Finland", "+358"],
    ["FR", "France", "+33"],
    ["DE", "Germany", "+49"],
    ["GR", "Greece", "+30"],
    ["HK", "Hong Kong", "+852"],
    ["IN", "India", "+91"],
    ["ID", "Indonesia", "+62"],
    ["IE", "Ireland", "+353"],
    ["IT", "Italy", "+39"],
    ["JP", "Japan", "+81"],
    ["JO", "Jordan", "+962"],
    ["KE", "Kenya", "+254"],
    ["KW", "Kuwait", "+965"],
    ["MY", "Malaysia", "+60"],
    ["MX", "Mexico", "+52"],
    ["NL", "Netherlands", "+31"],
    ["NZ", "New Zealand", "+64"],
    ["NG", "Nigeria", "+234"],
    ["NO", "Norway", "+47"],
    ["OM", "Oman", "+968"],
    ["PK", "Pakistan", "+92"],
    ["PH", "Philippines", "+63"],
    ["PL", "Poland", "+48"],
    ["PT", "Portugal", "+351"],
    ["QA", "Qatar", "+974"],
    ["SA", "Saudi Arabia", "+966"],
    ["SG", "Singapore", "+65"],
    ["ZA", "South Africa", "+27"],
    ["KR", "South Korea", "+82"],
    ["ES", "Spain", "+34"],
    ["LK", "Sri Lanka", "+94"],
    ["SE", "Sweden", "+46"],
    ["CH", "Switzerland", "+41"],
    ["TR", "Türkiye", "+90"],
    ["AE", "United Arab Emirates", "+971"],
    ["GB", "United Kingdom", "+44"],
    ["US", "United States", "+1"],
  ];

  function initBooking() {
    const root = $("[data-booking]");
    if (!root) return;

    let liveBook = live("book");
    let liveAvail = live("availability");
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const state = {
      step: 1,
      serviceId: null,
      doctorId: null,
      date: null,
      slot: null,
      month: null,
      slotToken: 0,
    };

    const stepEls = $$("[data-step]", root);
    const stepsNav = $$("[data-steps] li");
    const flowError = $("[data-flow-error]", root);
    const form = $("[data-details-form]", root);
    const docPanel = $("[data-doc-panel]");
    const slotArea = $("[data-slot-area]", root);

    const service = () => CFG.services.find((s) => s.id === state.serviceId);
    const doctor = () => CFG.doctors.find((d) => d.id === state.doctorId);
    const initials = (name) =>
      name
        .replace(/^Dr\.?\s*/i, "")
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join("");
    const fmtTime = (iso, tz) =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      }).format(new Date(iso));
    const fmtDate = (iso, tz) =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: tz,
      }).format(new Date(iso));
    const pad = (n) => String(n).padStart(2, "0");
    const dateKey = (y, m, d) => y + "-" + pad(m + 1) + "-" + pad(d);

    // Banner: always say plainly what is and isn't connected.
    const banner = $("[data-mode-banner] span", root);
    const setBanner = () => {
      banner.textContent =
        liveBook && liveAvail
          ? "Your request is sent to the clinic. You will only see a confirmation once the clinic\u2019s system responds."
          : "Demo mode: the booking server isn\u2019t reachable from here, so these are sample times and nothing you enter is sent or saved.";
    };
    setBanner();
    // The API isn't answering (e.g. the files are opened from a plain static server): switch to demo mode instead of failing.
    const enterDemo = () => {
      liveBook = false;
      liveAvail = false;
      setBanner();
    };
    $("[data-tz-label]", root).textContent = deviceTz.replace(/_/g, " ");

    const showFlowError = (msg) => {
      flowError.hidden = !msg;
      $("span", flowError).textContent = msg || "";
    };
    const stepError = (name, msg) => {
      const e = $('[data-error="' + name + '"]', root);
      if (e) {
        e.textContent = msg || "";
        e.hidden = !msg;
      }
    };

    function showStep(n, focus = true) {
      state.step = n;
      stepEls.forEach((s) => {
        s.hidden = Number(s.dataset.step) !== n;
      });
      stepsNav.forEach((li, i) => {
        const idx = i + 1;
        li.classList.toggle("done", idx < n);
        if (idx === Math.min(n, 4) && n <= 4)
          li.setAttribute("aria-current", "step");
        else li.removeAttribute("aria-current");
      });
      showFlowError("");
      if (n === 2) renderDoctors();
      if (n === 3) {
        renderCal();
      }
      if (n === 4) prepareDetails();
      if (focus) {
        const target =
          n === 5 ? $("[data-confirm]", root) : $("h2", stepEls[n - 1]);
        if (target) {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    /* Step 1 — services */
    const serviceList = $("[data-service-list]", root);
    CFG.services.forEach((s) => {
      serviceList.append(
        h("label", { class: "option" }, [
          h("input", {
            type: "radio",
            name: "service",
            value: s.id,
            onchange: () => {
              state.serviceId = s.id;
              stepError("service", "");
              const d = doctor();
              if (d && !d.services.includes(s.id)) {
                state.doctorId = null;
                state.date = null;
                state.slot = null;
                renderDocPanel();
              }
            },
          }),
          h("span", { class: "box" }, [
            h("span", { class: "ic" }, icon(s.icon)),
            h("span", { class: "box-wrap" }, [
              h("strong", { text: s.name }),
              h("small", { text: s.short }),
            ]),
          ]),
        ]),
      );
    });

    /* Step 2 — doctors */
    function photo(d) {
      return h("span", { class: "doc-photo media" }, [
        h("img", {
          src: d.photo,
          alt: "",
          loading: "lazy",
          width: "64",
          height: "64",
        }),
        h("span", {
          class: "initial",
          "aria-hidden": "true",
          text: initials(d.name),
        }),
      ]);
    }
    function renderDoctors() {
      const list = $("[data-doctor-list]", root);
      list.replaceChildren();
      const docs = CFG.doctors.filter((d) =>
        d.services.includes(state.serviceId),
      );
      if (!docs.length) {
        list.append(
          h("p", { class: "empty-state" }, [
            "No practitioners are listed for this service yet. Please ",
            h("a", { href: "contact.html", text: "contact us" }),
            ".",
          ]),
        );
        return;
      }
      docs.forEach((d) => {
        list.append(
          h("label", { class: "option" }, [
            h("input", {
              type: "radio",
              name: "doctor",
              value: d.id,
              checked: state.doctorId === d.id,
              onchange: () => {
                state.doctorId = d.id;
                state.date = null;
                state.slot = null;
                stepError("doctor", "");
                renderDocPanel();
              },
            }),
            h("span", { class: "box" }, [
              photo(d),
              h("span", { class: "box-wrap" }, [
                h("strong", { text: d.name }),
                h("small", { text: d.specialty + " · " + d.years + "+ yrs" }),
              ]),
            ]),
          ]),
        );
      });
      initImages(list);
    }
    function renderDocPanel() {
      const d = doctor();
      docPanel.replaceChildren();
      if (!d) {
        docPanel.append(
          h("p", {
            class: "empty-state",
            text: "Choose a doctor to see their profile here.",
          }),
        );
        return;
      }
      const li = (ic, text) => h("li", {}, [icon(ic), h("span", { text })]);
      docPanel.append(
        h("div", { class: "top" }, [
          photo(d),
          h("div", {}, [
            h("h3", { text: d.name }),
            h("p", { class: "spec", text: d.specialty }),
          ]),
        ]),
        h("ul", {}, [
          li("briefcase-medical", d.years + "+ years experience"),
          ...d.focus.map((f) => li("check", f)),
          li(
            "video",
            d.modes.includes("online")
              ? "In-person and online consultations"
              : "In-person consultations only",
          ),
        ]),
        h("p", {
          class: "demo-note",
          text: "Sample profile — replace with real practitioner details.",
        }),
      );
      initImages(docPanel);
    }

    /* Step 3 — calendar & slots */
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 90);
    state.month = { y: today.getFullYear(), m: today.getMonth() };
    function renderCal() {
      const { y, m } = state.month;
      $("[data-cal-title]", root).textContent = new Intl.DateTimeFormat(
        undefined,
        { month: "long", year: "numeric" },
      ).format(new Date(y, m, 1));
      const grid = $("[data-cal-grid]", root);
      grid.replaceChildren();
      for (let i = 0; i < 7; i++)
        grid.append(
          h("div", {
            class: "dow",
            "aria-hidden": "true",
            text: new Intl.DateTimeFormat(undefined, {
              weekday: "short",
            }).format(new Date(2024, 0, 7 + i)),
          }),
        );
      for (let i = 0; i < new Date(y, m, 1).getDay(); i++)
        grid.append(h("span"));
      const days = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const dt = new Date(y, m, d);
        const key = dateKey(y, m, d);
        const off = dt < today || dt > maxDate;
        grid.append(
          h("button", {
            type: "button",
            class:
              "cal-day" + (dt.getTime() === today.getTime() ? " today" : ""),
            text: d,
            disabled: off,
            "aria-pressed": String(state.date === key),
            "aria-label": new Intl.DateTimeFormat(undefined, {
              dateStyle: "full",
            }).format(dt),
            onclick: () => {
              state.date = key;
              state.slot = null;
              stepError("slot", "");
              renderCal();
              loadSlots(key);
            },
          }),
        );
      }
      $("[data-cal-prev]", root).disabled =
        y === today.getFullYear() && m <= today.getMonth();
      $("[data-cal-next]", root).disabled = new Date(y, m + 1, 1) > maxDate;
    }
    $("[data-cal-prev]", root).addEventListener("click", () => {
      const s = state.month;
      state.month = s.m === 0 ? { y: s.y - 1, m: 11 } : { y: s.y, m: s.m - 1 };
      renderCal();
    });
    $("[data-cal-next]", root).addEventListener("click", () => {
      const s = state.month;
      state.month = s.m === 11 ? { y: s.y + 1, m: 0 } : { y: s.y, m: s.m + 1 };
      renderCal();
    });

    const hash = (str) => {
      let x = 0;
      for (let i = 0; i < str.length; i++)
        x = (x * 31 + str.charCodeAt(i)) >>> 0;
      return x;
    };
    function demoSlots(key) {
      const [y, mo, d] = key.split("-").map(Number);
      return [9, 10, 11, 12, 14, 15, 16, 17].map((hr) => {
        const start = new Date(y, mo - 1, d, hr, 0);
        const end = new Date(y, mo - 1, d, hr + 1, 0);
        return {
          start: start.toISOString(),
          end: end.toISOString(),
          available:
            start > new Date() && hash(key + state.doctorId + hr) % 4 !== 0,
        };
      });
    }
    async function loadSlots(key) {
      const token = ++state.slotToken;
      $("[data-slot-title]", root).textContent =
        "Available times · " +
        new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
          new Date(key + "T12:00:00"),
        );
      slotArea.replaceChildren(
        h("p", { class: "empty-state" }, [
          h("span", { class: "spinner", "aria-hidden": "true" }),
          " Loading times…",
        ]),
      );
      try {
        let slots;
        if (liveAvail) {
          const data = await api("availability", {
            method: "GET",
            query: {
              doctorId: state.doctorId,
              serviceId: state.serviceId,
              date: key,
              tz: deviceTz,
            },
          });
          if (!data || !Array.isArray(data.slots))
            throw new Error("Unexpected availability response");
          slots = data.slots;
        } else {
          await delay(150);
          slots = demoSlots(key);
        }
        if (token !== state.slotToken) return;
        renderSlots(slots);
      } catch (err) {
        if (token !== state.slotToken) return;
        if (err && err.unreachable) {
          enterDemo();
          renderSlots(demoSlots(key));
          return;
        }
        slotArea.replaceChildren(
          h("div", { class: "alert alert-error" }, [
            icon("circle-exclamation"),
            h("span", {}, [
              "We couldn\u2019t load times. ",
              h("button", {
                type: "button",
                class: "link-btn",
                text: "Try again",
                onclick: () => loadSlots(key),
              }),
            ]),
          ]),
        );
      }
    }
    function renderSlots(slots) {
      if (!slots.length) {
        slotArea.replaceChildren(
          h("p", {
            class: "empty-state",
            text: "No times on this date. Please try another day.",
          }),
        );
        return;
      }
      const wrap = h("div", { class: "slots" });
      slots.forEach((s) => {
        wrap.append(
          h("button", {
            type: "button",
            class: "slot",
            text: fmtTime(s.start, deviceTz),
            disabled: !s.available,
            "aria-pressed": String(state.slot && state.slot.start === s.start),
            title: s.available ? "" : "Unavailable",
            onclick: (ev) => {
              state.slot = s;
              stepError("slot", "");
              $$(".slot", wrap).forEach((b) =>
                b.setAttribute("aria-pressed", "false"),
              );
              ev.currentTarget.setAttribute("aria-pressed", "true");
            },
          }),
        );
      });
      slotArea.replaceChildren(wrap);
      if (!slots.some((s) => s.available))
        slotArea.append(
          h("p", {
            class: "demo-note",
            text: "All times on this date are taken. Please pick another day.",
          }),
        );
    }

    /* Step 4 — details */
    function prepareDetails() {
      const cc = $("#b-cc");
      const country = $("#b-country");
      const tz = $("#b-tz");
      if (!cc.options.length) {
        const seen = new Set();
        COUNTRIES.forEach(([iso, , code]) => {
          const label = iso + " " + code;
          if (!seen.has(label)) {
            seen.add(label);
            cc.append(h("option", { value: code, text: label }));
          }
        });
        country.append(h("option", { value: "", text: "Select country" }));
        COUNTRIES.forEach(([iso, name]) =>
          country.append(
            h("option", { value: name, "data-iso": iso, text: name }),
          ),
        );
        country.addEventListener("change", () => {
          const c = COUNTRIES.find(([, n]) => n === country.value);
          if (c) {
            const opt =
              Array.from(cc.options).find(
                (o) => o.value === c[2] && o.text.startsWith(c[0]),
              ) || Array.from(cc.options).find((o) => o.value === c[2]);
            if (opt) cc.value = opt.value;
          }
        });
        let zones = [];
        try {
          zones = Intl.supportedValuesOf
            ? Intl.supportedValuesOf("timeZone")
            : [];
        } catch (_) {
          zones = [];
        }
        if (!zones.includes(deviceTz)) zones.unshift(deviceTz);
        zones.forEach((z) =>
          tz.append(h("option", { value: z, text: z.replace(/_/g, " ") })),
        );
        tz.value = deviceTz;
        liveValidate(form);
      }
      const d = doctor();
      const online = d && d.modes.includes("online");
      const onlineRadio = $("[data-online-option]", form);
      onlineRadio.disabled = !online;
      $("[data-online-hint]", form).hidden = Boolean(online);
      if (!online)
        $('input[name="consultation"][value="in-person"]', form).checked = true;
    }

    function summaryList(extra = {}) {
      const tz = extra.tz || deviceTz;
      const d = doctor();
      const s = service();
      const rows = [
        ["Service", s && s.name],
        ["Doctor", d && d.name],
        ["Date", state.slot && fmtDate(state.slot.start, tz)],
        [
          "Time",
          state.slot &&
            fmtTime(state.slot.start, tz) + " (" + tz.replace(/_/g, " ") + ")",
        ],
        ["Consultation", extra.consultation],
        ["Name", extra.name],
        ["Email", extra.email],
      ];
      return h(
        "dl",
        { class: "summary" },
        rows
          .filter(([, v]) => v)
          .map(([k, v]) =>
            h("div", {}, [h("dt", { text: k }), h("dd", { text: v })]),
          ),
      );
    }
    function showConfirmation(kind, details, reference) {
      const box = $("[data-confirm]", root);
      box.replaceChildren();
      const copy = {
        confirmed: [
          "check",
          "Appointment confirmed",
          "The clinic has confirmed your appointment. A confirmation email will be sent to " +
            details.email +
            ".",
        ],
        pending: [
          "clock",
          "Request received",
          "The clinic has received your request. Your appointment is not confirmed until you receive confirmation from the clinic.",
        ],
        demo: [
          "circle-info",
          "Demo complete — nothing was sent",
          "This is a demonstration. Your request was not sent or saved, and no appointment has been made. Connect a booking backend in config.js to go live.",
        ],
      }[kind];
      box.append(
        h("span", { class: "big-icon" }, icon(copy[0])),
        h("h2", { id: "s5-title", text: copy[1] }),
        h("p", { class: "sub", text: copy[2] }),
        reference
          ? h("p", {}, ["Reference: ", h("strong", { text: reference })])
          : null,
        summaryList(details),
        h("div", { class: "dialog-actions confirm-actions" }, [
          h("a", {
            class: "btn btn-dark",
            href: "index.html",
            text: "Back to home",
          }),
          h("button", {
            class: "btn btn-ghost-dark",
            type: "button",
            text: "Start over",
            onclick: () => window.location.assign("booking.html"),
          }),
        ]),
      );
      showStep(5);
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validateForm(form)) return;
      if (!service() || !doctor() || !state.slot) {
        showFlowError(
          "Some earlier details are missing. Please go back and complete each step.",
        );
        return;
      }
      const fd = new FormData(form);
      const submit = $("[data-submit]", form);
      const details = {
        name: fd.get("name").trim(),
        email: fd.get("email").trim(),
        tz: fd.get("timezone") || deviceTz,
        consultation:
          fd.get("consultation") === "online" ? "Online" : "In person",
      };
      if (!liveBook) {
        showConfirmation("demo", details);
        return;
      }
      const payload = {
        serviceId: state.serviceId,
        doctorId: state.doctorId,
        start: state.slot.start,
        timezone: details.tz,
        consultation: fd.get("consultation"),
        patient: {
          name: details.name,
          email: details.email,
          phone: fd.get("countryCode") + " " + fd.get("phone").trim(),
          country: fd.get("country"),
          concern: fd.get("concern").trim(),
        },
        consent: true,
        website: String(fd.get("website") || ""),
      };
      setLoading(submit, true, "Sending…");
      showFlowError("");
      try {
        const data = await api("book", { body: payload });
        if (!data || (data.status !== "confirmed" && data.status !== "pending"))
          throw new Error("Unexpected response");
        showConfirmation(data.status, details, data.reference);
      } catch (err) {
        if (err && err.unreachable) {
          enterDemo();
          showConfirmation("demo", details);
          return;
        }
        if (err.status === 409) {
          state.slot = null;
          showStep(3, false);
          showFlowError("That time was just taken. Please choose another.");
          loadSlots(state.date);
        } else
          showFlowError(
            "We couldn\u2019t submit your request, so no appointment has been made. Please try again or contact us.",
          );
      } finally {
        setLoading(submit, false);
      }
    });

    /* Step navigation */
    $$("[data-back]", root).forEach((b) =>
      b.addEventListener("click", () => showStep(state.step - 1)),
    );
    $$("[data-next]", root).forEach((b) =>
      b.addEventListener("click", () => {
        if (state.step === 1) {
          if (!state.serviceId)
            return stepError("service", "Please select a service to continue.");
          showStep(2);
        } else if (state.step === 2) {
          if (!state.doctorId)
            return stepError("doctor", "Please choose a doctor to continue.");
          showStep(3);
        } else if (state.step === 3) {
          if (!state.date) return stepError("slot", "Please choose a date.");
          if (!state.slot)
            return stepError("slot", "Please choose an available time.");
          showStep(4);
        }
      }),
    );

    // Deep link from the homepage: booking.html?service=<id>
    const pre = new URLSearchParams(window.location.search).get("service");
    if (pre && CFG.services.some((s) => s.id === pre)) {
      state.serviceId = pre;
      const radio = $('input[name="service"][value="' + pre + '"]', root);
      if (radio) radio.checked = true;
      showStep(2, false);
    } else showStep(1, false);
    renderDocPanel();
  }

  /* -------------------------------------------------------------------- chat */
  function initChat() {
    const root = $("[data-chat]");
    if (!root) return;
    const log = $("[data-chat-log]", root);
    const form = $("[data-chat-form]", root);
    const input = $("#chat-input", root);
    const sendBtn = $("[data-send]", root);
    const statusEl = $("[data-chat-status]", root);
    const banner = $("[data-chat-banner]", root);
    const history = [];
    let isLive = live("chat");
    const EMERGENCY =
      /\b(chest pain|can'?t breathe|cannot breathe|trouble breathing|difficulty breathing|heart attack|stroke|unconscious|severe bleeding|overdose|suicid\w*)\b/i;

    const setStatus = (text, cls) => {
      statusEl.textContent = text;
      statusEl.className = "status" + (cls ? " " + cls : "");
    };
    const showMode = () => {
      if (isLive) {
        setStatus("AI assistant");
        banner.textContent =
          "Replies are generated by an AI assistant and may contain mistakes. It cannot give medical advice.";
      } else {
        setStatus("Offline — demo mode", "is-off");
        banner.textContent =
          "Demo mode: the AI assistant isn\u2019t connected here. Replies come from a short list of preset answers, not from a person or an AI model.";
      }
    };
    showMode();

    const scroll = () => {
      log.scrollTop = log.scrollHeight;
    };
    const link = (text, href) => ({ text, href });
    function addMsg(role, text, actions) {
      log.append(h("div", { class: "msg " + role, text }));
      if (actions && actions.length) {
        log.append(
          h(
            "div",
            { class: "msg-actions" },
            actions.map((a) =>
              a.href
                ? h("a", { class: "chip solid", href: a.href, text: a.text })
                : h("button", {
                    class: "chip",
                    type: "button",
                    text: a.text,
                    onclick: a.onClick,
                  }),
            ),
          ),
        );
      }
      scroll();
    }
    const typingNode = () => {
      const n = h(
        "div",
        {
          class: "msg bot typing",
          role: "status",
          "aria-label": "Assistant is typing",
        },
        [h("i"), h("i"), h("i")],
      );
      log.append(n);
      scroll();
      return n;
    };

    function localReply(text) {
      const t = text.toLowerCase();
      const book = [link("Book an appointment", "booking.html")];
      const contact = [link("Contact the team", "contact.html")];
      if (/book|appointment|schedul|reserve/.test(t))
        return {
          text: "You can book in four steps: choose a service, choose a doctor, pick a date and time, then enter your details.",
          actions: book,
        };
      if (/service|therap|treat|offer|physio|rehab|pain|injur|surgery/.test(t))
        return {
          text:
            "We offer: " +
            CFG.services.map((s) => s.name).join(", ") +
            ". I can\u2019t give medical advice, but a practitioner can assess your situation in a consultation.",
          actions: [link("See services", "index.html#services"), ...book],
        };
      if (/online|video|remote|virtual/.test(t))
        return {
          text: CFG.faq[2]
            ? CFG.faq[2].a
            : "Some practitioners offer online sessions.",
          actions: book,
        };
      if (/price|cost|fee|insur|pay/.test(t))
        return {
          text: "Pricing and insurance details aren\u2019t available in this chat. Please contact the team.",
          actions: contact,
        };
      if (/hour|open|where|address|location|phone|call|email/.test(t)) {
        const c = CFG.clinic;
        const parts = [c.address, c.phone, c.email, c.hours].filter(Boolean);
        return {
          text: parts.length
            ? parts.join("\n")
            : "Contact details haven\u2019t been added to this site yet. Please use the contact page.",
          actions: contact,
        };
      }
      return {
        text: "I\u2019m in demo mode, so I can only answer basic questions about booking, services and online sessions. For anything else, please contact the team.",
        actions: [...book, ...contact],
      };
    }

    async function send(text) {
      addMsg("user", text);
      history.push({ role: "user", content: text });
      if (EMERGENCY.test(text))
        log.append(
          h("div", {
            class: "msg notice",
            role: "alert",
            text: "If this is an emergency, contact your local emergency services immediately. This chat cannot provide urgent help.",
          }),
        );
      input.disabled = true;
      sendBtn.disabled = true;
      const typing = typingNode();
      try {
        if (isLive) {
          const data = await api("chat", {
            body: { messages: history.slice(-12) },
          });
          const reply =
            data && typeof data.reply === "string" ? data.reply.trim() : "";
          if (!reply) throw new Error("Empty reply");
          typing.remove();
          setStatus("AI assistant · online", "is-on");
          addMsg("bot", reply);
          history.push({ role: "assistant", content: reply });
        } else {
          await delay(250);
          typing.remove();
          const r = localReply(text);
          addMsg("bot", r.text, r.actions);
        }
      } catch (err) {
        if (err && err.unreachable) {
          isLive = false;
          showMode();
          await delay(150);
          typing.remove();
          const r = localReply(text);
          addMsg("bot", r.text, r.actions);
          return;
        }
        typing.remove();
        setStatus("Temporarily unavailable", "is-off");
        addMsg(
          "bot",
          "Sorry, I can\u2019t reach the assistant right now. You can book online, send the team a message, or try again in a moment.",
          [
            link("Book an appointment", "booking.html"),
            link("Contact the team", "contact.html"),
          ],
        );
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      send(text);
    });
    $$("[data-quick]", root).forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.quick === "ask") {
          addMsg("bot", "Of course — what would you like to know?");
          input.focus();
        } else send("Tell me about your therapy services");
      }),
    );
    $("[data-human]", root).addEventListener("click", () => {
      if (CFG.humanChatUrl) {
        window.open(CFG.humanChatUrl, "_blank", "noopener");
        return;
      }
      addMsg(
        "bot",
        "No human agent is connected to this chat yet, so we can\u2019t show anyone as online. Please send the team a message and they will reply by email.",
        [link("Send a message", "contact.html#contact-form")],
      );
    });

    const faq = $("[data-faq]");
    if (faq)
      CFG.faq.forEach((f) =>
        faq.append(
          h("details", {}, [
            h("summary", { text: f.q }),
            h("p", { text: f.a }),
          ]),
        ),
      );

    addMsg(
      "bot",
      "Hello! I\u2019m the RehabPlus assistant (an AI). I can help with questions about our services and booking. How can I help?",
    );
  }

  /* ----------------------------------------------------------------- contact */
  function initContact() {
    const form = $("[data-contact-form]");
    const map = $("[data-map]");
    if (map) {
      const frame = $("[data-map-frame]", map);
      if (frame && CFG.clinic.mapEmbedUrl) frame.src = CFG.clinic.mapEmbedUrl;
      const dir = $("[data-directions]", map);
      if (dir && CFG.clinic.directionsUrl) dir.href = CFG.clinic.directionsUrl;
    }
    if (!form) return;
    const feedback = $("[data-form-feedback]");
    const banner = $("[data-mode-banner]");
    let isLive = live("contact");
    const demoText =
      "Demo mode: the server isn\u2019t reachable from here, so messages are not delivered.";
    if (isLive) banner.hidden = true;
    else $("span", banner).textContent = demoText;
    liveValidate(form);

    const note = (kind, msg) => {
      feedback.replaceChildren(
        h(
          "div",
          {
            class: "alert alert-" + kind,
            role: kind === "error" ? "alert" : "status",
          },
          [
            icon(
              kind === "success"
                ? "circle-check"
                : kind === "error"
                  ? "circle-exclamation"
                  : "circle-info",
            ),
            h("span", { text: msg }),
          ],
        ),
      );
      feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      feedback.replaceChildren();
      if (!validateForm(form)) return;
      if (!isLive) {
        note(
          "info",
          "Demo mode: your message was not sent. Connect a form endpoint in config.js to receive submissions.",
        );
        return;
      }
      const fd = new FormData(form);
      const btn = $("[data-submit]", form);
      setLoading(btn, true, "Sending…");
      try {
        const data = await api("contact", {
          body: {
            name: fd.get("name").trim(),
            email: fd.get("email").trim(),
            subject: fd.get("subject").trim(),
            message: fd.get("message").trim(),
            consent: true,
            website: String(fd.get("website") || ""),
          },
        });
        if (!data || data.ok !== true) throw new Error("Unexpected response");
        form.reset();
        note(
          "success",
          "Thank you — your message has been sent. We\u2019ll reply by email.",
        );
      } catch (err) {
        if (err && err.unreachable) {
          isLive = false;
          banner.hidden = false;
          $("span", banner).textContent = demoText;
          note(
            "info",
            "Demo mode: your message was not sent because the server isn\u2019t reachable from here.",
          );
          return;
        }
        note(
          "error",
          "We couldn\u2019t send your message. Please try again, or contact us another way.",
        );
      } finally {
        setLoading(btn, false);
      }
    });
  }

  /* ------------------------------------------------------- service cards */
  function initServiceCards() {
    $$(".service-card").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", e.clientX - r.left + "px");
        card.style.setProperty("--my", e.clientY - r.top + "px");
      });
    });
  }

  /* -------------------------------------------------------------------- init */
  function init() {
    initHeader();
    initConfigFill();
    initDialogs();
    initServiceCards();
    initTestimonials();
    initLauncher();
    initBooking();
    initChat();
    initContact();
    initImages();
    initReveal();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
