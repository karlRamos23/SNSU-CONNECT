/* SNSU Connects - frontend (vanilla JS, talks to /api) */

const CAP = '<img alt="SNSU logo" src="/assets/img/logo.webp">';
const GOOGLE_CLIENT_ID =
  "632532630983-652lb4mvm0eqfuqcp58ad5t67a4g5ti4.apps.googleusercontent.com";
let SEM = localStorage.getItem("snsu_semester") || "2026-2027 2nd Sem";

let selectedAY = localStorage.getItem("snsu_ay") || "2026-2027";
let selectedSemester = localStorage.getItem("snsu_sem") || "2nd Semester"; // change each semester

const S = {
  user: null,
  profileEditing: false,
  theme: localStorage.getItem("snsu_theme"),
  events: [],
  mine: [],
  rep: null,
  tab: "home",
  navTouched: false,
  flt: "All",
  q: "",
  dr: false,
  res: null,
  pick: null,
  sf: false,
  ip: 0,
  intro: true,
  reg: false,
  authRole: "student", // NEW: default login role
  qr: null,
  toast: "",
};

let sx = null,
  stream = null,
  raf = 0;

const $ = (id) => document.getElementById(id);

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );

const fd = (t) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const ft = (t) =>
  new Date(t).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const st = (e) => {
  const n = Date.now();
  return n < e.start_at ? "Upcoming" : n > e.end_at ? "Completed" : "Active";
};

const isA = () => !!S.user && S.user.role === "admin";
const evById = (id) => S.events.find((e) => e.id == id);
const photo = () => (S.user && S.user.photo) || null;
window.startProfileEdit = function () {
  S.profileEditing = true;
  render();
};

window.cancelProfileEdit = function () {
  S.profileEditing = false;
  render();
};

function applyTheme() {
  const r = document.documentElement;
  S.theme ? (r.dataset.theme = S.theme) : delete r.dataset.theme;
}

const isDark = () =>
  S.theme
    ? S.theme === "dark"
    : matchMedia("(prefers-color-scheme: dark)").matches;

function toggleTheme() {
  S.theme = isDark() ? "light" : "dark";
  localStorage.setItem("snsu_theme", S.theme);
  render();
}

function say(m) {
  S.toast = m;
  render();
  setTimeout(() => {
    S.toast = "";
    render();
  }, 2200);
}

/* ---------- data loading ---------- */

async function load() {
  S.events = await API.get("/events");

  if (!isA()) {
    S.mine = await API.get("/attendance/mine");
  }

  if (!S.events.some((e) => e.id == S.pick)) {
    S.pick =
      (S.events.find((e) => st(e) == "Active") || S.events[0] || {}).id || null;
  }
}

async function loadRep() {
  S.rep = S.pick ? await API.get("/attendance/event/" + S.pick) : null;
}

async function go(t, id) {
  stopCam();

  S.navTouched = true;

  if (id) S.pick = id;

  S.tab = t;
  S.dr = false;
  S.flt = "All";
  S.q = "";
  S.sf = false;
  S.qr = null;

  try {
    await load();

    if (t === "reports" || t === "live") {
      await loadRep();
    }

    if (typeof remLoad === "function") {
      await remLoad(t);
    }
  } catch (e) {}

  render();
  scrollTo(0, 0);
}

/* ---------- small view helpers ---------- */

function evRow(e) {
  const d = new Date(e.start_at);

  return `<div class="ev">
    <div class="d">
      <b>${d.getDate()}</b>
      ${d.toLocaleString([], { month: "short" })}
    </div>
    <div class="i">
      <b>${esc(e.title)}</b>
      <small>
        ${esc(e.venue)}<br>
        ${fd(e.start_at)}
        ${
          e.reg_deadline && e.reg_deadline > Date.now() && st(e) != "Completed"
            ? "<br>Register by " + fd(e.reg_deadline)
            : ""
        }
      </small>
    </div>
    <span class="bd ${st(e)}">${st(e)}</span>
  </div>`;
}

const R = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;

function avt() {
  const p = photo();

  return `<div style="display:flex;align-items:center;gap:14px;margin:6px 0 14px">
    <div style="width:96px;height:96px;border-radius:50%;overflow:hidden;background:var(--g);color:#fff;display:grid;place-items:center;font-size:38px;font-weight:800;border:4px solid var(--g2);flex:none">
      ${
        p
          ? `<img alt="Profile photo" src="${p}" style="width:100%;height:100%;object-fit:cover">`
          : esc(S.user.name[0])
      }
    </div>
    <div>
    <button class="profile-upload-btn" type="button"
  onclick="$('pf').click()">
  <i data-lucide="camera" aria-hidden="true"></i>
  <span>${p ? "Change Photo" : "Upload Photo"}</span>
</button>
           ${
             p
               ? `
        <button class="profile-delete-btn"
          type="button"
          onclick="openDeletePhotoModal()"
          title="Delete Photo"
          aria-label="Delete Photo">

          <i data-lucide="trash-2" aria-hidden="true"></i>

        </button>
      `
               : ""
           }
      <input id="pf" type="file" accept="image/*" hidden
        onchange="upPhoto(this.files[0])">
      <div id="perr" class="err"></div>
    </div>
  </div>`;
}

/* DELETE PROFILE PHOTO - CONFIRMATION MORPH */

let photoDeleteBusy = false;

function openDeletePhotoModal() {
  if (photoDeleteBusy || document.querySelector(".photo-morph-overlay")) return;

  const previousFocus = document.activeElement;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const overlay = document.createElement("div");
  overlay.className = "photo-morph-overlay";

  overlay.innerHTML = `
    <div class="photo-morph-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-delete-title"
      aria-describedby="photo-delete-message">

      <div class="photo-morph-icon">
        <i data-lucide="trash-2"></i>
      </div>

      <h2 id="photo-delete-title">Delete Profile Photo?</h2>

      <p id="photo-delete-message">
        Are you sure you want to remove your profile photo?
      </p>

      <div class="photo-morph-error" role="alert" hidden></div>

      <div class="photo-morph-actions">
        <button type="button" class="photo-morph-cancel">
          Cancel
        </button>

        <button type="button" class="photo-morph-confirm">
          <i data-lucide="trash-2"></i>
          Yes, Delete
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (window.lucide) lucide.createIcons();

  const modal = overlay.querySelector(".photo-morph-modal");
  const icon = overlay.querySelector(".photo-morph-icon");
  const title = overlay.querySelector("#photo-delete-title");
  const message = overlay.querySelector("#photo-delete-message");
  const actions = overlay.querySelector(".photo-morph-actions");
  const cancelBtn = overlay.querySelector(".photo-morph-cancel");
  const confirmBtn = overlay.querySelector(".photo-morph-confirm");
  const errorBox = overlay.querySelector(".photo-morph-error");

  let closed = false;
  let completed = false;

  function closePopup() {
    if (closed || photoDeleteBusy) return;

    closed = true;
    document.removeEventListener("keydown", handleKeys);
    overlay.classList.add("closing");

    setTimeout(
      () => {
        overlay.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
      },
      reducedMotion ? 0 : 200,
    );
  }

  function handleKeys(e) {
    if (e.key === "Escape" && !photoDeleteBusy) {
      e.preventDefault();
      closePopup();
      return;
    }

    if (e.key === "Tab") {
      const buttons = [...modal.querySelectorAll("button:not(:disabled)")];

      if (!buttons.length) {
        e.preventDefault();
        return;
      }

      const first = buttons[0];
      const last = buttons[buttons.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener("keydown", handleKeys);

  cancelBtn.onclick = closePopup;

  overlay.onclick = (e) => {
    if (e.target === overlay) closePopup();
  };

  confirmBtn.onclick = async () => {
    if (photoDeleteBusy || closed || completed) return;

    photoDeleteBusy = true;

    modal.className = "photo-morph-modal is-deleting";
    icon.innerHTML = '<span class="photo-morph-spinner"></span>';
    title.textContent = "Deleting Photo...";
    message.textContent = "Removing your profile photo.";
    actions.hidden = true;
    errorBox.hidden = true;

    try {
      // Same endpoint as your existing setPhoto(null).
      // Call API directly here so failures can be caught.
      const updatedUser = await API.put("/users/me", data);

S.user = updatedUser;
S.profileEditing = false;
completed = true;

      modal.className = "photo-morph-modal is-deleted";

      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="3"
          stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      `;

      title.textContent = "Photo Deleted!";
      message.textContent = "Your profile photo has been removed successfully.";

      await new Promise((resolve) =>
        setTimeout(resolve, reducedMotion ? 0 : 1100),
      );

      document.removeEventListener("keydown", handleKeys);
      overlay.remove();
      render();
    } catch (e) {
      modal.className = "photo-morph-modal is-error";

      icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 7v6M12 17h.01"></path>
        </svg>
      `;

      title.textContent = "Unable to Delete";
      message.textContent = "Your profile photo was not removed.";

      errorBox.textContent = e.message || "Unable to delete profile photo.";
      errorBox.hidden = false;

      cancelBtn.textContent = "Close";
      confirmBtn.textContent = "Try Again";

      actions.hidden = false;
      confirmBtn.focus();
    } finally {
      photoDeleteBusy = false;
    }
  };

  cancelBtn.focus();
}

/* FIXED PROFILE PHOTO UPLOAD
   Works for Student and Admin Profile */

async function upPhoto(file) {
  if (!file) return;

  const errorBox = $("perr");
  const input = $("pf");

  if (errorBox) errorBox.textContent = "";

  // Validate the selected image.
  if (!file.type.startsWith("image/")) {
    if (errorBox) {
      errorBox.textContent = "Please select an image file.";
    }
    return;
  }

  // Limit file size to 10 MB before processing.
  if (file.size > 10 * 1024 * 1024) {
    if (errorBox) {
      errorBox.textContent = "Choose an image smaller than 10 MB.";
    }
    return;
  }

  const uploadBtn = document.querySelector(".mp-upload");

  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.setAttribute("aria-busy", "true");
  }

  try {
    // Read the selected image.
    const dataURL = await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error("Could not read the selected image."));

      reader.readAsDataURL(file);
    });

    // Load the image for cropping.
    const img = await new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () =>
        reject(new Error("Could not open the image. Try JPG or PNG."));

      image.src = dataURL;
    });

    // Crop to a square, retaining your existing behavior.
    const canvas = document.createElement("canvas");
    const size = 240;
    const crop = Math.min(img.width, img.height);

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      img,
      (img.width - crop) / 2,
      (img.height - crop) / 2,
      crop,
      crop,
      0,
      0,
      size,
      size,
    );

    const photoData = canvas.toDataURL("image/jpeg", 0.82);

    // Upload and wait for the real server response.
    const updatedUser = await API.put("/users/me/photo", {
      photo: photoData,
    });

    S.user = updatedUser;

    // Refresh the profile with the newly uploaded photo.
    render();
  } catch (e) {
    console.error("Profile photo upload failed:", e);

    const currentErrorBox = $("perr");

    if (currentErrorBox) {
      currentErrorBox.textContent =
        e.message || "Unable to upload profile photo.";
    }
  } finally {
    if (input && input.isConnected) input.value = "";

    if (uploadBtn && uploadBtn.isConnected) {
      uploadBtn.disabled = false;
      uploadBtn.removeAttribute("aria-busy");
    }
  }
}

/* ==========================================
   SAVE CHANGES - CONFIRMATION MORPH POPUP
   Student and Admin Profile
   ========================================== */

let profileSaveBusy = false;

async function saveMe() {
  if (profileSaveBusy || document.querySelector(".save-morph-overlay")) {
    return;
  }

  const g = (id) => ($(id) ? $(id).value.trim() : "");
  const errorBox = $("err");

  // Capture the current form values.
  const data = {
    name: g("pn"),
    contact: g("pc"),
  };

  // Student-only fields.
  if ($("pco")) data.course = g("pco");
  if ($("py")) data.year_level = g("py");

  if (errorBox) errorBox.textContent = "";

  const previousFocus = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "save-morph-overlay";

  overlay.innerHTML = `
    <div class="save-morph-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-morph-title"
      aria-describedby="save-morph-message">

      <div class="save-morph-icon">
        <i data-lucide="save"></i>
      </div>

      <h2 id="save-morph-title">
        Save Profile Changes?
      </h2>

      <p id="save-morph-message">
        Are you sure you want to save your
        updated profile information?
      </p>

      <div class="save-morph-error" role="alert" hidden></div>

      <div class="save-morph-actions">
        <button type="button" class="save-morph-cancel">
          Cancel
        </button>

        <button type="button" class="save-morph-confirm">
          <i data-lucide="check"></i>
          Yes, Save
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  if (window.lucide) lucide.createIcons();

  const modal = overlay.querySelector(".save-morph-modal");
  const icon = overlay.querySelector(".save-morph-icon");
  const title = overlay.querySelector("#save-morph-title");
  const message = overlay.querySelector("#save-morph-message");
  const actions = overlay.querySelector(".save-morph-actions");
  const cancelBtn = overlay.querySelector(".save-morph-cancel");
  const confirmBtn = overlay.querySelector(".save-morph-confirm");
  const popupError = overlay.querySelector(".save-morph-error");

  let completed = false;
  let closed = false;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const closePopup = () => {
    if (closed || profileSaveBusy) return;

    closed = true;
    overlay.classList.add("closing");
    document.removeEventListener("keydown", handleKeys);

    setTimeout(
      () => {
        overlay.remove();
        if (previousFocus && previousFocus.isConnected) {
          previousFocus.focus();
        }
      },
      reducedMotion ? 0 : 200,
    );
  };

  function handleKeys(e) {
    if (e.key === "Escape" && !profileSaveBusy) {
      e.preventDefault();
      closePopup();
      return;
    }

    if (e.key === "Tab") {
      const focusable = Array.from(
        modal.querySelectorAll("button:not(:disabled)"),
      );

      if (!focusable.length) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  document.addEventListener("keydown", handleKeys);

  cancelBtn.addEventListener("click", closePopup);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePopup();
  });

  async function performSave() {
    if (profileSaveBusy || completed || closed) return;

    profileSaveBusy = true;
    modal.className = "save-morph-modal morph-loading";

    icon.innerHTML = '<span class="save-morph-spinner"></span>';
    title.textContent = "Saving Changes...";
    message.textContent = "Updating your profile information.";
    popupError.hidden = true;
    actions.hidden = true;

    try {
      // Actual SNSU Connects API request.
     const updatedUser = await API.put("/users/me", data);

S.user = updatedUser;
S.profileEditing = false;
completed = true;

      // API SUCCESS ONLY
      modal.className = "save-morph-modal morph-success";

      icon.innerHTML = `
        <svg viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      `;

      title.textContent = "Changes Saved!";
      message.textContent = "Your profile has been updated successfully.";

      await new Promise((resolve) =>
        setTimeout(resolve, reducedMotion ? 0 : 1100),
      );

      document.removeEventListener("keydown", handleKeys);
      overlay.remove();
      render();
    } catch (e) {
      // API ERROR: never show success.
      modal.className = "save-morph-modal morph-error";

      icon.innerHTML = `
        <svg viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 7v6M12 17h.01"></path>
        </svg>
      `;

      title.textContent = "Unable to Save";
      message.textContent = "Your changes could not be saved.";

      const errorMessage = e.message || "Unable to save profile.";

      popupError.textContent = errorMessage;
      popupError.hidden = false;

      if (errorBox && errorBox.isConnected) {
        errorBox.textContent = errorMessage;
      }

      actions.hidden = false;
      confirmBtn.textContent = "Try Again";
      cancelBtn.textContent = "Close";
      confirmBtn.focus();
    } finally {
      profileSaveBusy = false;
    }
  }

  confirmBtn.addEventListener("click", performSave);
  cancelBtn.focus();
}

