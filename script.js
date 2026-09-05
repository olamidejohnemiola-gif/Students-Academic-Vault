/* ==========================================================
   STUDENT ACADEMIC VAULT
   V5 functionality layer
   Firebase Auth + Firestore, no Firebase Storage required.
   ========================================================== */

(() => {
  "use strict";

  const auth = window.SAV?.auth;
  const db = window.SAV?.db;
  const $ = (id) => document.getElementById(id);
  const $all = (selector) => Array.from(document.querySelectorAll(selector));

  const year = $("year");
  if (year) year.textContent = new Date().getFullYear();

  if (!auth || !db) {
    console.error("Student Academic Vault: Firebase did not initialize.");
    document.documentElement.classList.add("firebase-unavailable");
  }

  function showMessage(el, text, type = "error") {
    if (!el) return;
    el.textContent = text || "";
    el.className = `form-message${text ? " show" : ""}${text ? ` ${type}-message` : ""}`;
  }

  function setError(id, text = "") {
    const field = $(id);
    const error = document.querySelector(`[data-error-for="${id}"]`);
    if (field && id !== "terms") field.classList.toggle("invalid", Boolean(text));
    if (error) error.textContent = text;
  }

  function clearErrors(ids) { (ids || []).forEach(id => setError(id, "")); }

  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    const span = button.querySelector("span:first-child");
    if (span && label) span.textContent = label;
  }

  function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || ""); }

  function firebaseMessage(code) {
    const map = {
      "auth/network-request-failed": "Network error. Check your internet connection and try again.",
      "auth/too-many-requests": "Too many attempts. Please wait a little and try again.",
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/wrong-password": "Incorrect email or password.",
      "auth/user-not-found": "Incorrect email or password.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/weak-password": "Choose a stronger password.",
      "auth/user-disabled": "This account has been disabled. Please contact support."
    };
    return map[code] || "Something went wrong. Please try again.";
  }

  /* ---------------- Password UI ---------------- */
  $all(".password-toggle").forEach(button => {
    button.addEventListener("click", () => {
      const input = $(button.dataset.target);
      if (!input) return;
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "Show" : "Hide";
    });
  });

  const password = $("password");
  const meter = document.querySelector(".password-meter");
  const hint = $("passwordHint");
  if (password && meter && hint) {
    password.addEventListener("input", () => {
      const value = password.value;
      let score = 0;
      if (value.length >= 8) score++;
      if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
      if (/\d/.test(value)) score++;
      if (/[^A-Za-z0-9]/.test(value)) score++;
      meter.className = "password-meter";
      if (value) meter.classList.add(score <= 1 ? "weak" : score === 2 ? "medium" : score === 3 ? "strong" : "very-strong");
      hint.textContent = !value ? "Use 8+ characters with a mix of letters and numbers." : score <= 1 ? "Weak password — make it longer and less predictable." : score === 2 ? "Fair password — add uppercase letters, numbers or symbols." : score === 3 ? "Strong password." : "Very strong password.";
    });
  }

  /* ---------------- Signup ---------------- */
  const signupForm = $("signupForm");
  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!auth || !db) return showMessage($("formMessage"), "Firebase is not available. Make sure you are online and reload the page.");

      const msg = $("formMessage");
      const button = $("signupBtn");
      const duplicate = $("duplicateAccountAction");
      clearErrors(["fullName", "email", "phone", "university", "studentId", "password", "confirmPassword", "terms"]);
      showMessage(msg, "");
      if (duplicate) duplicate.hidden = true;

      const data = {
        fullName: $("fullName")?.value.trim() || "",
        email: $("email")?.value.trim().toLowerCase() || "",
        phone: $("phone")?.value.trim() || "",
        university: $("university")?.value.trim() || "",
        studentId: $("studentId")?.value.trim() || "",
        password: $("password")?.value || "",
        confirmPassword: $("confirmPassword")?.value || "",
        terms: Boolean($("terms")?.checked)
      };

      let valid = true;
      if (data.fullName.length < 3) { setError("fullName", "Enter your full name."); valid = false; }
      if (!validEmail(data.email)) { setError("email", "Enter a valid email address."); valid = false; }
      if (data.phone.replace(/\D/g, "").length < 10) { setError("phone", "Enter a valid phone number."); valid = false; }
      if (data.university.length < 2) { setError("university", "Enter your university."); valid = false; }
      if (data.studentId.length < 2) { setError("studentId", "Enter your matric / student ID."); valid = false; }
      if (data.password.length < 8) { setError("password", "Password must contain at least 8 characters."); valid = false; }
      if (data.password !== data.confirmPassword) { setError("confirmPassword", "Passwords do not match."); valid = false; }
      if (!data.terms) { setError("terms", "Please accept the Terms of Use and Privacy Policy."); valid = false; }
      if (!valid) return showMessage(msg, "Please correct the highlighted fields and try again.");

      setBusy(button, true, "Creating account...");
      let user = null;
      try {
        const credential = await auth.createUserWithEmailAndPassword(data.email, data.password);
        user = credential.user;

        await db.collection("students").doc(user.uid).set({
          uid: user.uid,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          university: data.university,
          studentId: data.studentId,
          emailVerified: false,
          accountStatus: "pending-verification",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await user.sendEmailVerification();
        sessionStorage.setItem("savPendingVerificationEmail", data.email);
        showMessage(msg, "Account created successfully. We sent a verification link to your email.", "success");
        setTimeout(() => { location.href = "verify.html"; }, 700);
      } catch (error) {
        console.error("Signup error:", error);
        if (error.code === "auth/email-already-in-use") {
          setError("email", "An account with this email already exists.");
          showMessage(msg, "An account with this email already exists. Please log in instead, or use another email address.");
          if (duplicate) duplicate.hidden = false;
        } else if (error.code === "permission-denied") {
          showMessage(msg, "Firebase created the account, but Firestore blocked the student profile. Check your Firestore Rules.");
        } else {
          showMessage(msg, firebaseMessage(error.code));
        }
      } finally {
        setBusy(button, false, "Create my account");
      }
    });
  }

  /* ---------------- Login ---------------- */
  const loginForm = $("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const msg = $("loginMessage");
      const button = $("loginBtn");
      const email = $("loginEmail")?.value.trim().toLowerCase() || "";
      const pass = $("loginPassword")?.value || "";
      clearErrors(["loginEmail", "loginPassword"]);
      showMessage(msg, "");
      if (!validEmail(email)) { setError("loginEmail", "Enter a valid email address."); return showMessage(msg, "Please enter a valid email address."); }
      if (!pass) { setError("loginPassword", "Enter your password."); return showMessage(msg, "Enter your password."); }
      setBusy(button, true, "Signing in...");
      try {
        const credential = await auth.signInWithEmailAndPassword(email, pass);
        await credential.user.reload();
        if (!credential.user.emailVerified) {
          sessionStorage.setItem("savPendingVerificationEmail", email);
          showMessage(msg, "Please verify your email before entering your vault.");
          setTimeout(() => { location.href = "verify.html"; }, 700);
          return;
        }
        location.href = "dashboard.html";
      } catch (error) {
        console.error("Login error:", error);
        showMessage(msg, firebaseMessage(error.code));
      } finally {
        setBusy(button, false, "Log in");
      }
    });
  }

  /* ---------------- Forgot password ---------------- */
  const forgotForm = $("forgotForm");
  if (forgotForm) {
    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const msg = $("forgotMessage");
      const button = $("forgotBtn");
      const email = $("forgotEmail")?.value.trim().toLowerCase() || "";
      clearErrors(["forgotEmail"]);
      if (!validEmail(email)) { setError("forgotEmail", "Enter a valid email address."); return showMessage(msg, "Enter the email connected to your account."); }
      setBusy(button, true, "Sending...");
      try {
        await auth.sendPasswordResetEmail(email);
        showMessage(msg, "If an account uses that email, a secure password-reset link has been sent.", "success");
      } catch (error) {
        console.error("Password reset error:", error);
        showMessage(msg, error.code === "auth/user-not-found" ? "If an account uses that email, a secure password-reset link has been sent." : firebaseMessage(error.code));
      } finally { setBusy(button, false, "Send recovery link"); }
    });
  }

  /* ---------------- Reset password ---------------- */
  const resetForm = $("resetForm");
  if (resetForm) {
    const params = new URLSearchParams(location.search);
    const code = params.get("oobCode");
    const msg = $("resetMessage");
    const button = $("resetBtn");
    let codeValid = false;
    if (!code) showMessage(msg, "This password-reset link is missing or invalid.");
    else auth.verifyPasswordResetCode(code).then(() => { codeValid = true; }).catch(() => showMessage(msg, "This password-reset link is invalid or has expired."));

    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearErrors(["newPassword", "resetConfirm"]);
      const p = $("newPassword")?.value || "";
      const c = $("resetConfirm")?.value || "";
      if (!code || !codeValid) return showMessage(msg, "This reset link is invalid or has expired. Request a new one from Forgot Password.");
      if (p.length < 8) { setError("newPassword", "Password must contain at least 8 characters."); return showMessage(msg, "Choose a password with at least 8 characters."); }
      if (p !== c) { setError("resetConfirm", "Passwords do not match."); return showMessage(msg, "Your passwords must match."); }
      setBusy(button, true, "Resetting...");
      try {
        await auth.confirmPasswordReset(code, p);
        showMessage(msg, "Your password has been updated. You can now log in.", "success");
        setTimeout(() => { location.href = "login.html"; }, 900);
      } catch (error) {
        console.error(error);
        showMessage(msg, "This reset link is invalid or has expired. Request a new one.");
      } finally { setBusy(button, false, "Reset password"); }
    });
  }

  /* ---------------- Email verification ---------------- */
  const verifyButton = $("checkVerification");
  const resendButton = $("resendVerification");
  if (verifyButton || resendButton) {
    const msg = $("verifyMessage");
    verifyButton?.addEventListener("click", async () => {
      try {
        if (!auth.currentUser) return showMessage(msg, "Please log in with the account you are verifying, then return here.");
        await auth.currentUser.reload();
        if (!auth.currentUser.emailVerified) return showMessage(msg, "Your email is not verified yet. Open the email we sent, click the verification link, then try again.");
        await db.collection("students").doc(auth.currentUser.uid).set({ emailVerified: true, accountStatus: "active", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        sessionStorage.removeItem("savPendingVerificationEmail");
        showMessage(msg, "Email verified. Welcome to Student Academic Vault!", "success");
        setTimeout(() => { location.href = "dashboard.html"; }, 700);
      } catch (error) { console.error(error); showMessage(msg, "We couldn't check your verification status. Please try again."); }
    });
    resendButton?.addEventListener("click", async () => {
      try {
        if (!auth.currentUser) return showMessage(msg, "Please log in first so we can resend the verification email.");
        await auth.currentUser.sendEmailVerification();
        showMessage(msg, "A new verification email has been sent.", "success");
      } catch (error) { console.error(error); showMessage(msg, error.code === "auth/too-many-requests" ? "Please wait before requesting another verification email." : firebaseMessage(error.code)); }
    });
  }

  /* ---------------- Shared navigation ---------------- */
  const menuToggle = $("menuToggle");
  const mainNav = $("mainNav");
  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const open = mainNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("menu-open", open);
    });
    mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      mainNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("menu-open");
    }));
  }

  const animated = document.querySelectorAll(".float-in, .stagger-float, img.float-image");
  if (animated.length && "IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    }), { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    animated.forEach(el => observer.observe(el));
  } else animated.forEach(el => el.classList.add("is-visible"));

  /* ---------------- Auth guard + dashboard/profile ---------------- */
  const needsAuth = Boolean($("documentGrid") || $("welcomeText") || $("profileName"));
  if (needsAuth && auth) {
    auth.onAuthStateChanged(async user => {
      if (!user) { location.href = "login.html"; return; }
      await user.reload();
      if (!user.emailVerified) { location.href = "verify.html"; return; }

      if ($("welcomeText")) {
        try {
          const snap = await db.collection("students").doc(user.uid).get();
          const data = snap.exists ? snap.data() : {};
          $("welcomeText").textContent = `Welcome back, ${data.fullName || user.email}. Your academic space is ready. Keep the documents you need close and organized.`;
        } catch (error) { console.error(error); }
      }

      if ($("profileName")) {
        try {
          const snap = await db.collection("students").doc(user.uid).get();
          const data = snap.exists ? snap.data() : {};
          $("profileName").textContent = data.fullName || "—";
          $("profileEmail").textContent = data.email || user.email || "—";
          $("profilePhone").textContent = data.phone || "—";
          $("profileUniversity").textContent = data.university || "—";
          $("profileStudentId").textContent = data.studentId || "—";
        } catch (error) {
          console.error(error);
          showMessage($("profileMessage"), "We couldn't load your profile.");
        }
      }
    });
  }

  $all("#logoutBtn").forEach(button => button.addEventListener("click", async () => {
    try { await auth.signOut(); location.href = "login.html"; }
    catch (error) { console.error(error); }
  }));

  /* ---------------- Document Vault ---------------- */
