(function () {
  const USERS_KEY = "swr_users";
  const SESSION_KEY = "swr_session";

  const BLOCKED_WORDS = [
    "ass", "asshole", "bastard", "bitch", "bullshit", "cock", "crap", "cum",
    "cunt", "damn", "dick", "douche", "fag", "faggot", "fuck", "fucker",
    "fucking", "hell", "hitler", "nazi", "nigga", "nigger", "penis", "piss",
    "pussy", "retard", "shit", "slut", "twat", "vagina", "whore"
  ];

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function normalizeForProfanity(text) {
    return text
      .toLowerCase()
      .replace(/[@4]/g, "a")
      .replace(/[3]/g, "e")
      .replace(/[1!|]/g, "i")
      .replace(/[0]/g, "o")
      .replace(/[$5]/g, "s")
      .replace(/[7+]/g, "t")
      .replace(/[^a-z0-9]/g, "");
  }

  function containsProfanity(username) {
    const normalized = normalizeForProfanity(username);
    return BLOCKED_WORDS.some(function (word) {
      return normalized.includes(word);
    });
  }

  async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function validateUsername(username) {
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 30) {
      return "Username must be 3–30 characters.";
    }
    if (!/^[A-Za-z0-9_]+$/.test(trimmed)) {
      return "Username may only contain letters, numbers, and underscores.";
    }
    if (containsProfanity(trimmed)) {
      return "That username is not allowed. Please choose a different one.";
    }
    return null;
  }

  function validatePassword(password) {
    if (password.length < 8) {
      return "Password must be at least 8 characters.";
    }
    return null;
  }

  function findUserKey(username) {
    const lower = username.trim().toLowerCase();
    const users = getUsers();
    return Object.keys(users).find(function (key) {
      return key.toLowerCase() === lower;
    });
  }

  async function signup(username, password) {
    const usernameError = validateUsername(username);
    if (usernameError) {
      return { ok: false, error: usernameError };
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return { ok: false, error: passwordError };
    }

    const trimmed = username.trim();
    if (findUserKey(trimmed)) {
      return { ok: false, error: "That username is already taken." };
    }

    const users = getUsers();
    users[trimmed] = {
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString()
    };
    saveUsers(users);
    sessionStorage.setItem(SESSION_KEY, trimmed);
    return { ok: true, username: trimmed };
  }

  async function login(username, password) {
    const trimmed = username.trim();
    if (!trimmed) {
      return { ok: false, error: "Please enter your username." };
    }

    const userKey = findUserKey(trimmed);
    if (!userKey) {
      return { ok: false, error: "Invalid username or password." };
    }

    const users = getUsers();
    const hash = await hashPassword(password);
    if (users[userKey].passwordHash !== hash) {
      return { ok: false, error: "Invalid username or password." };
    }

    sessionStorage.setItem(SESSION_KEY, userKey);
    return { ok: true, username: userKey };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getCurrentUser() {
    return sessionStorage.getItem(SESSION_KEY);
  }

  function renderNav(navEl, base) {
    const user = getCurrentUser();
    navEl.textContent = "";

    if (user) {
      const greeting = document.createElement("span");
      greeting.className = "auth-greeting";
      greeting.textContent = "Signed in as " + user;

      const logoutLink = document.createElement("a");
      logoutLink.href = "#";
      logoutLink.className = "auth-link";
      logoutLink.textContent = "Log out";
      logoutLink.addEventListener("click", function (event) {
        event.preventDefault();
        logout();
        window.location.href = base + "/index.html";
      });

      navEl.appendChild(greeting);
      navEl.appendChild(logoutLink);
      return;
    }

    const loginLink = document.createElement("a");
    loginLink.href = base + "/login.html";
    loginLink.className = "auth-link";
    loginLink.textContent = "Log in";

    const signupLink = document.createElement("a");
    signupLink.href = base + "/signup.html";
    signupLink.className = "auth-link auth-link-primary";
    signupLink.textContent = "Create account";

    navEl.appendChild(loginLink);
    navEl.appendChild(signupLink);
  }

  function showFormMessage(el, message, type) {
    el.textContent = message;
    el.className = "form-message " + type;
    el.hidden = !message;
  }

  function initAuthPage() {
    const signupForm = document.getElementById("signup-form");
    if (signupForm) {
      const usernameInput = document.getElementById("username");
      const usernameHint = document.getElementById("username-feedback");

      if (usernameInput && usernameHint) {
        usernameInput.addEventListener("input", function () {
          const error = validateUsername(usernameInput.value);
          if (!usernameInput.value.trim()) {
            usernameHint.textContent = "";
            usernameHint.className = "form-hint";
            return;
          }
          if (error) {
            usernameHint.textContent = error;
            usernameHint.className = "form-hint form-hint-error";
            return;
          }
          usernameHint.textContent = "Username looks good.";
          usernameHint.className = "form-hint form-hint-ok";
        });
      }

      signupForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const messageEl = document.getElementById("form-message");
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const confirm = document.getElementById("confirm-password").value;

        if (password !== confirm) {
          showFormMessage(messageEl, "Passwords do not match.", "error");
          return;
        }

        const result = await signup(username, password);
        if (!result.ok) {
          showFormMessage(messageEl, result.error, "error");
          return;
        }

        showFormMessage(messageEl, "Account created! Redirecting…", "success");
        setTimeout(function () {
          window.location.href = signupForm.dataset.home || "index.html";
        }, 800);
      });
    }

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const messageEl = document.getElementById("form-message");
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        const result = await login(username, password);
        if (!result.ok) {
          showFormMessage(messageEl, result.error, "error");
          return;
        }

        window.location.href = loginForm.dataset.home || "index.html";
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-auth-nav]").forEach(function (navEl) {
      renderNav(navEl, navEl.dataset.authNav);
    });
    initAuthPage();
  });

  window.StarWarsAuth = {
    signup: signup,
    login: login,
    logout: logout,
    getCurrentUser: getCurrentUser,
    validateUsername: validateUsername,
    containsProfanity: containsProfanity
  };
})();