function bar(rt) {
  return `<div style="height:10px;border-radius:9px;background:var(--chip)">
    <div style="height:100%;width:${rt}%;background:var(--g2);border-radius:9px"></div>
  </div>`;
}

function evSelect(fn) {
  return `<select aria-label="Choose event"
    onchange="S.pick=+this.value;${fn}">
    ${S.events
      .map(
        (x) =>
          `<option value="${x.id}" ${x.id == S.pick ? "selected" : ""}>
        ${esc(x.title)} (${st(x)})
      </option>`,
      )
      .join("")}
  </select>`;
}

/* ---------- views ---------- */

const V = {
  /* Student dashboard */
  home() {
    const up = S.events.filter((e) => st(e) != "Completed");
    const act = S.events.find((e) => st(e) == "Active");
    const u = S.user;
    const m = S.mine.filter((a) => a.status === "Present").length;

    return `<div class="hero">
      <div class="logo">${CAP}</div>
      <small>Hello,</small>
      <h2>Welcome back!</h2>

      <p><i data-lucide="user-round"></i> ${esc(u.name)}</p>
      <p><i data-lucide="id-card"></i> ${esc(u.student_id)}</p>
      <p><i data-lucide="graduation-cap"></i> ${esc(u.course || "No course set")}</p>
      <p><i data-lucide="chart-no-axes-combined"></i> Year Level: ${esc(u.year_level || "-")}</p>
    </div>

    <div class="tiles">
      <div class="tile">
        <span>UPCOMING</span>
        <b>${up.length}</b>
        <span>Events</span>
      </div>
      <div class="tile">
        <span>ATTENDED</span>
        <b>${m}</b>
        <span>Events</span>
      </div>
      <div class="tile">
        <span>STATUS</span>
        <b style="font-size:22px;padding:5px 0">Active</b>
        <span>Student</span>
      </div>
    </div>

    ${
      act
        ? `<div class="card">
      <h3>Happening now</h3>
      <div class="ev">
        <div class="i">
          <b>${esc(act.title)}</b>
          <small>${esc(act.venue)} · until ${ft(act.end_at)}</small>
        </div>
      </div>
      <button class="btn y" onclick="go('scan')">Scan event QR</button>
    </div>`
        : ""
    }

    <div class="card">
      <h3>Upcoming events</h3>
      ${up.map(evRow).join("") || "<small>No upcoming events.</small>"}
      <button class="btn" style="margin-top:10px"
        onclick="go('events')">View all events</button>
    </div>`;
  },

  /* Events */
  events() {
    const l = S.events.filter(
      (e) =>
        (S.flt == "All" || st(e) == S.flt) &&
        e.title.toLowerCase().includes(S.q.toLowerCase()),
    );

    return `<h1>Events</h1>

    <input class="srch" id="q"
      placeholder="Search events..."
      aria-label="Search events"
      value="${esc(S.q)}"
      oninput="S.q=this.value;keep()">

    <div class="chips">
      ${["All", "Upcoming", "Active", "Completed"]
        .map(
          (c) =>
            `<button class="chip ${S.flt == c ? "on" : ""}"
          onclick="S.flt='${c}';render()">${c}</button>`,
        )
        .join("")}
    </div>

    <div class="card">
      ${
        l.map(evRow).join("") ||
        '<p style="text-align:center;color:var(--mu)">No events found. Try another filter.</p>'
      }
    </div>`;
  },

  /* Scan QR */

  /* MODERN QR ATTENDANCE SCANNER */
  scan() {
    return `
    <div class="scan-modern">

      <!-- PAGE HEADER -->
      <div class="scan-page-header">
        <div class="scan-heading">
          <span class="scan-eyebrow">
            <i data-lucide="shield-check"></i>
            ATTENDANCE VERIFICATION
          </span>

          <h1>Scan Event QR</h1>
          <p>
            Scan your event's QR code or enter
            the verification code manually.
          </p>
        </div>

        <div class="scan-heading-icon">
          <i data-lucide="scan-qr-code"></i>
        </div>
      </div>

      <!-- TWO COLUMN SCANNER LAYOUT -->
      <div class="scan-layout">

        <!-- LEFT: CAMERA SCANNER -->
        <section class="scan-panel scan-camera-panel">

          <div class="scan-panel-title">
            <div class="scan-panel-icon">
              <i data-lucide="camera"></i>
            </div>
            <div>
              <h2>Camera Scanner</h2>
              <p>Scan your event's QR code</p>
            </div>
          </div>

          <!-- LIVE CAMERA -->
          <div class="scan-preview">

            <video
              id="vid"
              autoplay
              playsinline
              muted
              hidden>
            </video>

            <div class="scan-frame">
              <span class="scan-corner tl"></span>
              <span class="scan-corner tr"></span>
              <span class="scan-corner bl"></span>
              <span class="scan-corner br"></span>

              <div class="scan-laser"></div>

              <div class="scan-placeholder">
                <i data-lucide="scan-qr-code"></i>
              </div>
            </div>

            <p id="vst" class="scan-status"
              role="status" aria-live="polite">
              Point your camera at the event QR code
            </p>

          </div>

          <!-- CAMERA BUTTON -->
          <button
            class="btn scan-camera-btn"
            type="button"
            onclick="startCam()">

            <span class="scan-camera-content">
              <i data-lucide="camera"></i>
              <span>Start Camera</span>
            </span>

          </button>

          <p class="scan-camera-note">
            <i data-lucide="info"></i>
            Allow camera access when prompted.
          </p>

        </section>

        <!-- RIGHT: MANUAL VERIFICATION -->
        <section class="scan-panel scan-manual-panel">

          <div class="scan-panel-title">
            <div class="scan-panel-icon">
              <i data-lucide="keyboard"></i>
            </div>
            <div>
              <h2>Manual Verification</h2>
              <p>Alternative attendance check-in</p>
            </div>
          </div>

          <div class="scan-manual-content">

            <div class="scan-manual-description">
              <i data-lucide="qr-code"></i>
              <p>
                Can't scan the QR code? Enter the
                event's verification code below.
              </p>
            </div>

            <label class="scan-field-label" for="code">
              Event Verification Code
            </label>

            <div class="scan-input-wrap">
              <i data-lucide="hash"></i>

              <input
                type="text"
                id="code"
                placeholder="Enter event code"
                aria-label="Event code"
                autocomplete="off">
            </div>

            <button
              class="btn scan-verify-btn"
              type="button"
              onclick="verify($('code').value)">

              <i data-lucide="shield-check"></i>
              <span>Verify Code</span>

            </button>

          </div>

          <!-- LOCATION SECURITY -->
          <div class="scan-security">
            <div class="scan-security-icon">
              <i data-lucide="map-pin"></i>
            </div>

            <div>
              <strong>Location Verification</strong>
              <p>
                Your location is checked against
                the event venue during check-in.
                Camera and location permissions
                require HTTPS or localhost.
              </p>
            </div>
          </div>

        </section>

      </div>

    </div>
  `;
  },
  /* Attendance verification result */
  result() {
    const r = S.res;
    const ok = r.status == "Present";
    const s = r.steps;

    return `<h1>Attendance verification</h1>

    <div class="steps">
      ${["QR", "Event", "Time", "Location", "Result"]
        .map(
          (n, i) =>
            `<div class="${s[i] == "ok" ? "ok" : s[i] == "no" ? "no" : ""}">
          <b>${s[i] == "ok" ? "✓" : s[i] == "no" ? "✕" : i + 1}</b>
          ${n}
        </div>`,
        )
        .join("")}
    </div>

    <div class="card">
      <div class="big">${ok ? "✅" : "⚠️"}</div>
      <h3 style="text-align:center">
        ${ok ? "Attendance recorded" : "Attendance not recorded"}
      </h3>
      <p style="text-align:center;color:var(--mu)">
        ${ok ? "You are marked present." : esc(r.reason)}
      </p>

      ${r.event ? R("Event", esc(r.event.title)) : ""}
      ${R("Time", fd(r.ts))}
      ${
        r.distance != null
          ? R(
              "Distance from venue",
              r.distance +
                " m" +
                (r.event ? " (limit " + r.event.radius_m + " m)" : ""),
            )
          : ""
      }
      ${R("Status", `<span class="bd ${r.status}">${r.status}</span>`)}
    </div>

    <button class="btn" onclick="go('attend')">
      View my attendance
    </button>`;
  },

  /* My attendance */
  attend() {
    const l = S.mine.filter((a) => S.flt == "All" || a.status == S.flt);

    return `<h1>My attendance</h1>

    <div class="chips">
      ${["All", "Present", "Failed"]
        .map(
          (c) =>
            `<button class="chip ${S.flt == c ? "on" : ""}"
          onclick="S.flt='${c}';render()">${c}</button>`,
        )
        .join("")}
    </div>

    <div class="card">
      ${
        l
          .map(
            (a) =>
              `<div class="ev">
          <div class="i">
            <b>${esc(a.title)}</b>
            <small>
              ${fd(a.created_at)}
              ${a.distance_m != null ? " · " + a.distance_m + " m" : ""}
              ${a.reason ? "<br>" + esc(a.reason) : ""}
            </small>
          </div>
          <span class="bd ${a.status}">${a.status}</span>
        </div>`,
          )
          .join("") ||
        '<p style="text-align:center;color:var(--mu)">No records yet. Scan an event QR to get started.</p>'
      }
    </div>`;
  },

  profile() {
  const u = S.user;
  const p = photo();
  const editing = !!S.profileEditing;

  const attended = S.mine.filter(
    (a) => a.status === "Present"
  ).length;

  const info = (label, value) => `
    <div class="ref-info">
      <span>${label}</span>
      <strong>${esc(value || "-")}</strong>
    </div>
  `;

  return `
    <div class="ref-profile modern-profile">

      <!-- PROFILE HEADER -->
      <section class="ref-header">

        <div class="ref-avatar">
          ${
            p
              ? `<img src="${esc(p)}" alt="Profile photo">`
              : `<span>${esc((u.name || "S")[0].toUpperCase())}</span>`
          }

          <button class="ref-camera"
            type="button"
            onclick="$('pf').click()"
            aria-label="Upload profile photo">

            <i data-lucide="camera"></i>
          </button>

          <input id="pf"
            type="file"
            accept="image/*"
            hidden
            onchange="upPhoto(this.files[0])">
        </div>

        <div class="ref-identity">

          <div class="ref-name-line">
            <h1>${esc(u.name || "Student")}</h1>

            <span class="ref-active">
              <i></i> Active
            </span>
          </div>

          <p>
            <i data-lucide="graduation-cap"></i>
            Student
          </p>

        </div>

        <button class="ref-edit-button"
  type="button"
  onclick="${editing ? "cancelProfileEdit()" : "startProfileEdit()"}">

  <i data-lucide="${editing ? "x" : "pencil"}"></i>
  ${editing ? "Cancel" : "Edit Profile"}

</button>

        <div id="perr" class="err" role="alert"></div>

      </section>

      <!-- ACCOUNT INFORMATION -->
      <section class="ref-information">

        <div class="ref-section-title">
          <i data-lucide="contact-round"></i>
          <h2>Account Information</h2>
        </div>

        ${
          editing
            ? `
              <div class="ref-edit-grid">

                <label>
                  Full Name
                  <input id="pn"
                    class="mp-input"
                    type="text"
                    value="${esc(u.name || "")}">
                </label>

                <label>
                  Contact Number
                  <input id="pc"
                    class="mp-input"
                    type="tel"
                    value="${esc(u.contact || "")}">
                </label>

                <label>
                  Course / Program
                  <input id="pco"
                    class="mp-input"
                    type="text"
                    value="${esc(u.course || "")}">
                </label>

                <label>
                  Year Level
                  <input id="py"
                    class="mp-input"
                    type="number"
                    min="1"
                    max="6"
                    value="${esc(u.year_level || "")}">
                </label>

                <div class="ref-edit-actions">

                  <div id="err"
                    class="err"
                    role="alert"></div>

                  <button class="ref-save-button"
                    type="button"
                    onclick="saveMe()">

                    <i data-lucide="save"></i>
                    Save Changes

                  </button>

                </div>

              </div>
            `
            : `
              <div class="ref-info-grid">

                ${info("Full Name", u.name)}
                ${info("Student ID", u.student_id)}
                ${info("Email Address", u.email)}
                ${info("Contact Number", u.contact)}
                ${info("Course / Program", u.course)}
                ${info("Year Level", u.year_level)}
                ${info("Academic Term", SEM)}
                ${info("Events Attended", attended)}

              </div>
            `
        }

      </section>

    </div>
  `;
},
  /* ==========================================
   MODERN ADMIN DASHBOARD - SNSU CONNECTS
   ========================================== */

  adash() {
    const act = S.events.find((e) => st(e) === "Active");
    const up = S.events.filter((e) => st(e) === "Upcoming");
    const u = S.user;
    const reg = S.events[0] ? S.events[0].registered : 0;

    return `
    <div class="modern-admin-dashboard">

      <!-- WELCOME SECTION -->
      <section class="hero mad-welcome">

        <div class="mad-welcome-info">

          <span class="mad-eyebrow">
            ADMIN DASHBOARD
          </span>

          <h1>Welcome back!</h1>

          <div class="mad-admin-info">

            <p>
              <i data-lucide="user-round"></i>
              <span>${esc(u.name)}</span>
            </p>

            <p>
              <i data-lucide="mail"></i>
              <span>${esc(u.email)}</span>
            </p>

            <p>
              <i data-lucide="graduation-cap"></i>
              <span>Event Organizer</span>
            </p>

          </div>
        </div>

        <div class="mad-welcome-logo">
          ${CAP}
        </div>

      </section>

      <!-- STATISTICS SECTION -->
      <section class="tiles mad-stats">

        <div class="tile mad-stat-card">

          <div class="mad-stat-heading">
            <span>EVENTS</span>
            <i data-lucide="calendar-days"></i>
          </div>

          <b>${S.events.length}</b>
          <span>Total</span>

        </div>

        <div class="tile mad-stat-card">

          <div class="mad-stat-heading">
            <span>ACTIVE</span>
            <i data-lucide="radio"></i>
          </div>

          <b>
            ${S.events.filter((e) => st(e) === "Active").length}
          </b>

          <span>Now</span>

        </div>

        <div class="tile mad-stat-card">

          <div class="mad-stat-heading">
            <span>STUDENTS</span>
            <i data-lucide="users-round"></i>
          </div>

          <b>${reg}</b>
          <span>Registered</span>

        </div>

      </section>

      <!-- DASHBOARD MAIN CONTENT -->
      <div class="mad-content">

        <!-- QUICK ACTIONS -->
        <section class="card mad-panel">

          <div class="mad-panel-header">

            <div class="mad-panel-title">
              <i data-lucide="zap"></i>
              <h3>Quick Actions</h3>
            </div>

          </div>

          <div class="mad-actions">

            <button
              class="btn mad-action-btn"
              type="button"
              onclick="S.sf=true;go('aevents').then(()=>{
                S.sf=true;
                render();
              })">

              <i data-lucide="plus-circle"></i>
              <span>Create Event</span>
              <i data-lucide="chevron-right"></i>

            </button>

            <button
              class="btn mad-action-btn"
              type="button"
              onclick="go('reports')">

              <i data-lucide="chart-no-axes-column"></i>
              <span>View Reports</span>
              <i data-lucide="chevron-right"></i>

            </button>

          </div>

        </section>

        <!-- UPCOMING EVENTS -->
        <section class="card mad-panel">

          <div class="mad-panel-header">

            <div class="mad-panel-title">
              <i data-lucide="calendar-days"></i>
              <h3>Upcoming Events</h3>
            </div>

          </div>

          <div class="mad-upcoming-list">

            ${
              up.length
                ? up.map(evRow).join("")
                : `
                  <div class="mad-empty-events">

                    <i data-lucide="calendar-x"></i>

                    <p>No upcoming events.</p>

                  </div>
                `
            }

          </div>

        </section>

      </div>

      <!-- LIVE EVENT SECTION -->
      ${
        act
          ? `
            <section class="card mad-live">

              <div class="mad-panel-header">
                <div class="mad-panel-title">

                  <i data-lucide="radio"></i>
                  <h3>Happening now</h3>

                </div>
              </div>

              <div class="mad-live-content">

                <div class="mad-live-info">
                  <strong>${esc(act.title)}</strong>
                  <small>${esc(act.venue)}</small>
                </div>

                <button
                  class="btn y mad-live-btn"
                  type="button"
                  onclick="go('live',${act.id})">

                  Open live attendance

                </button>

              </div>

            </section>
          `
          : ""
      }

    </div>
  `;
  },

  /* Manage events */

  aevents() {
    const q = S.qr;

    return `
<section class="me-page">

  <!-- MODERN HEADER -->
  <div class="me-header">

    <div class="me-heading">
      <span class="me-heading-icon">
        <i data-lucide="calendar-days"></i>
      </span>

      <div class="me-heading-copy">
        <h1>Manage Events</h1>
        <p>Create, monitor, and manage event attendance.</p>
      </div>
    </div>

    <button
      type="button"
      class="btn me-create-btn"
      onclick="S.sf=true;render()">

      <i data-lucide="plus"></i>
      <span>New Event</span>

    </button>

  </div>

  <!-- COMPACT QR MODAL -->
  ${
    q
      ? `
    <div class="me-qr-overlay"
      onclick="if(event.target===this){S.qr=null;render()}">

      <section class="me-qr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="me-qr-title"
        onclick="event.stopPropagation()">

        <div class="me-qr-head">

          <span class="me-qr-head-icon">
            <i data-lucide="qr-code"></i>
          </span>

          <div class="me-qr-title-wrap">
            <h2 id="me-qr-title">Event QR Code</h2>
            <p>${esc(q.title)}</p>
          </div>

          <button
            type="button"
            class="me-qr-x"
            aria-label="Close QR code"
            onclick="S.qr=null;render()">

            <i data-lucide="x"></i>
          </button>

        </div>

        <div class="me-qr-preview">

          <div class="me-qr-paper">
            <div class="qr" id="qrbox"></div>
          </div>

          <div class="me-qr-code">

            <span>Event code</span>
            <code>${esc(q.code)}</code>

            <button
              type="button"
              class="me-qr-copy"
              id="meCopyQr"
              title="Copy event code"
              aria-label="Copy event code"
              onclick="copyEventQrCode()">

              <i data-lucide="copy"></i>
            </button>

          </div>

        </div>

        <div class="me-qr-footer">

          <button
            type="button"
            class="me-qr-close"
            onclick="S.qr=null;render()">
            Close
          </button>

        </div>

      </section>
    </div>
  `
      : ""
  }

    ${
      S.sf
        ? `
      <!-- MODERN COMPACT CREATE EVENT MODAL -->
      <div class="event-modal-overlay ce-overlay"
        onclick="if(event.target===this){S.sf=false;render()}">

        <section class="ce-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="newEventTitle"
          onclick="event.stopPropagation()">

          <!-- HEADER -->
          <div class="ce-header">
            <div class="ce-heading">
              <span class="ce-heading-icon" aria-hidden="true">
                <i data-lucide="calendar-plus-2"></i>
              </span>

              <div>
                <span class="ce-eyebrow">EVENT MANAGEMENT</span>
                <h2 id="newEventTitle">Create New Event</h2>
              </div>
            </div>

            <button type="button"
              class="ce-close"
              aria-label="Close create event dialog"
              onclick="S.sf=false;render()">
              <i data-lucide="x"></i>
            </button>
          </div>

          <!-- FORM BODY -->
          <div class="ce-body">

            <div class="ce-grid">

              <!-- EVENT TITLE -->
<div class="ce-field">
  <label for="nt">
    Event title <span class="ce-required">*</span>
  </label>

  <div class="ce-input-wrap">
    <i data-lucide="pencil"></i>
    <input class="srch ce-input"
      id="nt"
      type="text"
      placeholder="Enter Event Name"
      autocomplete="off">
  </div>
</div>

<!-- VENUE -->
<div class="ce-field">
  <label for="nv">
    Venue <span class="ce-required">*</span>
  </label>

  <div class="ce-input-wrap">
    <i data-lucide="map-pin"></i>
    <input class="srch ce-input"
      id="nv"
      type="text"
      placeholder="Enter Venue"
      autocomplete="off">
  </div>
</div>

<!-- START DATE AND TIME -->
<div class="ce-field">
  <label for="ns">
    Start Date and Time
    <span class="ce-required">*</span>
  </label>

  <button type="button"
    class="srch ce-input ce-date-button"
    onclick="openEventDatePicker('ns')">

    <span class="ce-date-value" id="scheduleDisplay">
      Select Date and Time
    </span>

    <i data-lucide="calendar-clock"></i>
  </button>

  <input type="hidden" id="ns">
</div>

<!-- REGISTRATION DEADLINE -->
<div class="ce-field">
  <label for="nrd">
    Registration Deadline
    <span class="ce-optional">(optional)</span>
  </label>

  <button type="button"
    class="srch ce-input ce-date-button"
    onclick="openEventDatePicker('nrd')">

    <span class="ce-date-value" id="deadlineDisplay">
      Select Deadline
    </span>

    <i data-lucide="calendar-days"></i>
  </button>

  <input type="hidden" id="nrd">
</div>

              

<!-- DURATION -->
<div class="ce-field">
  <label for="nd">Duration in hours</label>

  <div class="ce-input-wrap ce-unit-wrap">
    <i data-lucide="clock-3"></i>

    <input
      id="nd"
      class="srch ce-input ce-number-direct"
      type="number"
      inputmode="numeric"
      min="1"
      step="1"
      placeholder="Enter Duration"
      oninput="updateEventUnit('nd')"
      aria-label="Duration in hours">

    <span id="ndUnit" class="ce-unit-text" hidden></span>
  </div>
</div>

<!-- CAPACITY -->
<div class="ce-field">
  <label for="nc">Capacity</label>

  <div class="ce-input-wrap ce-unit-wrap">
    <i data-lucide="users-round"></i>

    <input
      id="nc"
      class="srch ce-input ce-number-direct"
      type="number"
      inputmode="numeric"
      min="1"
      step="1"
      placeholder="Enter Capacity"
      oninput="updateEventUnit('nc')"
      aria-label="Capacity in students">

    <span id="ncUnit" class="ce-unit-text" hidden></span>
  </div>
</div>

</div><!-- END OF MAIN TWO-COLUMN GRID -->

            
<!-- VENUE LOCATION -->
<section class="ce-location-section"
  aria-labelledby="ceLocationTitle">

  <div class="ce-section-heading">
    <span class="ce-section-icon" aria-hidden="true">
      <i data-lucide="map-pinned"></i>
    </span>

    <div>
      <h3 id="ceLocationTitle">Venue Location</h3>
      <p>Used for GPS attendance verification.</p>
    </div>
  </div>

  <div class="ce-grid ce-location-grid">

    <!-- LATITUDE -->
    <div class="ce-field">
      <label for="nla">
        Latitude
        <span class="ce-optional">(optional)</span>
      </label>

      <div class="ce-input-wrap">
        <i data-lucide="crosshair"></i>

        <input
          class="srch ce-input"
          id="nla"
          type="number"
          step="any"
          min="-90"
          max="90"
          placeholder="Enter latitude">
      </div>
    </div>

    <!-- LONGITUDE -->
    <div class="ce-field">
      <label for="nlo">
        Longitude
        <span class="ce-optional">(optional)</span>
      </label>

      <div class="ce-input-wrap">
        <i data-lucide="crosshair"></i>

        <input
          class="srch ce-input"
          id="nlo"
          type="number"
          step="any"
          min="-180"
          max="180"
          placeholder="Enter longitude">
      </div>
    </div>

    <!-- ALLOWED DISTANCE -->
    <div class="ce-field">
      <label for="nr">
        Allowed distance (m)
      </label>

      <div class="ce-input-wrap">
        <i data-lucide="ruler"></i>

        <input
          class="srch ce-input"
          id="nr"
          type="number"
          min="10"
          step="1"
          placeholder="50 (default)">
      </div>
    </div>

    <!-- USE CURRENT LOCATION -->
    <div class="ce-location-action">
      <button
        type="button"
        class="ce-location-button"
        onclick="useLoc()">

        <i data-lucide="locate-fixed"></i>
        <span>Use my current location</span>

      </button>
    </div>

  </div>
</section>
            <div id="err"
              class="err ce-error"
              role="alert"
              aria-live="polite"></div>

          </div>

          <!-- FOOTER ACTIONS -->
          <div class="ce-footer">

            <button type="button"
              class="ce-button ce-cancel"
              onclick="S.sf=false;render()">
              Cancel
            </button>

            <button type="button"
              class="ce-button ce-save"
              onclick="addEv()">

              <i data-lucide="check"></i>
              <span>Save Event</span>
            </button>

          </div>

        </section>
      </div>
    `
        : ""
    }


    
    <div class="card">
      ${
        S.events
          .map(
            (e) => `
        <div class="ev">
          <div class="i">
            <b>${esc(e.title)}</b>
            <small>
              ${esc(e.venue)}<br>
              ${fd(e.start_at)} ·
              ${e.attended}/${e.capacity} attended
              ${e.lat != null ? " · GPS on" : ""}
            </small>
          </div>

          <span class="bd ${st(e)}">${st(e)}</span>

                  <button class="event-icon-btn event-qr-btn"
            type="button"
            title="Show QR Code"
            aria-label="Show QR Code"
            onclick="showQr(${e.id})">
            <i data-lucide="qr-code"></i>
          </button>

          <button class="event-icon-btn event-delete-btn"
            type="button"
            title="Delete Event"
            aria-label="Delete Event"
            onclick="delEv(${e.id})">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `,
          )
          .join("") || "<small>No events yet.</small>"
      }
    </div>
  `;
  },

  /* Live attendance */
  live() {
    const r = S.rep;

    if (!r) {
      return '<h1>Live attendance</h1><div class="card"><small>No events yet.</small></div>';
    }

    return `<h1>Live attendance</h1>
    ${evSelect("go(S.tab)")}

    <div class="card">
      <div class="g2">
        <div><b>${r.registered}</b><span>Registered</span></div>
        <div><b>${r.attended}</b><span>Attended</span></div>
        <div><b>${Math.max(0, r.registered - r.attended)}</b><span>Remaining</span></div>
        <div><b>${r.rate}%</b><span>Attendance rate</span></div>
      </div>
      ${bar(r.rate)}
    </div>

    <div class="card">
      <h3>Recent attendees</h3>
      ${
        r.attendees
          .slice(0, 15)
          .map(
            (a) =>
              `<div class="row">
          <b style="text-align:left">
            ${esc(a.name)}<br>
            <small style="color:var(--mu);font-weight:400">
              ${esc(a.student_id)}
            </small>
          </b>
          <span>${ft(a.created_at)}</span>
        </div>`,
          )
          .join("") || '<p style="color:var(--mu)">No check-ins yet.</p>'
      }
    </div>`;
  },

  /* Reports */
  reports() {
    const r = S.rep;

    if (!r) {
      return '<h1>Reports</h1><div class="card"><small>No events yet.</small></div>';
    }

    return `<h1>Reports</h1>
    ${evSelect("go(S.tab)")}

    <div class="card">
      <div class="g2">
        <div><b>${r.registered}</b><span>Registered</span></div>
        <div><b>${r.attended}</b><span>Attended</span></div>
      </div>
      ${bar(r.rate)}
      <p style="text-align:center;color:var(--mu);margin:8px 0 0">
        ${r.rate}% attendance rate
      </p>
    </div>

    <div class="card">
      <h3>Verification results</h3>
      ${R("Successful", r.attended)}
      ${R("Location failures", r.failedLocation)}
      ${R("Expired or early scans", r.failedExpired)}
      ${R("Capacity", r.event.capacity)}
      <button class="btn" style="margin-top:12px"
        onclick="exportCsv()">Export CSV</button>
    </div>`;
  },

aprofile() {
  const u = S.user;
  const p = photo();
  const editing = !!S.profileEditing;

  const info = (label, value) => `
    <div class="ref-info">
      <span>${label}</span>
      <strong>${esc(value || "-")}</strong>
    </div>
  `;

  return `
    <div class="ref-profile modern-profile">

      <!-- PROFILE HEADER -->
      <section class="ref-header">

        <div class="ref-avatar">
          ${
            p
              ? `<img src="${esc(p)}" alt="Profile photo">`
              : `<span>${esc((u.name || "A")[0].toUpperCase())}</span>`
          }

          <button class="ref-camera"
            type="button"
            onclick="$('pf').click()"
            aria-label="Upload profile photo">

            <i data-lucide="camera"></i>
          </button>

          <input id="pf"
            type="file"
            accept="image/*"
            hidden
            onchange="upPhoto(this.files[0])">
        </div>

        <div class="ref-identity">

          <div class="ref-name-line">
            <h1>${esc(u.name || "Administrator")}</h1>

            <span class="ref-active">
              <i></i> Active
            </span>
          </div>

          <p>
            <i data-lucide="shield-check"></i>
            Administrator
          </p>

        </div>

       <button class="ref-edit-button"
  type="button"
  onclick="${editing ? "cancelProfileEdit()" : "startProfileEdit()"}">

  <i data-lucide="${editing ? "x" : "pencil"}"></i>
  ${editing ? "Cancel" : "Edit Profile"}

</button>

        <div id="perr" class="err" role="alert"></div>

      </section>

      <!-- ACCOUNT INFORMATION -->
      <section class="ref-information">

        <div class="ref-section-title">
          <i data-lucide="contact-round"></i>
          <h2>Account Information</h2>
        </div>

        ${
          editing
            ? `
              <div class="ref-edit-grid">

                <label>
                  Full Name
                  <input id="pn"
                    class="mp-input"
                    type="text"
                    value="${esc(u.name || "")}">
                </label>

                <label>
                  Contact Number
                  <input id="pc"
                    class="mp-input"
                    type="tel"
                    value="${esc(u.contact || "")}">
                </label>

                <div class="ref-edit-actions">

                  <div id="err"
                    class="err"
                    role="alert"></div>

                  <button class="ref-save-button"
                    type="button"
                    onclick="saveMe()">

                    <i data-lucide="save"></i>
                    Save Changes

                  </button>

                </div>

              </div>
            `
            : `
              <div class="ref-info-grid">

                ${info("Email Address", u.email)}
                ${info("Contact Number", u.contact)}
                ${info("Academic Term", SEM)}
                ${info("Events Managed", S.events.length)}

              </div>
            `
        }

      </section>

    </div>
  `;
},

  /* About */
  about() {
    return `<div class="card">
      <h1>SNSU Connects</h1>
      <p>Campus event and attendance tracker for Surigao del Norte State University.</p>
      <p style="color:var(--mu)">
        Scan. Track. Participate.<br>
        Integrity - Competence - Respect<br>
        v1.0
      </p>
    </div>`;
  },
};

