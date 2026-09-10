(function () {
  "use strict";

  var STORAGE_KEY = "smartquote.lang";
  var DEFAULT_LANG = "en";
  var currentLang = DEFAULT_LANG;

  /* ---------------- i18n ---------------- */

  function t(key, vars) {
    var dict = SQ_MESSAGES[currentLang] || SQ_MESSAGES[DEFAULT_LANG];
    var text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split("{" + name + "}").join(vars[name]);
      });
    }
    return text;
  }

  function applyLanguage(lang) {
    if (!SQ_MESSAGES[lang]) { lang = DEFAULT_LANG; }
    currentLang = lang;
    document.documentElement.lang = SQ_LOCALE_TAGS[lang];

    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (node) {
      node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (node) {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label")));
    });
    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      var on = btn.getAttribute("data-lang") === lang;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });

    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* storage unavailable */ }

    renderSimulator();
    renderChain();
    filterFaq();
    clearFormMessages();
  }

  function initialLanguage() {
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    if (stored && SQ_MESSAGES[stored]) { return stored; }
    var param = new URLSearchParams(window.location.search).get("lang");
    if (param && SQ_MESSAGES[param]) { return param; }
    return DEFAULT_LANG;
  }

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () { applyLanguage(btn.getAttribute("data-lang")); });
  });

  /* ---------------- Mobile navigation ---------------- */

  var navToggle = document.getElementById("navToggle");
  var primaryNav = document.getElementById("primaryNav");

  if (navToggle && primaryNav) {
    navToggle.addEventListener("click", function () {
      var open = primaryNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    primaryNav.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        primaryNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && primaryNav.classList.contains("is-open")) {
        primaryNav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.focus();
      }
    });
  }

  /* ---------------- Hero: two states of the same documents ---------------- */

  var stage = document.getElementById("stage");
  var papers = document.getElementById("papers");
  var verdict = document.getElementById("verdict");
  var btnRaw = document.getElementById("stateRaw");
  var btnSolved = document.getElementById("stateSolved");

  function setStage(state) {
    if (!stage) { return; }
    stage.setAttribute("data-state", state);
    var solved = state === "solved";
    btnRaw.classList.toggle("is-active", !solved);
    btnSolved.classList.toggle("is-active", solved);
    btnRaw.setAttribute("aria-pressed", String(!solved));
    btnSolved.setAttribute("aria-pressed", String(solved));
    if (papers) { papers.setAttribute("aria-hidden", String(solved)); }
    if (verdict) { verdict.setAttribute("aria-hidden", String(!solved)); }
  }

  if (btnRaw && btnSolved) {
    btnRaw.addEventListener("click", function () { setStage("raw"); });
    btnSolved.addEventListener("click", function () { setStage("solved"); });
    setStage("raw");
  }

  /* ---------------- Simulator ----------------
     Same rule the platform applies: mandatory criteria exclude first,
     then the remaining quotations are scored on normalised weights. */

  var protRule = document.getElementById("protRule");
  var protHint = document.getElementById("protHint");
  var rankList = document.getElementById("rank");
  var insight = document.getElementById("simInsight");
  var simReset = document.getElementById("simReset");

  var WEIGHTS = [
    { id: "wPrice",    out: "wPriceOut",    key: "price" },
    { id: "wDelivery", out: "wDeliveryOut", key: "delivery" },
    { id: "wPayment",  out: "wPaymentOut",  key: "payment" }
  ];
  var DEFAULTS = { wPrice: 50, wDelivery: 30, wPayment: 20 };

  function readWeights() {
    var raw = {};
    WEIGHTS.forEach(function (w) {
      var input = document.getElementById(w.id);
      raw[w.key] = input ? Number(input.value) : 0;
    });
    return raw;
  }

  /* Linear normalisation across the eligible set: best = 100, worst = 0. */
  function normalise(values, higherIsBetter) {
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    return values.map(function (v) {
      if (max === min) { return 100; }
      var ratio = (v - min) / (max - min);
      return (higherIsBetter ? ratio : 1 - ratio) * 100;
    });
  }

  function formatPrice(value) {
    return value.toLocaleString(SQ_LOCALE_TAGS[currentLang], {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function renderSimulator() {
    if (!rankList) { return; }

    var ruleOn = protRule ? protRule.checked : true;
    if (protHint) { protHint.textContent = t(ruleOn ? "sim.protHintOn" : "sim.protHintOff"); }

    var weights = readWeights();
    WEIGHTS.forEach(function (w) {
      var out = document.getElementById(w.out);
      if (out) { out.textContent = weights[w.key] + "%"; }
    });

    var total = weights.price + weights.delivery + weights.payment;
    var eligible = SQ_QUOTES.filter(function (q) { return !ruleOn || q.protein >= 18; });
    var excluded = SQ_QUOTES.filter(function (q) { return ruleOn && q.protein < 18; });

    var scored = [];
    if (total > 0 && eligible.length > 0) {
      var nPrice = normalise(eligible.map(function (q) { return q.price; }), false);
      var nDays = normalise(eligible.map(function (q) { return q.days; }), false);
      var nPay = normalise(eligible.map(function (q) { return q.paymentDays; }), true);

      scored = eligible.map(function (q, i) {
        var score = (weights.price * nPrice[i] + weights.delivery * nDays[i] + weights.payment * nPay[i]) / total;
        return { quote: q, score: Math.round(score) };
      }).sort(function (a, b) { return b.score - a.score; });
    } else {
      scored = eligible.map(function (q) { return { quote: q, score: null }; });
    }

    rankList.innerHTML = "";

    scored.forEach(function (row, index) {
      var detail = t("sim.detail", {
        price: formatPrice(row.quote.price),
        days: row.quote.days,
        payment: t(row.quote.paymentKey)
      });
      var item = document.createElement("li");
      item.className = "rank-item" + (index === 0 && row.score !== null ? " is-winner" : "");
      item.innerHTML =
        '<span class="rank-pos">' + (row.score === null ? "–" : index + 1) + "</span>" +
        '<span class="rank-name">' + row.quote.name + '<span class="rank-detail">' + detail + "</span></span>" +
        '<span class="rank-score">' + (row.score === null ? "–" : row.score) + "</span>" +
        '<span class="rank-bar"><span style="width:' + (row.score === null ? 0 : row.score) + '%"></span></span>';
      rankList.appendChild(item);
    });

    excluded.forEach(function (q) {
      var item = document.createElement("li");
      item.className = "rank-item is-excluded";
      item.innerHTML =
        '<span class="rank-pos">✕</span>' +
        '<span class="rank-name">' + q.name + '<span class="rank-detail">' + t("sim.excludedWhy") + "</span></span>" +
        '<span class="rank-score">' + t("sim.excluded") + "</span>";
      rankList.appendChild(item);
    });

    if (insight) { insight.textContent = insightFor(ruleOn, total, scored); }
  }

  function insightFor(ruleOn, total, scored) {
    if (total === 0) { return t("sim.noWeights"); }
    if (!ruleOn) {
      return scored.length && scored[0].quote.id === "granos" ? t("sim.insightOpen") : t("sim.insightPrice");
    }
    if (!scored.length) { return t("sim.insightExcluded"); }
    if (scored[0].quote.id === "avipiensos") { return t("sim.insightDelivery"); }
    return t("sim.insightExcluded");
  }

  WEIGHTS.forEach(function (w) {
    var input = document.getElementById(w.id);
    if (input) { input.addEventListener("input", renderSimulator); }
  });
  if (protRule) { protRule.addEventListener("change", renderSimulator); }
  if (simReset) {
    simReset.addEventListener("click", function () {
      Object.keys(DEFAULTS).forEach(function (id) {
        var input = document.getElementById(id);
        if (input) { input.value = DEFAULTS[id]; }
      });
      if (protRule) { protRule.checked = true; }
      renderSimulator();
    });
  }

  /* ---------------- Traceability chain ---------------- */

  var chain = document.getElementById("chain");
  var chainDetail = document.getElementById("chainDetail");
  var activeStep = 4;

  function renderChain() {
    if (!chain) { return; }
    chain.querySelectorAll("button").forEach(function (btn) {
      var step = Number(btn.getAttribute("data-step"));
      btn.classList.toggle("is-active", step === activeStep);
      btn.classList.toggle("is-linked", step < activeStep);
      btn.setAttribute("aria-pressed", String(step === activeStep));
    });
    if (chainDetail) { chainDetail.textContent = t("trace.d" + activeStep); }
  }

  if (chain) {
    chain.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-step]");
      if (!btn) { return; }
      activeStep = Number(btn.getAttribute("data-step"));
      renderChain();
    });
  }

  /* ---------------- FAQ filter ---------------- */

  var faqSearch = document.getElementById("faqSearch");
  var faqList = document.getElementById("faqList");
  var faqEmpty = document.getElementById("faqEmpty");

  function normaliseText(value) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function filterFaq() {
    if (!faqSearch || !faqList) { return; }
    var term = normaliseText(faqSearch.value.trim());
    var visible = 0;
    faqList.querySelectorAll(".faq-item").forEach(function (item) {
      var match = term === "" || normaliseText(item.textContent).indexOf(term) !== -1;
      item.hidden = !match;
      if (match) { visible += 1; }
    });
    if (faqEmpty) { faqEmpty.hidden = visible !== 0; }
  }

  if (faqSearch) {
    var debounce;
    faqSearch.addEventListener("input", function () {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(filterFaq, 200);
    });
  }

  /* ---------------- Demo request form ---------------- */

  var form = document.getElementById("demoForm");
  var status = document.getElementById("formStatus");

  function clearFormMessages() {
    if (!form) { return; }
    form.querySelectorAll(".field").forEach(function (field) {
      field.classList.remove("has-error");
      var message = field.querySelector(".field-error");
      if (message) { message.remove(); }
      var input = field.querySelector("input");
      if (input) { input.removeAttribute("aria-invalid"); }
    });
    if (status) { status.textContent = ""; status.classList.remove("is-ok"); }
  }

  function showFieldError(input, messageKey) {
    var field = input.closest(".field");
    field.classList.add("has-error");
    input.setAttribute("aria-invalid", "true");
    var message = document.createElement("span");
    message.className = "field-error";
    message.textContent = t(messageKey);
    field.appendChild(message);
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearFormMessages();

      var name = document.getElementById("fName");
      var email = document.getElementById("fEmail");
      var company = document.getElementById("fCompany");
      var firstInvalid = null;

      if (name.value.trim() === "") {
        showFieldError(name, "demo.errName");
        firstInvalid = firstInvalid || name;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        showFieldError(email, "demo.errEmail");
        firstInvalid = firstInvalid || email;
      }
      if (company.value.trim() === "") {
        showFieldError(company, "demo.errCompany");
        firstInvalid = firstInvalid || company;
      }

      if (firstInvalid) { firstInvalid.focus(); return; }

      /* Static site: no backend yet. Replace with the contact endpoint call. */
      status.textContent = t("demo.sent");
      status.classList.add("is-ok");
      form.reset();
    });
  }

  /* ---------------- Boot ---------------- */

  applyLanguage(initialLanguage());
})();