if ($("documentGrid") && auth) {

  const grid = $("documentGrid");
  const empty = $("emptyVault");
  const count = $("documentCount");
  const vaultMessage = $("vaultMessage");
  const driveStatus = $("driveStatus");
  const connectDriveBtn = $("connectDriveBtn");
  const search = $("documentSearch");
  const category = $("categoryFilter");

  const uploadModal = $("uploadModal");
  const previewModal = $("previewModal");
  const uploadForm = $("uploadForm");

  const fileInput = $("documentFile");
  const fileLabel = $("fileLabel");
  const fileMeta = $("fileMeta");

  const progress = $("uploadProgress");
  const progressBar = $("progressBar");
  const progressText = $("progressText");

  let documents = [];
  let unsubscribeDocuments = null;

  const MAX_FILE_BYTES = 25 * 1024 * 1024;

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ];


  /* ==========================================================
     HELPERS
     ========================================================== */

  const formatSize = bytes => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1048576) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1048576).toFixed(1)} MB`;
  };


  const escapeHTML = value =>
    String(value).replace(
      /[&<>'"]/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[character]
    );


  const categoryName = value => {
    const categoryValue = value || "other";

    return (
      categoryValue.charAt(0).toUpperCase() +
      categoryValue.slice(1)
    );
  };


  const typeIcon = type =>
    type === "application/pdf"
      ? "📄"
      : "🖼️";


  function setDriveStatus(text, type = "") {

    if (!driveStatus) return;

    driveStatus.textContent = text;

    driveStatus.className =
      `drive-status${type ? ` ${type}` : ""}`;
  }


  /* ==========================================================
     UPLOAD MODAL
     ========================================================== */

  function openUpload() {

    if (!uploadModal) return;

    uploadModal.hidden = false;

    document.body.classList.add("modal-open");

    setTimeout(() => {
      fileInput?.focus();
    }, 50);
  }


  function closeUpload() {

    if (!uploadModal) return;

    uploadModal.hidden = true;

    document.body.classList.remove("modal-open");
  }


  $("openUploadBtn")?.addEventListener(
    "click",
    openUpload
  );


  $("emptyUploadBtn")?.addEventListener(
    "click",
    openUpload
  );


  $("closeUploadBtn")?.addEventListener(
    "click",
    closeUpload
  );


  uploadModal?.addEventListener("click", event => {

    if (event.target === uploadModal) {
      closeUpload();
    }

  });


  /* ==========================================================
     PREVIEW MODAL
     ========================================================== */

  function closePreview() {

    if (!previewModal) return;

    previewModal.hidden = true;

    document.body.classList.remove("modal-open");

    const content = $("previewContent");

    if (content) {
      content.innerHTML = "";
    }
  }


  $("closePreviewBtn")?.addEventListener(
    "click",
    closePreview
  );


  previewModal?.addEventListener("click", event => {

    if (event.target === previewModal) {
      closePreview();
    }

  });


  /* ==========================================================
     MULTI-FILE SELECTION
     ========================================================== */

  fileInput?.addEventListener("change", () => {

    const files = Array.from(fileInput.files || []);

    if (!files.length) {

      if (fileLabel) {
        fileLabel.textContent =
          "Choose multiple PDF, JPG or PNG files";
      }

      if (fileMeta) {
        fileMeta.textContent =
          "Maximum 25 MB per file";
      }

      return;
    }


    const totalSize = files.reduce(
      (total, file) => total + file.size,
      0
    );


    if (fileLabel) {

      fileLabel.textContent =
        `${files.length} document${files.length === 1 ? "" : "s"} selected`;

    }


    if (fileMeta) {

      fileMeta.textContent =
        `${formatSize(totalSize)} total • ${formatSize(files[0].size)} max per file`;

    }

  });


  /* ==========================================================
     RENDER DOCUMENTS
     ========================================================== */

  function renderDocuments() {

    const term =
      (search?.value || "")
        .trim()
        .toLowerCase();


    const selected =
      category?.value || "all";


    const filtered = documents.filter(item => {

      const name =
        String(item.name || "")
          .toLowerCase();


      const cat =
        String(item.category || "other")
          .toLowerCase();


      return (
        (!term ||
          name.includes(term) ||
          cat.includes(term))
        &&
        (
          selected === "all" ||
          cat === selected
        )
      );

    });


    if (count) {

      count.textContent =
        `${documents.length} document${documents.length === 1 ? "" : "s"} in your vault`;

    }


    if (empty) {
      empty.hidden = documents.length !== 0;
    }


    if (!documents.length) {

      if (grid) {
        grid.hidden = false;

        grid.innerHTML = `
          <div
            class="empty-vault"
            style="grid-column:1/-1"
          >
            <div class="empty-icon">📂</div>

            <h3>
              Your vault is empty
            </h3>

            <p>
              Upload your first academic document.
            </p>
          </div>
        `;
      }

      return;
    }


    if (!filtered.length) {

      if (grid) {

        grid.hidden = false;

        grid.innerHTML = `
          <div
            class="empty-vault"
            style="grid-column:1/-1"
          >
            <div class="empty-icon">🔎</div>

            <h3>
              No matching documents
            </h3>

            <p>
              Try another search or category.
            </p>
          </div>
        `;

      }

      return;
    }


    grid.hidden = false;


    grid.innerHTML = filtered
      .map(item => `

        <article class="document-card">

          <div class="doc-icon">
            ${typeIcon(item.fileType)}
          </div>

          <div
            class="doc-name"
            title="${escapeHTML(item.name)}"
          >
            ${escapeHTML(item.name)}
          </div>

          <div class="doc-meta">

            <span class="doc-tag">
              ${escapeHTML(
                categoryName(item.category)
              )}
            </span>

            <span>
              ${formatSize(item.fileSize || 0)}
            </span>

            <span>
              ${escapeHTML(item.dateLabel)}
            </span>

          </div>

          <div class="doc-actions">

            <button
              type="button"
              data-action="preview"
              data-id="${item.id}"
            >
              Preview
            </button>

            <button
              type="button"
              data-action="download"
              data-id="${item.id}"
            >
              Download
            </button>

            <button
              type="button"
              class="delete"
              data-action="delete"
              data-id="${item.id}"
            >
              Delete
            </button>

          </div>

        </article>

      `)
      .join("");


    grid
      .querySelectorAll("[data-action]")
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            const item =
              documents.find(
                document =>
                  document.id === button.dataset.id
              );


            if (!item) return;


            if (
              button.dataset.action ===
              "preview"
            ) {
              previewDocument(item);
            }


            if (
              button.dataset.action ===
              "download"
            ) {
              downloadDocument(item);
            }


            if (
              button.dataset.action ===
              "delete"
            ) {
              removeDocument(item);
            }

          }
        );

      });

  }


  /* ==========================================================
     GOOGLE DRIVE CONNECTION
     ========================================================== */

  async function connectDrive() {

    const user = auth.currentUser;


    if (!user) {

      return showMessage(
        vaultMessage,
        "Please sign in before connecting Google Drive."
      );

    }


    setBusy(
      connectDriveBtn,
      true,
      "Connecting..."
    );


    setDriveStatus(
      "Opening Google authorization…",
      "warning"
    );


    try {

      const folder =
        await window.SAVDrive.connect();


      connectDriveBtn.textContent =
        "Google Drive Connected ✓";


      connectDriveBtn.classList.add(
        "connected"
      );


      setDriveStatus(
        `Your Vault documents are stored in your Google Drive folder: ${
          folder.name ||
          "Student Academic Vault"
        }.`,
        "success"
      );


      showMessage(
        vaultMessage,
        "Google Drive connected successfully. Your documents will stay with your Google account.",
        "success"
      );


    } catch (error) {

      console.error(
        "Drive connection error:",
        error
      );


      const message =
        /not configured/i.test(
          error.message || ""
        )

          ? "Google Drive is not configured yet. Add your Web OAuth Client ID to google-drive.js."

          : /popup|cancel|access_denied/i.test(
              error.message || ""
            )

          ? "Google Drive authorization was canceled. Connect again when you are ready."

          : "We couldn't connect Google Drive. Check your Google Cloud OAuth setup and try again.";


      setDriveStatus(
        message,
        "error"
      );


      showMessage(
        vaultMessage,
        message
      );


    } finally {

      setBusy(
        connectDriveBtn,
        false
      );

    }

  }


  connectDriveBtn?.addEventListener(
    "click",
    connectDrive
  );


  /* ==========================================================
     PREVIEW
     ========================================================== */

  async function previewDocument(item) {

    try {

      if (!item.driveFileId) {
        throw new Error(
          "This document has no Google Drive file ID."
        );
      }


      await window.SAVDrive.previewFile(
        item.driveFileId,
        item.fileType,
        item.name
      );


    } catch (error) {

      console.error(
        "Preview error:",
        error
      );


      showMessage(
        vaultMessage,
        "We couldn't open that document. Please connect Google Drive and try again."
      );

    }

  }


  /* ==========================================================
     DOWNLOAD
     ========================================================== */

  async function downloadDocument(item) {

    try {

      if (!item.driveFileId) {
        throw new Error(
          "This document has no Google Drive file ID."
        );
      }


      await window.SAVDrive.downloadFile(
        item.driveFileId,
        item.originalName || item.name
      );


    } catch (error) {

      console.error(
        "Download error:",
        error
      );


      showMessage(
        vaultMessage,
        "We couldn't download that document. Please connect Google Drive and try again."
      );

    }

  }


  /* ==========================================================
     DELETE
     ========================================================== */

  async function removeDocument(item) {

    if (
      !confirm(
        `Delete “${item.name}” from your vault and Google Drive?`
      )
    ) {
      return;
    }


    const user = auth.currentUser;


    try {

      if (item.driveFileId) {

        await window.SAVDrive.deleteFile(
          item.driveFileId
        );

      }


      await db
        .collection("students")
        .doc(user.uid)
        .collection("documents")
        .doc(item.id)
        .delete();


      showMessage(
        vaultMessage,
        "Document deleted from your vault and Google Drive.",
        "success"
      );


    } catch (error) {

      console.error(
        "Delete error:",
        error
      );


      showMessage(
        vaultMessage,
        error.code === "permission-denied"

          ? "You do not have permission to delete this document."

          : "We couldn't delete that document. Please try again."
      );

    }

  }


  /* ==========================================================
     SEARCH + CATEGORY FILTER
     ========================================================== */

  search?.addEventListener(
    "input",
    renderDocuments
  );


  category?.addEventListener(
    "change",
    renderDocuments
  );


  /* ==========================================================
     MULTI-FILE UPLOAD
     ========================================================== */

  uploadForm?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const user = auth.currentUser;


      if (!user || !user.emailVerified) {

        return showMessage(
          vaultMessage,
          "Please sign in with a verified account before uploading."
        );

      }


      if (!window.SAVDrive) {

        return showMessage(
          vaultMessage,
          "Google Drive is not available. Reload the page and try again."
        );

      }


      const categoryValue =
        $("documentCategory")?.value ||
        "other";


      /*
       * IMPORTANT:
       * We now take ALL selected files.
       * We no longer use files[0].
       */

      const files =
        Array.from(
          fileInput?.files || []
        );


      clearErrors([
        "documentName"
      ]);


      showMessage(
        vaultMessage,
        ""
      );


      if (!files.length) {

        return showMessage(
          vaultMessage,
          "Choose one or more documents to upload."
        );

      }


      /* ======================================================
         VALIDATE EVERY FILE BEFORE UPLOADING ANYTHING
         ====================================================== */

      const invalidFiles = [];


      files.forEach(file => {

        if (!allowedTypes.includes(file.type)) {

          invalidFiles.push(
            `${file.name} — unsupported file type`
          );

        } else if (
          file.size > MAX_FILE_BYTES
        ) {

          invalidFiles.push(
            `${file.name} — larger than 25 MB`
          );

        }

      });


      if (invalidFiles.length) {

        return showMessage(
          vaultMessage,
          `Please fix these files before uploading:\n${invalidFiles.join("\n")}`
        );

      }


      const button =
        $("uploadBtn");


      setBusy(
        button,
        true,
        "Uploading..."
      );


      progress.hidden = false;

      progressBar.style.width =
        "0%";


      progressText.textContent =
        `Preparing ${files.length} document${files.length === 1 ? "" : "s"}...`;


      let uploadedCount = 0;

      const failedFiles = [];


      try {

        /*
         * Upload sequentially.
         *
         * This is intentional:
         * 1. It keeps memory usage lower.
         * 2. It makes progress easier to understand.
         * 3. It is friendlier to mobile devices.
         */

        for (
          let index = 0;
          index < files.length;
          index++
        ) {

          const file =
            files[index];


          const documentNumber =
            index + 1;


          progressBar.style.width =
            "0%";


          progressText.textContent =
            `Uploading ${documentNumber} of ${files.length}: ${file.name}`;


          try {

            /*
             * Use the filename automatically.
             *
             * Example:
             *
             * WAEC Certificate.pdf
             *
             * becomes:
             *
             * WAEC Certificate
             */

            const documentName =
              file.name.replace(
                /\.[^/.]+$/,
                ""
              ).trim() ||
              file.name;


            const docRef =
              db
                .collection("students")
                .doc(user.uid)
                .collection("documents")
                .doc();


            const driveFile =
              await window.SAVDrive.uploadFile(
                file,
                documentName,
                categoryValue,
                (percent, text) => {

                  /*
                   * Overall progress:
                   *
                   * Each completed file = one unit.
                   * Current file contributes its percentage.
                   */

                  const overallPercent =
                    Math.round(
                      (
                        (index / files.length) * 100
                      ) +
                      (
                        percent / files.length
                      )
                    );


                  progressBar.style.width =
                    `${overallPercent}%`;


                  progressText.textContent =
                    text
                      ? `Document ${documentNumber} of ${files.length}: ${text}`
                      : `Uploading document ${documentNumber} of ${files.length} — ${percent}%`;

                }
              );


            /*
             * Save this file as its own Firestore document.
             */

            await docRef.set({

              ownerId:
                user.uid,

              name:
                documentName,

              originalName:
                file.name,

              category:
                categoryValue,

              fileType:
                file.type,

              fileSize:
                file.size,

              driveFileId:
                driveFile.id,

              driveFileName:
                driveFile.name,

              driveMimeType:
                driveFile.mimeType,

              driveCreatedTime:
                driveFile.createdTime ||
                null,

              driveWebViewLink:
                driveFile.webViewLink ||
                null,

              storageProvider:
                "google-drive",

              createdAt:
                firebase.firestore.FieldValue.serverTimestamp(),

              updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

            });


            uploadedCount++;


          } catch (fileError) {

            console.error(
              `Upload failed for ${file.name}:`,
              fileError
            );


            failedFiles.push({
              name: file.name,
              error: fileError
            });

          }

        }


        /* ======================================================
           FINAL RESULT
           ====================================================== */

        progressBar.style.width =
          "100%";


        if (
          uploadedCount === files.length
        ) {

          progressText.textContent =
            `Completed — ${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded.`;


          showMessage(
            vaultMessage,
            `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} successfully saved to your Google Drive.`,
            "success"
          );


          setDriveStatus(
            "Your Vault documents are stored in your Google Drive.",
            "success"
          );


        } else if (
          uploadedCount > 0
        ) {

          progressText.textContent =
            `Completed with ${uploadedCount} of ${files.length} uploaded.`;


          const failedNames =
            failedFiles
              .map(item => item.name)
              .join(", ");


          showMessage(
            vaultMessage,
            `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded successfully. ${failedFiles.length} failed: ${failedNames}`,
            "warning"
          );


        } else {

          progressText.textContent =
            "No documents were uploaded.";


          showMessage(
            vaultMessage,
            "None of the selected documents could be uploaded. Please try again."
          );

        }


        /*
         * Reset only after the batch is finished.
         */

        uploadForm.reset();


        if (fileLabel) {

          fileLabel.textContent =
            "Choose multiple PDF, JPG or PNG files";

        }


        if (fileMeta) {

          fileMeta.textContent =
            "Maximum 25 MB per file";

        }


        /*
         * Close modal shortly after successful upload.
         */

        if (uploadedCount > 0) {

          setTimeout(() => {

            progress.hidden = true;

            closeUpload();

          }, 900);

        } else {

          progress.hidden = true;

        }


      } catch (error) {

        console.error(
          "Multi-file Google Drive upload error:",
          error
        );


        const message =
          /not configured/i.test(
            error.message || ""
          )

            ? "Google Drive is not configured yet. Add your Web OAuth Client ID to google-drive.js."

            : /403|insufficient|permission/i.test(
                error.message || ""
              )

            ? "Google Drive denied this action. Check that the Drive API is enabled and the OAuth account has granted access."

            : "We couldn't save the selected documents to Google Drive. Please connect Google Drive and try again.";


        showMessage(
          vaultMessage,
          message
        );


        progress.hidden = true;


      } finally {

        setBusy(
          button,
          false,
          "Save documents"
        );

      }

    }
  );


  /* ==========================================================
     FIRESTORE DOCUMENT LISTENER
     ========================================================== */

  auth.onAuthStateChanged(
    async user => {

      if (unsubscribeDocuments) {

        unsubscribeDocuments();

        unsubscribeDocuments = null;

      }


      if (!user) return;


      await user.reload();


      if (!user.emailVerified) return;


      /* ------------------------------------------------------
         CHECK GOOGLE DRIVE CONNECTION
         ------------------------------------------------------ */

      try {

        const connection =
          await window.SAVDrive.getConnection(
            user
          );


        if (connection.connected) {

          connectDriveBtn.textContent =
            "Google Drive Connected ✓";


          connectDriveBtn.classList.add(
            "connected"
          );


          setDriveStatus(
            "Your Vault documents are stored in your Google Drive.",
            "success"
          );


        } else {

          connectDriveBtn.textContent =
            "Connect Google Drive";


          connectDriveBtn.classList.remove(
            "connected"
          );

        }


      } catch (error) {

        console.warn(
          "Drive status check failed:",
          error
        );

      }


      /* ------------------------------------------------------
         FIRESTORE QUERY
         ------------------------------------------------------ */

      const q =
        db
          .collection("students")
          .doc(user.uid)
          .collection("documents");


      unsubscribeDocuments =
        q.onSnapshot(

          snapshot => {

            documents =
              snapshot.docs

                .map(snap => {

                  const data =
                    snap.data();


                  const date =
                    data.createdAt?.toDate

                      ? data.createdAt.toDate()

                      : data.driveCreatedTime

                      ? new Date(
                          data.driveCreatedTime
                        )

                      : null;


                  return {

                    id:
                      snap.id,

                    ...data,

                    dateLabel:
                      date

                        ? date.toLocaleDateString(
                            undefined,
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric"
                            }
                          )

                        : "Just now"

                  };

                })


                .sort(
                  (a, b) =>
                    (
                      a.createdAt?.toMillis?.() ||
                      new Date(
                        a.driveCreatedTime || 0
                      ).getTime() ||
                      0
                    )
                    -
                    (
                      b.createdAt?.toMillis?.() ||
                      new Date(
                        b.driveCreatedTime || 0
                      ).getTime() ||
                      0
                    )
                );


            /*
             * Newest first.
             */

            documents.reverse();


            renderDocuments();

          },


          error => {

            console.error(
              "Vault listener error:",
              error
            );


            showMessage(
              vaultMessage,

              error.code === "permission-denied"

                ? "Firestore denied access to your vault. Publish the included firestore.rules."

                : "We couldn't load your vault right now. Please try again."
            );

          }

        );

    }
  );

}/* ---------------- Document Vault ---------------- */
if ($("documentGrid") && auth) {

  const grid = $("documentGrid");
  const empty = $("emptyVault");
  const count = $("documentCount");
  const vaultMessage = $("vaultMessage");
  const driveStatus = $("driveStatus");
  const connectDriveBtn = $("connectDriveBtn");
  const search = $("documentSearch");
  const category = $("categoryFilter");

  const uploadModal = $("uploadModal");
  const previewModal = $("previewModal");
  const uploadForm = $("uploadForm");

  const fileInput = $("documentFile");
  const fileLabel = $("fileLabel");
  const fileMeta = $("fileMeta");

  const progress = $("uploadProgress");
  const progressBar = $("progressBar");
  const progressText = $("progressText");

  let documents = [];
  let unsubscribeDocuments = null;

  const MAX_FILE_BYTES = 25 * 1024 * 1024;

  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png"
  ];


  /* ==========================================================
     HELPERS
     ========================================================== */

  const formatSize = bytes => {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1048576) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / 1048576).toFixed(1)} MB`;
  };


  const escapeHTML = value =>
    String(value).replace(
      /[&<>'"]/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      })[character]
    );


  const categoryName = value => {
    const categoryValue = value || "other";

    return (
      categoryValue.charAt(0).toUpperCase() +
      categoryValue.slice(1)
    );
  };


  const typeIcon = type =>
    type === "application/pdf"
      ? "📄"
      : "🖼️";


  function setDriveStatus(text, type = "") {

    if (!driveStatus) return;

    driveStatus.textContent = text;

    driveStatus.className =
      `drive-status${type ? ` ${type}` : ""}`;
  }


  /* ==========================================================
     UPLOAD MODAL
     ========================================================== */

  function openUpload() {

    if (!uploadModal) return;

    uploadModal.hidden = false;

    document.body.classList.add("modal-open");

    setTimeout(() => {
      fileInput?.focus();
    }, 50);
  }


  function closeUpload() {

    if (!uploadModal) return;

    uploadModal.hidden = true;

    document.body.classList.remove("modal-open");
  }


  $("openUploadBtn")?.addEventListener(
    "click",
    openUpload
  );


  $("emptyUploadBtn")?.addEventListener(
    "click",
    openUpload
  );


  $("closeUploadBtn")?.addEventListener(
    "click",
    closeUpload
  );


  uploadModal?.addEventListener("click", event => {

    if (event.target === uploadModal) {
      closeUpload();
    }

  });


  /* ==========================================================
     PREVIEW MODAL
     ========================================================== */

  function closePreview() {

    if (!previewModal) return;

    previewModal.hidden = true;

    document.body.classList.remove("modal-open");

    const content = $("previewContent");

    if (content) {
      content.innerHTML = "";
    }
  }


  $("closePreviewBtn")?.addEventListener(
    "click",
    closePreview
  );


  previewModal?.addEventListener("click", event => {

    if (event.target === previewModal) {
      closePreview();
    }

  });


  /* ==========================================================
     MULTI-FILE SELECTION
     ========================================================== */

  fileInput?.addEventListener("change", () => {

    const files = Array.from(fileInput.files || []);

    if (!files.length) {

      if (fileLabel) {
        fileLabel.textContent =
          "Choose multiple PDF, JPG or PNG files";
      }

      if (fileMeta) {
        fileMeta.textContent =
          "Maximum 25 MB per file";
      }

      return;
    }


    const totalSize = files.reduce(
      (total, file) => total + file.size,
      0
    );


    if (fileLabel) {

      fileLabel.textContent =
        `${files.length} document${files.length === 1 ? "" : "s"} selected`;

    }


    if (fileMeta) {

      fileMeta.textContent =
        `${formatSize(totalSize)} total • ${formatSize(files[0].size)} max per file`;

    }

  });


  /* ==========================================================
     RENDER DOCUMENTS
     ========================================================== */

  function renderDocuments() {

    const term =
      (search?.value || "")
        .trim()
        .toLowerCase();


    const selected =
      category?.value || "all";


    const filtered = documents.filter(item => {

      const name =
        String(item.name || "")
          .toLowerCase();


      const cat =
        String(item.category || "other")
          .toLowerCase();


      return (
        (!term ||
          name.includes(term) ||
          cat.includes(term))
        &&
        (
          selected === "all" ||
          cat === selected
        )
      );

    });


    if (count) {

      count.textContent =
        `${documents.length} document${documents.length === 1 ? "" : "s"} in your vault`;

    }


    if (empty) {
      empty.hidden = documents.length !== 0;
    }


    if (!documents.length) {

      if (grid) {
        grid.hidden = false;

        grid.innerHTML = `
          <div
            class="empty-vault"
            style="grid-column:1/-1"
          >
            <div class="empty-icon">📂</div>

            <h3>
              Your vault is empty
            </h3>

            <p>
              Upload your first academic document.
            </p>
          </div>
        `;
      }

      return;
    }


    if (!filtered.length) {

      if (grid) {

        grid.hidden = false;

        grid.innerHTML = `
          <div
            class="empty-vault"
            style="grid-column:1/-1"
          >
            <div class="empty-icon">🔎</div>

            <h3>
              No matching documents
            </h3>

            <p>
              Try another search or category.
            </p>
          </div>
        `;

      }

      return;
    }


    grid.hidden = false;


    grid.innerHTML = filtered
      .map(item => `

        <article class="document-card">

          <div class="doc-icon">
            ${typeIcon(item.fileType)}
          </div>

          <div
            class="doc-name"
            title="${escapeHTML(item.name)}"
          >
            ${escapeHTML(item.name)}
          </div>

          <div class="doc-meta">

            <span class="doc-tag">
              ${escapeHTML(
                categoryName(item.category)
              )}
            </span>

            <span>
              ${formatSize(item.fileSize || 0)}
            </span>

            <span>
              ${escapeHTML(item.dateLabel)}
            </span>

          </div>

          <div class="doc-actions">

            <button
              type="button"
              data-action="preview"
              data-id="${item.id}"
            >
              Preview
            </button>

            <button
              type="button"
              data-action="download"
              data-id="${item.id}"
            >
              Download
            </button>

            <button
              type="button"
              class="delete"
              data-action="delete"
              data-id="${item.id}"
            >
              Delete
            </button>

          </div>

        </article>

      `)
      .join("");


    grid
      .querySelectorAll("[data-action]")
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            const item =
              documents.find(
                document =>
                  document.id === button.dataset.id
              );


            if (!item) return;


            if (
              button.dataset.action ===
              "preview"
            ) {
              previewDocument(item);
            }


            if (
              button.dataset.action ===
              "download"
            ) {
              downloadDocument(item);
            }


            if (
              button.dataset.action ===
              "delete"
            ) {
              removeDocument(item);
            }

          }
        );

      });

  }


  /* ==========================================================
     GOOGLE DRIVE CONNECTION
     ========================================================== */

  async function connectDrive() {

    const user = auth.currentUser;


    if (!user) {

      return showMessage(
        vaultMessage,
        "Please sign in before connecting Google Drive."
      );

    }


    setBusy(
      connectDriveBtn,
      true,
      "Connecting..."
    );


    setDriveStatus(
      "Opening Google authorization…",
      "warning"
    );


    try {

      const folder =
        await window.SAVDrive.connect();


      connectDriveBtn.textContent =
        "Google Drive Connected ✓";


      connectDriveBtn.classList.add(
        "connected"
      );


      setDriveStatus(
        `Your Vault documents are stored in your Google Drive folder: ${
          folder.name ||
          "Student Academic Vault"
        }.`,
        "success"
      );


      showMessage(
        vaultMessage,
        "Google Drive connected successfully. Your documents will stay with your Google account.",
        "success"
      );


    } catch (error) {

      console.error(
        "Drive connection error:",
        error
      );


      const message =
        /not configured/i.test(
          error.message || ""
        )

          ? "Google Drive is not configured yet. Add your Web OAuth Client ID to google-drive.js."

          : /popup|cancel|access_denied/i.test(
              error.message || ""
            )

          ? "Google Drive authorization was canceled. Connect again when you are ready."

          : "We couldn't connect Google Drive. Check your Google Cloud OAuth setup and try again.";


      setDriveStatus(
        message,
        "error"
      );


      showMessage(
        vaultMessage,
        message
      );


    } finally {

      setBusy(
        connectDriveBtn,
        false
      );

    }

  }


  connectDriveBtn?.addEventListener(
    "click",
    connectDrive
  );


  /* ==========================================================
     PREVIEW
     ========================================================== */

  async function previewDocument(item) {

    try {

      if (!item.driveFileId) {
        throw new Error(
          "This document has no Google Drive file ID."
        );
      }


      await window.SAVDrive.previewFile(
        item.driveFileId,
        item.fileType,
        item.name
      );


    } catch (error) {

      console.error(
        "Preview error:",
        error
      );


      showMessage(
        vaultMessage,
        "We couldn't open that document. Please connect Google Drive and try again."
      );

    }

  }


  /* ==========================================================
     DOWNLOAD
     ========================================================== */

  async function downloadDocument(item) {

    try {

      if (!item.driveFileId) {
        throw new Error(
          "This document has no Google Drive file ID."
        );
      }


      await window.SAVDrive.downloadFile(
        item.driveFileId,
        item.originalName || item.name
      );


    } catch (error) {

      console.error(
        "Download error:",
        error
      );


      showMessage(
        vaultMessage,
        "We couldn't download that document. Please connect Google Drive and try again."
      );

    }

  }


  /* ==========================================================
     DELETE
     ========================================================== */

  async function removeDocument(item) {

    if (
      !confirm(
        `Delete “${item.name}” from your vault and Google Drive?`
      )
    ) {
      return;
    }


    const user = auth.currentUser;


    try {

      if (item.driveFileId) {

        await window.SAVDrive.deleteFile(
          item.driveFileId
        );

      }


      await db
        .collection("students")
        .doc(user.uid)
        .collection("documents")
        .doc(item.id)
        .delete();


      showMessage(
        vaultMessage,
        "Document deleted from your vault and Google Drive.",
        "success"
      );


    } catch (error) {

      console.error(
        "Delete error:",
        error
      );


      showMessage(
        vaultMessage,
        error.code === "permission-denied"

          ? "You do not have permission to delete this document."

          : "We couldn't delete that document. Please try again."
      );

    }

  }


  /* ==========================================================
     SEARCH + CATEGORY FILTER
     ========================================================== */

  search?.addEventListener(
    "input",
    renderDocuments
  );


  category?.addEventListener(
    "change",
    renderDocuments
  );


  /* ==========================================================
     MULTI-FILE UPLOAD
     ========================================================== */

  uploadForm?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const user = auth.currentUser;


      if (!user || !user.emailVerified) {

        return showMessage(
          vaultMessage,
          "Please sign in with a verified account before uploading."
        );

      }


      if (!window.SAVDrive) {

        return showMessage(
          vaultMessage,
          "Google Drive is not available. Reload the page and try again."
        );

      }


      const categoryValue =
        $("documentCategory")?.value ||
        "other";


      /*
       * IMPORTANT:
       * We now take ALL selected files.
       * We no longer use files[0].
       */

      const files =
        Array.from(
          fileInput?.files || []
        );


      clearErrors([
        "documentName"
      ]);


      showMessage(
        vaultMessage,
        ""
      );


      if (!files.length) {

        return showMessage(
          vaultMessage,
          "Choose one or more documents to upload."
        );

      }


      /* ======================================================
         VALIDATE EVERY FILE BEFORE UPLOADING ANYTHING
         ====================================================== */

      const invalidFiles = [];


      files.forEach(file => {

        if (!allowedTypes.includes(file.type)) {

          invalidFiles.push(
            `${file.name} — unsupported file type`
          );

        } else if (
          file.size > MAX_FILE_BYTES
        ) {

          invalidFiles.push(
            `${file.name} — larger than 25 MB`
          );

        }

      });


      if (invalidFiles.length) {

        return showMessage(
          vaultMessage,
          `Please fix these files before uploading:\n${invalidFiles.join("\n")}`
        );

      }


      const button =
        $("uploadBtn");


      setBusy(
        button,
        true,
        "Uploading..."
      );


      progress.hidden = false;

      progressBar.style.width =
        "0%";


      progressText.textContent =
        `Preparing ${files.length} document${files.length === 1 ? "" : "s"}...`;


      let uploadedCount = 0;

      const failedFiles = [];


      try {

        /*
         * Upload sequentially.
         *
         * This is intentional:
         * 1. It keeps memory usage lower.
         * 2. It makes progress easier to understand.
         * 3. It is friendlier to mobile devices.
         */

        for (
          let index = 0;
          index < files.length;
          index++
        ) {

          const file =
            files[index];


          const documentNumber =
            index + 1;


          progressBar.style.width =
            "0%";


          progressText.textContent =
            `Uploading ${documentNumber} of ${files.length}: ${file.name}`;


          try {

            /*
             * Use the filename automatically.
             *
             * Example:
             *
             * WAEC Certificate.pdf
             *
             * becomes:
             *
             * WAEC Certificate
             */

            const documentName =
              file.name.replace(
                /\.[^/.]+$/,
                ""
              ).trim() ||
              file.name;


            const docRef =
              db
                .collection("students")
                .doc(user.uid)
                .collection("documents")
                .doc();


            const driveFile =
              await window.SAVDrive.uploadFile(
                file,
                documentName,
                categoryValue,
                (percent, text) => {

                  /*
                   * Overall progress:
                   *
                   * Each completed file = one unit.
                   * Current file contributes its percentage.
                   */

                  const overallPercent =
                    Math.round(
                      (
                        (index / files.length) * 100
                      ) +
                      (
                        percent / files.length
                      )
                    );


                  progressBar.style.width =
                    `${overallPercent}%`;


                  progressText.textContent =
                    text
                      ? `Document ${documentNumber} of ${files.length}: ${text}`
                      : `Uploading document ${documentNumber} of ${files.length} — ${percent}%`;

                }
              );


            /*
             * Save this file as its own Firestore document.
             */

            await docRef.set({

              ownerId:
                user.uid,

              name:
                documentName,

              originalName:
                file.name,

              category:
                categoryValue,

              fileType:
                file.type,

              fileSize:
                file.size,

              driveFileId:
                driveFile.id,

              driveFileName:
                driveFile.name,

              driveMimeType:
                driveFile.mimeType,

              driveCreatedTime:
                driveFile.createdTime ||
                null,

              driveWebViewLink:
                driveFile.webViewLink ||
                null,

              storageProvider:
                "google-drive",

              createdAt:
                firebase.firestore.FieldValue.serverTimestamp(),

              updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()

            });


            uploadedCount++;


          } catch (fileError) {

            console.error(
              `Upload failed for ${file.name}:`,
              fileError
            );


            failedFiles.push({
              name: file.name,
              error: fileError
            });

          }

        }


        /* ======================================================
           FINAL RESULT
           ====================================================== */

        progressBar.style.width =
          "100%";


        if (
          uploadedCount === files.length
        ) {

          progressText.textContent =
            `Completed — ${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded.`;


          showMessage(
            vaultMessage,
            `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} successfully saved to your Google Drive.`,
            "success"
          );


          setDriveStatus(
            "Your Vault documents are stored in your Google Drive.",
            "success"
          );


        } else if (
          uploadedCount > 0
        ) {

          progressText.textContent =
            `Completed with ${uploadedCount} of ${files.length} uploaded.`;


          const failedNames =
            failedFiles
              .map(item => item.name)
              .join(", ");


          showMessage(
            vaultMessage,
            `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded successfully. ${failedFiles.length} failed: ${failedNames}`,
            "warning"
          );


        } else {

          progressText.textContent =
            "No documents were uploaded.";


          showMessage(
            vaultMessage,
            "None of the selected documents could be uploaded. Please try again."
          );

        }


        /*
         * Reset only after the batch is finished.
         */

        uploadForm.reset();


        if (fileLabel) {

          fileLabel.textContent =
            "Choose multiple PDF, JPG or PNG files";

        }


        if (fileMeta) {

          fileMeta.textContent =
            "Maximum 25 MB per file";

        }


        /*
         * Close modal shortly after successful upload.
         */

        if (uploadedCount > 0) {

          setTimeout(() => {

            progress.hidden = true;

            closeUpload();

          }, 900);

        } else {

          progress.hidden = true;

        }


      } catch (error) {

        console.error(
          "Multi-file Google Drive upload error:",
          error
        );


        const message =
          /not configured/i.test(
            error.message || ""
          )

            ? "Google Drive is not configured yet. Add your Web OAuth Client ID to google-drive.js."

            : /403|insufficient|permission/i.test(
                error.message || ""
              )

            ? "Google Drive denied this action. Check that the Drive API is enabled and the OAuth account has granted access."

            : "We couldn't save the selected documents to Google Drive. Please connect Google Drive and try again.";


        showMessage(
          vaultMessage,
          message
        );


        progress.hidden = true;


      } finally {

        setBusy(
          button,
          false,
          "Save documents"
        );

      }

    }
  );


  /* ==========================================================
     FIRESTORE DOCUMENT LISTENER
     ========================================================== */

  auth.onAuthStateChanged(
    async user => {

      if (unsubscribeDocuments) {

        unsubscribeDocuments();

        unsubscribeDocuments = null;

      }


      if (!user) return;


      await user.reload();


      if (!user.emailVerified) return;


      /* ------------------------------------------------------
         CHECK GOOGLE DRIVE CONNECTION
         ------------------------------------------------------ */

      try {

        const connection =
          await window.SAVDrive.getConnection(
            user
          );


        if (connection.connected) {

          connectDriveBtn.textContent =
            "Google Drive Connected ✓";


          connectDriveBtn.classList.add(
            "connected"
          );


          setDriveStatus(
            "Your Vault documents are stored in your Google Drive.",
            "success"
          );


        } else {

          connectDriveBtn.textContent =
            "Connect Google Drive";


          connectDriveBtn.classList.remove(
            "connected"
          );

        }


      } catch (error) {

        console.warn(
          "Drive status check failed:",
          error
        );

      }


      /* ------------------------------------------------------
         FIRESTORE QUERY
         ------------------------------------------------------ */

      const q =
        db
          .collection("students")
          .doc(user.uid)
          .collection("documents");


      unsubscribeDocuments =
        q.onSnapshot(

          snapshot => {

            documents =
              snapshot.docs

                .map(snap => {

                  const data =
                    snap.data();


                  const date =
                    data.createdAt?.toDate

                      ? data.createdAt.toDate()

                      : data.driveCreatedTime

                      ? new Date(
                          data.driveCreatedTime
                        )

                      : null;


                  return {

                    id:
                      snap.id,

                    ...data,

                    dateLabel:
                      date

                        ? date.toLocaleDateString(
                            undefined,
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric"
                            }
                          )

                        : "Just now"

                  };

                })


                .sort(
                  (a, b) =>
                    (
                      a.createdAt?.toMillis?.() ||
                      new Date(
                        a.driveCreatedTime || 0
                      ).getTime() ||
                      0
                    )
                    -
                    (
                      b.createdAt?.toMillis?.() ||
                      new Date(
                        b.driveCreatedTime || 0
                      ).getTime() ||
                      0
                    )
                );


            /*
             * Newest first.
             */

            documents.reverse();


            renderDocuments();

          },


          error => {

            console.error(
              "Vault listener error:",
              error
            );


            showMessage(
              vaultMessage,

              error.code === "permission-denied"

                ? "Firestore denied access to your vault. Publish the included firestore.rules."

                : "We couldn't load your vault right now. Please try again."
            );

          }

        );

    }
  );

}

})();