/* ---------- actions ---------- */

function keep() {
  const p = $("q").selectionStart;
  render();
  const i = $("q");
  i.focus();
  i.setSelectionRange(p, p);
}

const pos = () =>
  new Promise((r) => {
    if (!navigator.geolocation) return r(null);

    navigator.geolocation.getCurrentPosition(
      (p) =>
        r({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
        }),
      () => r(null),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      },
    );
  });

async function verify(code) {
  code = String(code || "").trim();
  const v = $("vst");

  if (!code) {
    if (v) v.textContent = "Enter or scan an event code first.";
    return;
  }

  stopCam();

  if (v) v.textContent = "Checking your location...";

  const p = await pos();

  try {
    S.res = await API.post("/attendance/scan", {
      code,
      lat: p ? p.lat : null,
      lng: p ? p.lng : null,
    });

    await load();
    S.tab = "result";
  } catch (e) {
    if (v) v.textContent = e.message;
    return;
  }

  render();
}

async function startCam() {
  const v = $("vid");
  const s = $("vst");

  if (!navigator.mediaDevices || !window.jsQR) {
    s.textContent =
      "Camera scanning is not available here. Type the event code instead.";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });

    v.srcObject = stream;
    v.hidden = false;
    await v.play();
    s.textContent = "Scanning...";

    const c = document.createElement("canvas");
    const x = c.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (!stream) return;

      if (v.readyState >= 2 && v.videoWidth) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        x.drawImage(v, 0, 0);

        const d = x.getImageData(0, 0, c.width, c.height);
        const q = jsQR(d.data, d.width, d.height);

        if (q && q.data) {
          verify(q.data);
          return;
        }
      }

      raf = requestAnimationFrame(tick);
    };

    tick();
  } catch (e) {
    s.textContent =
      "Camera blocked or unavailable. Allow camera access or type the event code.";
  }
}

