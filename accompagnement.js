"use strict";
(function () {
  function apiUrl(path) {
    const base = String(window.SIRA_API_BASE_URL || "").trim().replace(/\\/+$/, "");
    if (!base) throw new Error("Le serveur partagé Sira n’est pas encore relié. Les exercices restent disponibles.");
    return base + path;
  }
  const $ = (id) => document.getElementById(id);
  const state = {
    client: null,
    session: null,
    config: null,
    messages: [],
    busy: false,
    breathInterval: null,
    breathStartedAt: 0,
    speechRecognition: null
  };

  function setStatus(id, message, isError) {
    const node = $(id);
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error", !!isError);
  }

  function loadSupabaseSdk() {
    if (window.supabase && typeof window.supabase.createClient === "function") return Promise.resolve(true);
    return new Promise((resolve) => {
      const sources = [
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js",
        "https://unpkg.com/@supabase/supabase-js@2.117.3/dist/umd/supabase.js"
      ];
      let remaining = sources.length;
      let settled = false;
      sources.forEach((source) => {
        const script = document.createElement("script");
        let finished = false;
        const timer = window.setTimeout(() => finish(false), 9000);
        function finish(ok) {
          if (finished) return;
          finished = true;
          window.clearTimeout(timer);
          if (ok && window.supabase && typeof window.supabase.createClient === "function") {
            if (!settled) { settled = true; resolve(true); }
          } else {
            script.remove();
            remaining -= 1;
            if (!settled && remaining <= 0) { settled = true; resolve(false); }
          }
        }
        script.src = source;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => finish(true);
        script.onerror = () => finish(false);
        document.head.appendChild(script);
      });
    });
  }

  async function initAuth() {
    const gate = $("authGate");
    gate.hidden = false;
    const guestButton = $("guestStart");
    setStatus("authStatus", "Préparation de la connexion sécurisée…");
    try {
      const configPromise = fetch(apiUrl("/api/config"), { cache: "no-store" }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Configuration inaccessible.");
        return data;
      });
      const [config, sdkReady] = await Promise.all([configPromise, loadSupabaseSdk()]);
      state.config = config;
      if (!config.authConfigured || !config.supabaseUrl || !config.supabasePublishableKey || !sdkReady) {
        setStatus("authStatus", "La connexion sécurisée n’est pas disponible sur cette version. Les exercices restent utilisables. Retourne à Sira AI pour réessayer.", true);
        guestButton.disabled = true;
        return;
      }
      state.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const sessionResult = await state.client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      state.session = sessionResult.data && sessionResult.data.session ? sessionResult.data.session : null;
      guestButton.disabled = false;
      if (state.session && state.session.access_token) {
        onAuthenticated();
      } else {
        setStatus("authStatus", "Aucune session active. Tu peux démarrer une session invitée ou te connecter depuis Sira AI.");
        guestButton.textContent = "Continuer en invité";
      }
      state.client.auth.onAuthStateChange((event, session) => {
        if (session && session.access_token) {
          state.session = session;
          onAuthenticated();
        } else if (event === "SIGNED_OUT") {
          state.session = null;
          onSignedOut();
        }
      });
    } catch (error) {
      guestButton.disabled = true;
      setStatus("authStatus", error && error.message ? error.message : "La connexion n’a pas pu être préparée. Les exercices restent accessibles.", true);
    }
  }

  function onAuthenticated() {
    $("authGate").hidden = true;
    $("messageInput").disabled = false;
    $("sendButton").disabled = false;
    $("micButton").disabled = false;
    $("chatStatus").textContent = state.config && state.config.assistantConfigured === false
      ? "Connexion prête. Le moteur IA doit encore être configuré côté serveur ; les exercices restent accessibles."
      : "Session active. Cette conversation reste uniquement dans cette page et ne sera pas restaurée après sa fermeture.";
  }

  function onSignedOut() {
    $("authGate").hidden = false;
    $("messageInput").disabled = true;
    $("sendButton").disabled = true;
    $("micButton").disabled = true;
    setStatus("authStatus", "La session a été fermée. Redémarre en mode invité ou retourne à Sira AI.");
  }

  async function startGuestSession() {
    if (!state.client) return;
    const button = $("guestStart");
    button.disabled = true;
    button.textContent = "Connexion…";
    setStatus("authStatus", "Création d’une session invitée…");
    try {
      const result = await state.client.auth.signInAnonymously();
      if (result.error) throw result.error;
      state.session = result.data && result.data.session ? result.data.session : null;
      if (!state.session) throw new Error("La session invitée n’a pas été créée.");
      onAuthenticated();
    } catch (error) {
      setStatus("authStatus", error && error.message
        ? "Le mode invité n’est pas disponible : " + error.message + ". Tu peux te connecter depuis Sira AI."
        : "Impossible de démarrer le mode invité. Réessaie depuis Sira AI.", true);
      button.disabled = false;
      button.textContent = "Réessayer";
    }
  }

  function appendMessage(role, content, options) {
    const row = document.createElement("div");
    row.className = "message " + (role === "user" ? "user" : "assistant");
    const avatar = document.createElement("div");
    avatar.className = "bubble-avatar";
    avatar.textContent = role === "user" ? "T" : "S";
    const bubbleWrap = document.createElement("div");
    bubbleWrap.className = "bubble-wrap";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = content || "";
    bubbleWrap.appendChild(bubble);
    if (role === "assistant" && options && options.listen) {
      const actions = document.createElement("div");
      actions.className = "bubble-actions";
      const listen = document.createElement("button");
      listen.type = "button";
      listen.className = "listen-button";
      listen.textContent = "Écouter la réponse";
      listen.addEventListener("click", () => speak(content));
      actions.appendChild(listen);
      bubbleWrap.appendChild(actions);
    }
    row.appendChild(avatar);
    row.appendChild(bubbleWrap);
    $("chatMessages").appendChild(row);
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
    return bubble;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      setStatus("chatStatus", "La lecture vocale n’est pas prise en charge par ce navigateur.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text || ""));
    utterance.lang = "fr-FR";
    utterance.rate = 0.96;
    window.speechSynthesis.speak(utterance);
  }

  async function sendMessage(rawText) {
    const content = String(rawText || "").trim();
    if (!content || state.busy) return;
    if (!state.session || !state.session.access_token) {
      setStatus("chatStatus", "Ouvre d’abord une session sécurisée ou retourne à Sira AI.", true);
      $("authGate").hidden = false;
      return;
    }
    if (state.config && state.config.assistantConfigured === false) {
      setStatus("chatStatus", "Le moteur de conversation n’est pas configuré sur le serveur. Les exercices guidés restent disponibles.", true);
      return;
    }
    state.busy = true;
    $("messageInput").value = "";
    $("sendButton").disabled = true;
    $("micButton").disabled = true;
    $("messageInput").disabled = true;
    state.messages.push({ role: "user", content });
    appendMessage("user", content);
    const answerBubble = appendMessage("assistant", "Sira prépare une réponse prudente…");
    answerBubble.style.opacity = ".72";
    setStatus("chatStatus", "Réflexion en cours…");
    try {
      const sessionResult = await state.client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error("Ta session a expiré. Retourne à Sira AI pour te reconnecter.");
      state.session = sessionResult.data.session;
      const recentMessages = state.messages.slice(-10);
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({
          messages: recentMessages,
          assistantType: "wellbeing",
          preferences: { language: "fr", personality: "balanced" }
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Le service a répondu avec le code " + response.status + ".");
      }
      if (!response.body) throw new Error("Le navigateur ne peut pas lire la réponse.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let gotDone = false;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true }).replace(/\r\n/g, "\n");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          if (!raw) continue;
          if (raw === "[DONE]") { gotDone = true; continue; }
          let data;
          try { data = JSON.parse(raw); } catch (_) { continue; }
          if (data.error) throw new Error(data.error.message || "La réponse a été interrompue.");
          const delta = data.choices && data.choices[0] && data.choices[0].delta;
          if (delta && typeof delta.content === "string") {
            answer += delta.content;
            answerBubble.textContent = answer;
            answerBubble.style.opacity = "1";
            $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
          }
          if (data.nexus && data.nexus.type === "plugin_status") {
            setStatus("chatStatus", data.nexus.label || "Sira prépare sa réponse…");
          }
        }
      }
      if (!answer.trim()) throw new Error("Le moteur IA n’a pas renvoyé de réponse exploitable.");
      state.messages.push({ role: "assistant", content: answer });
      answerBubble.style.opacity = "1";
      const row = answerBubble.closest(".message");
      if (row) {
        const wrap = row.querySelector(".bubble-wrap");
        const actions = document.createElement("div");
        actions.className = "bubble-actions";
        const listen = document.createElement("button");
        listen.type = "button";
        listen.className = "listen-button";
        listen.textContent = "Écouter la réponse";
        listen.addEventListener("click", () => speak(answer));
        actions.appendChild(listen);
        wrap.appendChild(actions);
      }
      setStatus("chatStatus", "Réponse terminée. Tu peux poursuivre ou faire une pause.");
    } catch (error) {
      answerBubble.textContent = error && error.message ? error.message : "Une erreur est survenue. Réessaie plus tard.";
      answerBubble.style.opacity = "1";
      setStatus("chatStatus", "La réponse n’a pas pu être générée. Ton message reste uniquement visible dans cette page.", true);
    } finally {
      state.busy = false;
      $("messageInput").disabled = !state.session;
      $("sendButton").disabled = !state.session;
      $("micButton").disabled = !state.session;
      $("messageInput").focus();
    }
  }

  function initBreathing() {
    const visual = $("breathVisual");
    const phaseNode = $("breathPhase");
    const countNode = $("breathCount");
    const timerNode = $("breathTimer");
    const startButton = $("breathStart");
    const stopButton = $("breathStop");
    const total = 36;
    const phases = [
      { start: 0, end: 4, label: "Inspire", className: "inhale" },
      { start: 4, end: 6, label: "Pause douce", className: "hold" },
      { start: 6, end: 12, label: "Expire", className: "exhale" }
    ];
    function stop(completed) {
      if (state.breathInterval) window.clearInterval(state.breathInterval);
      state.breathInterval = null;
      visual.classList.remove("inhale", "hold", "exhale");
      phaseNode.textContent = completed ? "Bravo" : "À ton rythme";
      countNode.textContent = completed ? "Pause terminée" : "Exercice arrêté";
      timerNode.textContent = "00:36";
      startButton.disabled = false;
      startButton.textContent = completed ? "Recommencer" : "Reprendre";
      stopButton.disabled = true;
    }
    startButton.addEventListener("click", () => {
      if (state.breathInterval) return;
      state.breathStartedAt = Date.now();
      startButton.disabled = true;
      stopButton.disabled = false;
      function tick() {
        const elapsed = Math.floor((Date.now() - state.breathStartedAt) / 1000);
        if (elapsed >= total) { stop(true); return; }
        const cycle = elapsed % 12;
        const round = Math.floor(elapsed / 12) + 1;
        const phase = phases.find((item) => cycle >= item.start && cycle < item.end) || phases[0];
        phaseNode.textContent = phase.label;
        countNode.textContent = "Cycle " + round + " sur 3";
        visual.classList.remove("inhale", "hold", "exhale");
        visual.classList.add(phase.className);
        const remaining = total - elapsed;
        timerNode.textContent = "00:" + String(remaining).padStart(2, "0");
      }
      tick();
      state.breathInterval = window.setInterval(tick, 250);
    });
    stopButton.addEventListener("click", () => stop(false));
  }

  function renderMoodHistory() {
    const historyNode = $("moodHistory");
    const clearButton = $("clearMood");
    if (!$("localMoodConsent").checked) {
      historyNode.textContent = "";
      clearButton.hidden = true;
      return;
    }
    let records = [];
    try { records = JSON.parse(localStorage.getItem("sira-equilibre-checkins") || "[]"); } catch (_) {}
    if (!Array.isArray(records)) records = [];
    historyNode.textContent = "";
    records.slice(0, 5).forEach((record) => {
      const row = document.createElement("div");
      row.className = "mood-item";
      const label = document.createElement("span");
      label.textContent = record.mood || "Check-in";
      const time = document.createElement("time");
      time.textContent = record.date || "";
      row.append(label, time);
      historyNode.appendChild(row);
    });
    clearButton.hidden = records.length === 0;
  }

  function initMoodCheckins() {
    $("localMoodConsent").addEventListener("change", renderMoodHistory);
    $("saveMood").addEventListener("click", () => {
      const mood = $("moodSelect").value;
      if (!mood) { setStatus("moodStatus", "Choisis d’abord une émotion.", true); return; }
      if (!$("localMoodConsent").checked) {
        setStatus("moodStatus", "Coche le consentement pour enregistrer ce check-in sur cet appareil, ou laisse-le non enregistré.", true);
        return;
      }
      try {
        let records = JSON.parse(localStorage.getItem("sira-equilibre-checkins") || "[]");
        if (!Array.isArray(records)) records = [];
        records.unshift({
          mood,
          date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date())
        });
        localStorage.setItem("sira-equilibre-checkins", JSON.stringify(records.slice(0, 30)));
        $("moodSelect").value = "";
        setStatus("moodStatus", "Check-in enregistré uniquement sur cet appareil.");
        renderMoodHistory();
      } catch (_) {
        setStatus("moodStatus", "Le navigateur n’a pas pu enregistrer ce check-in.", true);
      }
    });
    $("clearMood").addEventListener("click", () => {
      try { localStorage.removeItem("sira-equilibre-checkins"); } catch (_) {}
      renderMoodHistory();
      setStatus("moodStatus", "Tes check-ins locaux ont été effacés.");
    });
  }

  function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const button = $("micButton");
    if (!SpeechRecognition) {
      button.disabled = true;
      button.title = "La dictée vocale n’est pas prise en charge par ce navigateur";
      return;
    }
    button.addEventListener("click", () => {
      if (state.speechRecognition) {
        try { state.speechRecognition.stop(); } catch (_) {}
        return;
      }
      const recognition = new SpeechRecognition();
      state.speechRecognition = recognition;
      recognition.lang = "fr-FR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      button.textContent = "…";
      recognition.onresult = (event) => {
        const phrase = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript : "";
        if (phrase) {
          const input = $("messageInput");
          input.value = (input.value ? input.value + " " : "") + phrase;
          input.focus();
        }
      };
      recognition.onerror = () => setStatus("chatStatus", "La dictée vocale n’a pas pu démarrer. Tu peux écrire ton message.");
      recognition.onend = () => {
        state.speechRecognition = null;
        button.textContent = "🎙";
      };
      try { recognition.start(); } catch (_) {
        state.speechRecognition = null;
        button.textContent = "🎙";
        setStatus("chatStatus", "Impossible de démarrer la dictée vocale.");
      }
    });
  }

  function initControls() {
    $("guestStart").addEventListener("click", startGuestSession);
    $("chatForm").addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage($("messageInput").value);
    });
    $("messageInput").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage($("messageInput").value);
      }
    });
    document.querySelectorAll("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = $("messageInput");
        input.value = button.dataset.prompt || "";
        input.focus();
      });
    });
    $("groundingToggle").addEventListener("click", () => {
      const node = $("groundingSteps");
      node.hidden = !node.hidden;
      $("groundingToggle").setAttribute("aria-expanded", String(!node.hidden));
      $("groundingToggle").textContent = node.hidden ? "Afficher l’exercice 5–4–3–2–1" : "Masquer l’exercice";
    });
    $("resetConversation").addEventListener("click", () => {
      state.messages = [];
      $("chatMessages").textContent = "";
      const welcome = document.createElement("div");
      welcome.className = "welcome-message";
      welcome.innerHTML = '<span class="welcome-mark">S</span><div><strong>Conversation effacée.</strong><p>Tu peux repartir à ton rythme. Aucun historique de cette page n’a été enregistré.</p></div>';
      $("chatMessages").appendChild(welcome);
      setStatus("chatStatus", "La conversation affichée a été effacée.");
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });
    initBreathing();
    initMoodCheckins();
    initVoiceInput();
  }

  initControls();
  initAuth();
})();