function stopCam() {
  cancelAnimationFrame(raf);

  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function useLoc() {
  pos().then((p) => {
    if (!p) {
      $("err").textContent =
        "Could not get your location. Allow location access.";
      return;
    }

    $("nla").value = p.lat.toFixed(6);
    $("nlo").value = p.lng.toFixed(6);
  });
}

/* ==========================================
   EVENT SCHEDULE PICKER
   ========================================== */

function openScheduleModal() {
  const existing = document.getElementById("scheduleModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "scheduleModal";
  modal.className = "schedule-overlay";

  const currentValue = $("ns")?.value || "";

  modal.innerHTML = `
    <div class="schedule-modal" role="dialog"
      aria-modal="true" aria-labelledby="scheduleTitle">

      <div class="schedule-modal-header">
        <div>
          <span>EVENT SCHEDULE</span>
          <h2 id="scheduleTitle">Set Event Start</h2>
          <p>Choose when your event will begin.</p>
        </div>

        <button type="button" class="schedule-close"
          aria-label="Close" id="closeSchedule">
          <i data-lucide="x"></i>
        </button>
      </div>

      <label for="scheduleInput">Start date and time</label>

      <input id="scheduleInput" type="datetime-local"
        value="${esc(currentValue)}">

      <div class="schedule-actions">
        <button type="button" id="cancelSchedule">
          Cancel
        </button>

        <button type="button" id="confirmSchedule">
          <i data-lucide="check"></i>
          Confirm Schedule
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  if (window.lucide) lucide.createIcons();

  const close = () => modal.remove();

  $("closeSchedule").onclick = close;
  $("cancelSchedule").onclick = close;

  modal.onclick = (e) => {
    if (e.target === modal) close();
  };

  $("confirmSchedule").onclick = () => {
    const value = $("scheduleInput").value;

    if (!value) {
      $("scheduleInput").focus();
      return;
    }

    $("ns").value = value;

    $("scheduleDisplay").textContent = new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    close();
  };
}

/* SNSU CONNECTS - COMPACT DATE AND TIME PICKER */

function openEventDatePicker(fieldId) {
  if (!["ns", "nrd"].includes(fieldId)) return;
  if (document.querySelector(".scdp-overlay")) return;

  const field = document.getElementById(fieldId);
  const display = document.getElementById(
    fieldId === "ns" ? "scheduleDisplay" : "deadlineDisplay",
  );

  if (!field || !display) return;

  const isDeadline = fieldId === "nrd";
  const startInput = document.getElementById("ns");

  const initialValue = field.value || (isDeadline ? startInput?.value : "");

  const parsed = initialValue ? new Date(initialValue) : new Date();

  const initial = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  let selected = new Date(
    initial.getFullYear(),
    initial.getMonth(),
    initial.getDate(),
  );

  let viewYear = selected.getFullYear();
  let viewMonth = selected.getMonth();
  let hour24 = initial.getHours();
  let minute = initial.getMinutes();

  const pad = (n) => String(n).padStart(2, "0");

  const dateTime = () =>
    new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
      hour24,
      minute,
    );

  const formatDisplay = (d) =>
    d.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const prevFocus = document.activeElement;
  const prevOverflow = document.body.style.overflow;

  const overlay = document.createElement("div");
  overlay.className = "scdp-overlay";

  overlay.innerHTML = `
    <div class="scdp-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scdpTitle">

      <!-- HEADER -->
      <div class="scdp-header">

        <div class="scdp-title-icon">
          <i data-lucide="calendar-days"></i>
        </div>

        <h2 id="scdpTitle">
          ${isDeadline ? "Registration Deadline" : "Select Date and Time"}
        </h2>

        <button type="button"
          class="scdp-icon scdp-close"
          aria-label="Close">

          <i data-lucide="x"></i>
        </button>

      </div>

      <!-- CALENDAR AND TIME -->
      <div class="scdp-content">

        <!-- LEFT: CALENDAR -->
        <div class="scdp-calendar">

          <div class="scdp-month">

            <button type="button"
              class="scdp-icon scdp-prev"
              aria-label="Previous month">
              <i data-lucide="chevron-left"></i>
            </button>

            <strong class="scdp-month-name"></strong>

            <button type="button"
              class="scdp-icon scdp-next"
              aria-label="Next month">
              <i data-lucide="chevron-right"></i>
            </button>

          </div>

          <div class="scdp-weekdays">
            <span>Su</span>
            <span>Mo</span>
            <span>Tu</span>
            <span>We</span>
            <span>Th</span>
            <span>Fr</span>
            <span>Sa</span>
          </div>

          <div class="scdp-days"></div>

        </div>

        <!-- RIGHT: TIME -->
        <div class="scdp-time">

          <div class="scdp-time-label">
            <i data-lucide="clock-3"></i>
            Time
          </div>

          <div class="scdp-time-selects">

            <label>
              Hour
              <select class="scdp-hour"
                aria-label="Hour"></select>
            </label>

            <span class="scdp-colon">:</span>

            <label>
              Minute
              <select class="scdp-minute"
                aria-label="Minute"></select>
            </label>

          </div>

          <div class="scdp-period"
            role="group"
            aria-label="AM or PM">

            <button type="button"
              data-period="AM">AM</button>

            <button type="button"
              data-period="PM">PM</button>

          </div>

        </div>
      </div>

      <!-- ERROR -->
      <p class="scdp-error"
        role="alert"
        aria-live="polite"></p>

      <!-- FOOTER -->
      <div class="scdp-footer">

        <button type="button" class="scdp-clear">
          Clear
        </button>

        <div class="scdp-footer-right">

          <button type="button" class="scdp-cancel">
            Cancel
          </button>

          <button type="button" class="scdp-confirm">
            <i data-lucide="check-circle-2"></i>
            Confirm
          </button>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const el = (selector) => overlay.querySelector(selector);

  const hourInput = el(".scdp-hour");
  const minuteInput = el(".scdp-minute");
  const error = el(".scdp-error");

  for (let h = 1; h <= 12; h++) {
    hourInput.add(new Option(pad(h), h));
  }

  for (let m = 0; m <= 59; m++) {
    minuteInput.add(new Option(pad(m), m));
  }

  /* UPDATE TIME CONTROLS */
  function refreshTime() {
    hourInput.value = String(hour24 % 12 || 12);
    minuteInput.value = String(minute);

    overlay.querySelectorAll("[data-period]").forEach((button) => {
      const active = button.dataset.period === (hour24 < 12 ? "AM" : "PM");

      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", active);
    });

    error.textContent = "";
  }

  /* DRAW CALENDAR */
  function refreshCalendar() {
    el(".scdp-month-name").textContent = new Date(
      viewYear,
      viewMonth,
      1,
    ).toLocaleDateString("en-PH", {
      month: "long",
      year: "numeric",
    });

    const offset = new Date(viewYear, viewMonth, 1).getDay();

    const count = new Date(viewYear, viewMonth + 1, 0).getDate();

    const today = new Date();

    let html = "<span></span>".repeat(offset);

    for (let day = 1; day <= count; day++) {
      const picked =
        selected.getFullYear() === viewYear &&
        selected.getMonth() === viewMonth &&
        selected.getDate() === day;

      const isToday =
        today.getFullYear() === viewYear &&
        today.getMonth() === viewMonth &&
        today.getDate() === day;

      html += `
        <button type="button"
          data-day="${day}"
          aria-pressed="${picked}"
          class="scdp-day
            ${picked ? "selected" : ""}
            ${isToday ? "today" : ""}">

          ${day}

        </button>
      `;
    }

    el(".scdp-days").innerHTML = html;
    refreshTime();
  }

  /* CLOSE PICKER */
  function closePicker() {
    document.removeEventListener("keydown", handleKeys);
    overlay.remove();

    document.body.style.overflow = prevOverflow;

    if (prevFocus?.isConnected) {
      prevFocus.focus();
    }
  }

  function handleKeys(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
    } else if (e.key === "Tab") {
      const controls = [
        ...overlay.querySelectorAll(
          "button:not(:disabled),select:not(:disabled)",
        ),
      ];

      const first = controls[0];
      const last = controls[controls.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /* SELECT A DAY */
  el(".scdp-days").addEventListener("click", (e) => {
    const button = e.target.closest("[data-day]");
    if (!button) return;

    selected = new Date(viewYear, viewMonth, Number(button.dataset.day));

    refreshCalendar();
  });

  /* PREVIOUS AND NEXT MONTH */
  function stepMonth(n) {
    const d = new Date(viewYear, viewMonth + n, 1);

    viewYear = d.getFullYear();
    viewMonth = d.getMonth();

    refreshCalendar();
  }

  el(".scdp-prev").onclick = () => stepMonth(-1);
  el(".scdp-next").onclick = () => stepMonth(1);

  /* UPDATE HOUR AND MINUTE */
  function readTime() {
    hour24 = (Number(hourInput.value) % 12) + (hour24 >= 12 ? 12 : 0);

    minute = Number(minuteInput.value);

    refreshTime();
  }

  hourInput.onchange = readTime;
  minuteInput.onchange = readTime;

  /* AM AND PM */
  el(".scdp-period").onclick = (e) => {
    const button = e.target.closest("[data-period]");
    if (!button) return;

    hour24 = (hour24 % 12) + (button.dataset.period === "PM" ? 12 : 0);

    refreshTime();
  };

  /* CONFIRM DATE */
  el(".scdp-confirm").onclick = () => {
    const d = dateTime();
    const value = d.getTime();

    const start = document.getElementById("ns")?.value;

    const deadline = document.getElementById("nrd")?.value;

    if (isDeadline && start && value > new Date(start).getTime()) {
      error.textContent =
        "Deadline must be before or equal to the event start.";
      return;
    }

    if (!isDeadline && deadline && value < new Date(deadline).getTime()) {
      error.textContent = "Event start cannot be earlier than the deadline.";
      return;
    }

    field.value =
      `${d.getFullYear()}-` +
      `${pad(d.getMonth() + 1)}-` +
      `${pad(d.getDate())}T` +
      `${pad(d.getHours())}:` +
      `${pad(d.getMinutes())}`;

    display.textContent = formatDisplay(d);

    display.closest(".ce-date-button")?.classList.add("has-value");

    field.dispatchEvent(new Event("change", { bubbles: true }));

    closePicker();
  };

  /* CLEAR SELECTION */
  el(".scdp-clear").onclick = () => {
    field.value = "";

    display.textContent = isDeadline
      ? "Select deadline"
      : "Select date and time";

    display.closest(".ce-date-button")?.classList.remove("has-value");

    field.dispatchEvent(new Event("change", { bubbles: true }));

    closePicker();
  };

  el(".scdp-cancel").onclick = closePicker;
  el(".scdp-close").onclick = closePicker;

  overlay.onclick = (e) => {
    if (e.target === overlay) closePicker();
  };

  document.addEventListener("keydown", handleKeys);

  refreshCalendar();
  el(".scdp-close").focus();
}

function toggleEventCustomNumber(id) {
  const select = document.getElementById(id);
  const customInput = document.getElementById(id + "Custom");

  if (!select || !customInput) return;

  const isCustom = select.value === "custom";

  customInput.hidden = !isCustom;

  if (isCustom) {
    customInput.focus();
  }
}

/* AUTO DISPLAY HOURS AND STUDENTS */

function updateEventUnit(id) {
  const input = document.getElementById(id);
  const unit = document.getElementById(id + "Unit");

  if (!input || !unit) return;

  const value = input.value.trim();
  const number = Number(value);

  if (!value) {
    unit.textContent = "";
    unit.hidden = true;

    input.style.width = "100%";
    input.style.flex = "1 1 auto";
    return;
  }

  unit.hidden = false;

  if (id === "nd") {
    unit.textContent = number === 1 ? "hour" : "hours";
  }

  if (id === "nc") {
    unit.textContent = number === 1 ? "student" : "students";
  }

  // Keep the unit immediately beside the number
  input.style.flex = "0 0 auto";
  input.style.width = `${Math.max(2, value.length + 1)}ch`;
}

async function addEv() {
  const g = (i) => $(i)?.value?.trim() || "";
  const er = $("err");

  er.textContent = "";

  // Get entered date and time
  const s0 = new Date(g("ns")).getTime();

  // Validate required event information
  if (!g("nt") || !g("nv") || !Number.isFinite(s0)) {
    er.textContent = "Please enter an event name, venue, and start date.";
    return;
  }

  // Get entered duration and capacity
  const duration = Number(g("nd"));
  const capacity = Number(g("nc"));

  // Validate duration and capacity
  if (
    !g("nd") ||
    !g("nc") ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    !Number.isInteger(capacity) ||
    capacity < 1
  ) {
    er.textContent = "Please enter a valid duration and capacity.";
    return;
  }

  // Validate registration deadline
  const deadline = g("nrd") ? new Date(g("nrd")).getTime() : null;

  if (deadline !== null) {
    if (!Number.isFinite(deadline)) {
      er.textContent = "Please select a valid registration deadline.";
      return;
    }

    if (deadline > s0) {
      er.textContent = "Registration deadline cannot be after the event start.";
      return;
    }
  }

  try {
    await API.post("/events", {
      title: g("nt"),
      venue: g("nv"),
      start_at: s0,

      // Convert entered hours to milliseconds
      end_at: s0 + duration * 36e5,

      // Save entered student capacity
      capacity: capacity,

      reg_deadline: deadline,
      lat: g("nla"),
      lng: g("nlo"),
      radius_m: g("nr"),
    });

    S.sf = false;
    await load();
    render();
  } catch (e) {
    er.textContent = e.message || "Failed to save event.";
  }
}

async function delEv(id) {
  if (!confirm("Delete this event and its attendance records?")) return;

  try {
    await API.del("/events/" + id);
    await load();
    render();
  } catch (e) {
    say(e.message);
  }
}

async function showQr(id) {
  try {
    S.qr = await API.get("/events/" + id + "/qr");
    render();
    scrollTo(0, 0);
  } catch (e) {
    say(e.message);
  }
}

async function exportCsv() {
  try {
    const b = await API.blob("/attendance/event/" + S.pick + "/csv");

    const a = document.createElement("a");

    a.href = URL.createObjectURL(b);
    a.download = "attendance-" + S.pick + ".csv";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) {
    say(e.message);
  }
}

function signOut() {
  stopCam();
  API.setToken(null);
  S.user = null;
  S.dr = false;
  S.tab = "home";
  S.navTouched = false;
  document.body.classList.remove("sidebar-collapsed");
  render();
}

/* ---------- intro carousel ---------- */

function setP(n) {
  const next = Math.max(0, Math.min(2, n));

  if (next === S.ip) return;

  S.ip = next;

  // Re-render the selected slogan.
  render();
}

function nextP() {
  if (S.ip < 2) {
    setP(S.ip + 1);
  } else {
    S.intro = false;
    S.reg = false;
    render();
  }
}

function swS(e) {
  sx = e.clientX;

  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch (x) {}
}

function swE(e) {
  if (sx === null) return;

  const d = e.clientX - sx;
  sx = null;

  if (Math.abs(d) > 45) {
    setP(S.ip + (d < 0 ? 1 : -1));
  }
}

document.addEventListener("keydown", (e) => {
  if (!S.intro || S.user) return;
  if (e.key == "ArrowRight") setP(S.ip + 1);
  if (e.key == "ArrowLeft") setP(S.ip - 1);
});

/* ==========================================
   SNSU CONNECTS - FIXED INTRO CAROUSEL
   ========================================== */

function introHtml() {
  const pages = [
    {
      icon: "scan-qr-code",
      title: "Scan.",
      description:
        "Point your phone at the event QR code to check in. Your location is verified automatically.",
    },
    {
      icon: "chart-no-axes-combined",
      title: "Track.",
      description:
        "Follow your attendance records and see every event you joined, anytime.",
    },
    {
      icon: "users-round",
      title: "Participate.",
      description:
        "Join campus events, stay involved, and build a stronger SNSU together.",
    },
  ];

  const page = pages[S.ip];

  return `
    <div class="intro">

      <!-- SNSU HEADER -->
      <div class="intro-header">

        <div class="intro-logo">
          ${CAP}
        </div>

        <h1>SNSU Connects</h1>

        <div class="intro-subtitle">
          <span></span>
          Event and Attendance Tracker
          <span></span>
        </div>

      </div>

      <!-- MAIN ONBOARDING CARD -->
      <div
        class="intro-card"
        onpointerdown="swS(event)"
        onpointerup="swE(event)"
        onpointercancel="sx=null"
      >

        <div class="intro-decoration"></div>

        <div class="intro-content">

          <!-- LEFT CONTENT -->
          <div class="intro-text">

            <div class="intro-icon">
              <i data-lucide="${page.icon}"></i>
            </div>

            <h2>${page.title}</h2>

            <p>${page.description}</p>

            <div class="intro-underline"></div>

          </div>

          <!-- RIGHT PHONE ILLUSTRATION -->
          <div class="intro-visual">

            <div class="intro-orbit"></div>

            <div class="intro-phone">

              <div class="intro-phone-camera"></div>

              <div class="intro-phone-screen">

                <i data-lucide="${page.icon}"></i>

                <span>SNSU CONNECTS</span>

              </div>

            </div>

            <div class="intro-feature-icon">
              <i data-lucide="${page.icon}"></i>
            </div>

          </div>

        </div>

        <div class="intro-wave"></div>

      </div>

      <!-- THREE DOTS AND CIRCULAR NEXT BUTTON -->
      <div class="intro-bottom">

        <div
          class="dots"
          role="tablist"
          aria-label="Onboarding pages"
        >

          ${pages
            .map(
              (p, i) => `
            <button
              type="button"
              class="${i === S.ip ? "on" : ""}"
              aria-label="Go to ${p.title} slide"
              aria-selected="${i === S.ip}"
              onclick="setP(${i})"
            ></button>
          `,
            )
            .join("")}

        </div>

        <!-- YELLOW CIRCULAR ARROW -->
        <button
          type="button"
          class="intro-next"
          id="ib"
          onclick="nextP()"
          aria-label="${S.ip === 2 ? "Get Started" : "Next slide"}"
        >
          <i data-lucide="arrow-right"></i>
        </button>

        <small>
          Surigao del Norte State University
        </small>

      </div>

    </div>
  `;
}

/* ---------- login / register ---------- */

const field = (id, icon, ph, type = "text", auto = "") => `
  <div class="sa-field">
    <label for="${id}">${ph}</label>
    <div class="sa-input">
      <i data-lucide="${icon}" aria-hidden="true"></i>
      <input id="${id}" type="${type}" placeholder="${ph}"
        autocomplete="${auto}">
    </div>
  </div>`;

// Role selection changes the sign-in screen only.
// The API/database remains the authority for user permissions.
function setAuthRole(role) {
  if (role !== "student" && role !== "admin") return;
  S.authRole = role;
  S.reg = false;
  render();
}

function authHtml() {
  const admin = S.authRole === "admin";
  const r = S.reg && !admin;

  return `
    <div class="login sa-login">
      <section class="sa-card">
        <div class="sa-accent" aria-hidden="true"></div>
        <div class="sa-content">

         
<div class="sa-content">

  <!-- SNSU LOGO AND ACCOUNT TYPE -->
  <div class="sa-top">

    <!-- SNSU LOGO -->
    <div class="sa-logo">
      ${CAP}
    </div>

    <!-- STUDENT / ADMIN SELECTOR -->
    <details class="sa-role-picker">
      <summary aria-label="Choose account type">

                <i data-lucide="${
                  admin ? "shield-check" : "graduation-cap"
                }" aria-hidden="true"></i>

                <span>${admin ? "Admin" : "Student"}</span>

                <i data-lucide="chevron-down"
                   aria-hidden="true"
                   class="sa-chevron"></i>
              </summary>

              <div class="sa-role-menu">
                <div class="sa-role-menu-label">
                  ACCOUNT TYPE
                </div>

                <button type="button"
                  class="sa-role-option ${!admin ? "selected" : ""}"
                  onclick="setAuthRole('student')">

                  <i data-lucide="graduation-cap"
                    aria-hidden="true"></i>

                  <span>
                    <strong>Student</strong>
                    <small>Sign in or register</small>
                  </span>

                  ${
                    !admin
                      ? '<i data-lucide="check" aria-hidden="true"></i>'
                      : ""
                  }
                </button>

                <button type="button"
                  class="sa-role-option ${admin ? "selected" : ""}"
                  onclick="setAuthRole('admin')">

                  <i data-lucide="shield-check"
                    aria-hidden="true"></i>

                  <span>
                    <strong>Administrator</strong>
                    <small>Authorized accounts</small>
                  </span>

                  ${
                    admin
                      ? '<i data-lucide="check" aria-hidden="true"></i>'
                      : ""
                  }
                </button>
              </div>
            </details>
          </div>

          <!-- LOGIN HEADING -->
          <div class="sa-heading">
            <h1>${
              r ? "Create Account" : admin ? "Admin Sign In" : "Welcome Back"
            }</h1>

            <p>${
              r
                ? "Register with your student details"
                : admin
                  ? "Sign in to manage campus events"
                  : "Sign in to your campus account"
            }</p>
          </div>

          <!-- AUTHENTICATION FORM -->
          <form onsubmit="return submitAuth(event)"
            novalidate>

            ${
              r
                ? field("sid", "id-card", "Student ID", "text", "username") +
                  field("nm", "user-round", "Full name", "text", "name")
                : ""
            }

            ${field("e", "mail", "Email Address", "email", "email")}

            <!-- PASSWORD -->
            <div class="sa-field">
              <label for="p">Password</label>

              <div class="sa-input">
                <i data-lucide="lock-keyhole"
                  aria-hidden="true"></i>

                <input
                  id="p"
                  type="password"
                  placeholder="Enter password"
                  autocomplete="${r ? "new-password" : "current-password"}">

                <button
                  id="togglePassword"
                  type="button"
                  class="sa-eye"
                  aria-label="Show password"
                  aria-pressed="false"
                  onclick="togglePasswordVisibility()">

                  <i data-lucide="eye"
                    class="ui-icon"
                    aria-hidden="true"></i>

                </button>
              </div>
            </div>

            <!-- FORGOT PASSWORD -->
            ${
              !r
                ? `
                <div class="sa-forgot">
                  <button type="button"
                    onclick="openForgotPasswordModal()">
                    Forgot password?
                  </button>
                </div>
                `
                : ""
            }

            <!-- LOGIN ERROR -->
            <div id="err"
              class="err"
              role="alert"></div>

            <!-- SUBMIT BUTTON -->
            <button
              class="sa-submit ${r ? "sa-register" : ""}"
              type="submit"
              id="sb">

              ${r ? "Create Account" : "Sign In"}
            </button>

          </form>

          <!-- GOOGLE ICON ONLY -->
          ${
            !r
              ? `
              <div class="sa-divider">
                <span>OR</span>
              </div>

              <div class="sa-google">
                <div id="google-signin-button"></div>
              </div>
              `
              : ""
          }

          <!-- REGISTER / ADMIN FOOTER -->
          <div class="sa-footer">
            ${
              admin
                ? `
                  <span class="sa-admin-note">
                    Authorized administrators only
                  </span>
                `
                : `
                  <span>
                    ${r ? "Already have an account?" : "New student?"}
                  </span>

                  <button type="button"
                    onclick="S.reg=!S.reg;render()">

                    ${r ? "Sign In" : "Create Account"}
                  </button>
                `
            }
          </div>

        </div>
      </section>
    </div>
  `;
}

/* ==========================================
   SNSU CONNECTS - FORGOT PASSWORD POPUP
   ========================================== */

function openForgotPasswordModal() {
  if (document.querySelector(".sa-reset-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "sa-reset-overlay";

  overlay.innerHTML = `
    <section class="sa-reset-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saResetTitle">

      <button type="button"
        class="sa-reset-close"
        aria-label="Close">
        <i data-lucide="x"></i>
      </button>

      <div class="sa-reset-symbol">
        <i data-lucide="key-round"></i>
      </div>

      <h2 id="saResetTitle">Forgot Password?</h2>

      <p>
        Enter your registered email address
        to request a password reset link.
      </p>

      <form class="sa-reset-form">
        <label for="saResetEmail">Email Address</label>

        <input
          id="saResetEmail"
          type="email"
          placeholder="Enter your email"
          autocomplete="email"
          required>

        <div class="sa-reset-msg"
          role="status"
          aria-live="polite"></div>

        <button type="submit"
          class="sa-reset-send">
          Send Reset Link
        </button>
      </form>
    </section>
  `;

  document.body.appendChild(overlay);

  if (window.lucide) {
    lucide.createIcons();
  }

  const input = overlay.querySelector("#saResetEmail");
  const msg = overlay.querySelector(".sa-reset-msg");
  const btn = overlay.querySelector(".sa-reset-send");

  input.value = $("e")?.value.trim() || "";

  const handleKeys = (event) => {
    if (event.key === "Escape") close();
  };

  function close() {
    document.removeEventListener("keydown", handleKeys);
    overlay.remove();
  }

  overlay.querySelector(".sa-reset-close").onclick = close;

  overlay.onclick = (event) => {
    if (event.target === overlay) close();
  };

  document.addEventListener("keydown", handleKeys);

  overlay.querySelector(".sa-reset-form").onsubmit = async (event) => {
    event.preventDefault();

    btn.disabled = true;
    msg.textContent = "";

    try {
      await API.post("/auth/forgot-password", {
        email: input.value.trim(),
      });

      msg.className = "sa-reset-msg success";
      msg.textContent =
        "If your email is registered, a reset link will be sent.";
    } catch (error) {
      msg.className = "sa-reset-msg error";
      msg.textContent =
        "Password reset is unavailable. Please contact your administrator.";
    } finally {
      btn.disabled = false;
    }
  };

  input.focus();
}

function togglePasswordVisibility() {
  const input = $("p");
  const button = $("togglePassword");

  if (!input || !button) return;

  const showing = input.type === "password";
  input.type = showing ? "text" : "password";

  button.setAttribute(
    "aria-label",
    showing ? "Hide password" : "Show password",
  );

  button.setAttribute("aria-pressed", String(showing));

  button.innerHTML = `
    <i data-lucide="${showing ? "eye-off" : "eye"}"
      class="ui-icon" aria-hidden="true"></i>
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function submitAuth(ev) {
  ev.preventDefault();

  const g = (i) => ($(i) ? $(i).value.trim() : "");
  const er = $("err");
  const b = $("sb");

  er.textContent = "";
  b.disabled = true;

  try {
    const body = S.reg
      ? {
          student_id: g("sid"),
          name: g("nm"),
          email: g("e"),
          password: $("p").value,
        }
      : {
          email: g("e"),
          password: $("p").value,
        };

    const d = await API.post(S.reg ? "/auth/register" : "/auth/login", body);

    // VERIFY STUDENT / ADMIN ACCOUNT TYPE
    if (!S.reg && d.user?.role !== (S.authRole || "student")) {
      const correctRole = d.user?.role === "admin" ? "Admin" : "Student";

      throw new Error(
        `This account belongs to the ${correctRole} portal. Please select ${correctRole} to sign in.`,
      );
    }

    // SAVE AUTHENTICATION
    API.setToken(d.token);
    S.user = d.user;
    S.reg = false;
    S.navTouched = false;

    await load();

    if (typeof remLoad === "function") {
      await remLoad("home");
    }

    // REDIRECT BASED ON DATABASE ROLE
    S.tab = isA() ? "adash" : "home";
    render();
  } catch (e) {
    er.textContent = e.message;
    b.disabled = false;
  }

  return false;
}

/* Desktop sidebar collapse / mobile drawer */

function toggleSidebar() {
  if (window.matchMedia("(min-width: 1024px)").matches) {
    document.body.classList.toggle("sidebar-collapsed");
  } else {
    S.dr = !S.dr;
    render();
  }
}

/* ---------- Navigation ---------- */

const NAV = [
  ["home", "house", "Home"],
  ["events", "calendar-days", "Events"],
  ["scan", "scan-line", "Scan"],
  ["attend", "circle-check", "Attended"],
  ["profile", "user-round", "Profile"],
];

const MENU = [
  ["home", "house", "Home"],
  ["events", "calendar-days", "Events"],
  ["scan", "scan-line", "Scan QR"],
  ["attend", "circle-check", "My Attendance"],
  ["profile", "user-round", "Profile"],
  ["about", "users-round", "About Us"],
];

const ANAV = [
  ["adash", "layout-dashboard", "Dashboard"],
  ["aevents", "calendar-days", "Events"],
  ["live", "radio", "Live"],
  ["reports", "chart-no-axes-column", "Reports"],
  ["aprofile", "user-round", "Profile"],
];

const AMENU = [
  ["adash", "layout-dashboard", "Dashboard"],
  ["aevents", "calendar-days", "Manage Events"],
  ["live", "radio", "Live Attendance"],
  ["reports", "chart-no-axes-column", "Reports"],
  ["aprofile", "user-round", "Profile"],
  ["about", "users-round", "About Us"],
];

/* ---------- Main rendering ---------- */
function openTermModal() {
  const existing = document.getElementById("termModal");

  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "termModal";
  modal.className = "term-overlay";

  const years = [
    "2026-2027",
    "2025-2026",
    "2024-2025",
    "2023-2024",
    "2022-2023",
  ];

  const semesters = ["1st Semester", "2nd Semester", "Summer", "Summer 2"];

  modal.innerHTML = `
    <div class="term-modal" role="dialog"
         aria-modal="true" aria-labelledby="termTitle">

      <h2 id="termTitle">Term</h2>

      <label for="termAY">AYFrom - AYTo</label>
      <select id="termAY">
        ${years
          .map(
            (y) => `
          <option value="${y}" ${y === selectedAY ? "selected" : ""}>
            ${y}
          </option>
        `,
          )
          .join("")}
      </select>

      <label for="termSemester">Semester</label>
      <select id="termSemester">
        ${semesters
          .map(
            (s) => `
          <option value="${s}"
            ${s === selectedSemester ? "selected" : ""}>
            ${s}
          </option>
        `,
          )
          .join("")}
      </select>

      <div class="term-actions">
        <button type="button" id="cancelTerm">Cancel</button>
        <button type="button" id="applyTerm">Apply</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("cancelTerm").onclick = () => {
    modal.remove();
  };

  document.getElementById("applyTerm").onclick = () => {
    selectedAY = document.getElementById("termAY").value;
    selectedSemester = document.getElementById("termSemester").value;

    SEM = `${selectedAY} ${selectedSemester.replace("Semester", "Sem")}`;

    localStorage.setItem("snsu_ay", selectedAY);
    localStorage.setItem("snsu_sem", selectedSemester);
    localStorage.setItem("snsu_semester", SEM);

    modal.remove();
    render();
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
}

/* GOOGLE SIGN-IN */

let googleInitialized = false;

function setupGoogleSignIn(attempts = 0) {
  const container = document.getElementById("google-signin-button");

  if (!container) return;

  // Wait until Google's library finishes loading
  if (!window.google?.accounts?.id) {
    if (attempts < 30) {
      setTimeout(() => setupGoogleSignIn(attempts + 1), 200);
    } else {
      console.error("Google Sign-In library did not load.");
    }
    return;
  }

  try {
    if (!googleInitialized) {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleSignIn,
      });

      googleInitialized = true;
    }

    container.innerHTML = "";

    google.accounts.id.renderButton(container, {
      type: "icon",
      theme: "filled_blue",
      size: "large",
      shape: "circle",
    });
  } catch (error) {
    console.error("Google Sign-In error:", error);
  }
}

async function handleGoogleSignIn(response) {
  if (!response?.credential) {
    console.error("No Google credential received.");
    return;
  }

  try {
    const data = await API.post("/auth/google", {
      credential: response.credential,
    });

    // Verify selected Student/Admin portal.
    if (data.user?.role !== S.authRole) {
      const correctRole = data.user?.role === "admin" ? "Admin" : "Student";

      throw new Error(
        `This is a ${correctRole} account. Select ${correctRole} to sign in.`,
      );
    }

    // Save token only after role verification.
    API.setToken(data.token);

    API.setToken(data.token);
    S.user = data.user;
    S.reg = false;
    S.intro = false;

    await load();

    S.tab = isA() ? "adash" : "home";
    render();
    window.scrollTo(0, 0);
  } catch (error) {
    console.error("Google authentication failed:", error);
    alert(error.message || "Google Sign-In failed.");
  }
}

function render() {
  applyTheme();

  const a = $("app");
  a.className = S.user ? "in" : "";

  if (!S.user) {
    a.innerHTML = S.intro ? introHtml() : authHtml();

    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Display Google Sign-In on the login page
    if (!S.intro && !S.reg) {
      setupGoogleSignIn();
    }

    return;
  }

  if (!V[S.tab]) {
    S.tab = isA() ? "adash" : "home";
  }

  const nav = isA() ? ANAV : NAV;
  const menu = isA() ? AMENU : MENU;
  const dark = isDark();

  a.innerHTML = `
    <header>
      <button class="ib sidebar-toggle" type="button"
        aria-label="Show or hide sidebar"
        title="Toggle sidebar"
        onclick="toggleSidebar()">
        <i data-lucide="panel-left" aria-hidden="true"></i>
      </button>

      <button
  class="sem"
  type="button"
  onclick="openTermModal()"
  aria-label="Select academic year and semester"
>
  <span>${SEM}</span>
  <i data-lucide="chevron-down"></i>
</button>

      ${
        !isA()
          ? `
        <button class="ib header-notifications" type="button"
          aria-label="Notifications"
          title="Notifications"
          onclick="go('notifs')">
          <i data-lucide="bell" aria-hidden="true"></i>

          ${
            typeof RM !== "undefined" && RM.unread
              ? `<span class="badge">${RM.unread}</span>`
              : ""
          }
        </button>
      `
          : ""
      }

    <button class="ib theme-toggle ${dark ? "theme-active" : ""}"
  type="button"
  aria-label="Toggle theme"
  title="Toggle theme"
  onclick="toggleTheme()">

  ${
    dark
      ? `
    <svg viewBox="0 0 24 24"
      width="26" height="26"
      fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M6.35 17.65l-1.42 1.42M19.07 4.93l-1.42 1.42"/>
    </svg>
  `
      : `
    <svg viewBox="0 0 24 24"
      width="26" height="26"
      fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round">
      <path d="M20.985 12.486A9 9 0 0 1 11.514 3.015a9 9 0 1 0 9.47 9.47z"/>
    </svg>
  `
  }

</button>
    </header>

    <main class="v-${S.tab}">
      ${V[S.tab]()}
    </main>

    <nav class="nav">
      ${nav
        .map(
          (n) => `
        <button
          class="${
            S.navTouched &&
            (S.tab == n[0] || (S.tab == "result" && n[0] == "scan"))
              ? "on"
              : ""
          }"
          onclick="go('${n[0]}')">

          <i data-lucide="${n[1]}" class="nav-icon"></i>
          <span>${n[2]}</span>
        </button>
      `,
        )
        .join("")}
    </nav>

    <div class="drw${S.dr ? " open" : ""}">
      <div>
        <div class="me">
          <div class="av" style="background:none;padding:0">
            ${photo() ? `<img alt="" src="${photo()}">` : CAP}
          </div>

          <b>${esc(S.user.name.toUpperCase())}</b>
          <br>
          <small>${esc(S.user.email)}</small>
        </div>

        ${menu
          .map(
            (m) => `
          <button
            class="mi ${S.navTouched && S.tab == m[0] ? "on" : ""}"
            onclick="go('${m[0]}')">

            <i data-lucide="${m[1]}" class="menu-icon"></i>
            <span>${m[2]}</span>
          </button>
        `,
          )
          .join("")}

        <small style="text-align:center;color:var(--mu);margin:14px 0">
          v1.0
        </small>

        <button class="out" onclick="signOut()">
          Sign Out
        </button>
      </div>

      <span onclick="S.dr=false;render()"></span>
    </div>

    ${S.toast ? `<div class="toast">${esc(S.toast)}</div>` : ""}
  `;

  if (window.lucide) {
    window.lucide.createIcons();
  }

  if (S.qr && window.QRCode && $("qrbox")) {
    new QRCode($("qrbox"), {
      text: S.qr.code,
      width: 200,
      height: 200,
    });
  }
}

/* Live attendance refreshes every 10 seconds */

setInterval(async () => {
  if (
    S.tab === "live" &&
    isA() &&
    !document.hidden &&
    document.activeElement.tagName !== "SELECT"
  ) {
    try {
      await loadRep();
      render();
    } catch (e) {}
  }
}, 10000);

/* ---------- Start ---------- */

(async () => {
  if (API.token) {
    try {
      S.user = await API.get("/auth/me");
      await load();

      if (typeof remLoad === "function") {
        await remLoad("home");
      }

      S.tab = isA() ? "adash" : "home";
      S.intro = false;
    } catch (e) {
      API.setToken(null);
      S.user = null;
    }
  }

  render();
})();
