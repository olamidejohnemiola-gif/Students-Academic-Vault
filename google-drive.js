/* ==========================================================
   STUDENT ACADEMIC VAULT
   GOOGLE DRIVE STORAGE LAYER

   Uses:
   - Google Identity Services OAuth
   - Google Drive API
   - drive.file scope

   Files are stored inside the student's own
   Google Drive account.

   Firebase is used only for:
   - Student authentication
   - Student metadata
   - Drive folder ID
   ========================================================== */

(() => {
  "use strict";

  /* ========================================================
     CONFIGURATION
     ======================================================== */

  const CLIENT_ID =
    "3849013370-d2fk4ciqc9mu0tdbcie80uhc5s4dmovl.apps.googleusercontent.com";

  const DRIVE_SCOPE =
    "https://www.googleapis.com/auth/drive.file";

  const DRIVE_API =
    "https://www.googleapis.com/drive/v3";

  const UPLOAD_API =
    "https://www.googleapis.com/upload/drive/v3";

  const FOLDER_NAME =
    "Student Academic Vault";


  /* ========================================================
     STATE
     ======================================================== */

  let tokenClient = null;
  let accessToken = null;
  let initialized = false;
  let gisPromise = null;


  /* ========================================================
     LOAD GOOGLE IDENTITY SERVICES
     ======================================================== */

  function loadGIS() {

    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }

    if (gisPromise) {
      return gisPromise;
    }

    gisPromise = new Promise((resolve, reject) => {

      const timeout = setTimeout(() => {

        reject(
          new Error(
            "Google Identity Services did not become available. " +
            "Please check your internet connection and try again."
          )
        );

      }, 10000);


      const checkGoogle = () => {

        if (window.google?.accounts?.oauth2) {

          clearTimeout(timeout);

          resolve();

          return true;
        }

        return false;
      };


      /* Check immediately */

      if (checkGoogle()) {
        return;
      }


      /* Check repeatedly because TrebEdit/WebView
         may load external scripts slightly later. */

      const interval = setInterval(() => {

        if (checkGoogle()) {

          clearInterval(interval);

        }

      }, 100);


      /* Look for the Google GIS script */

      const existingScript =
        document.querySelector(
          'script[src="https://accounts.google.com/gsi/client"]'
        );


      if (existingScript) {

        existingScript.addEventListener(
          "load",
          () => {

            if (checkGoogle()) {

              clearInterval(interval);

            }

          },
          { once: true }
        );


        existingScript.addEventListener(
          "error",
          () => {

            clearInterval(interval);

            clearTimeout(timeout);

            reject(
              new Error(
                "Google Identity Services script failed to load."
              )
            );

          },
          { once: true }
        );


        return;
      }


      /* If the script wasn't already added,
         add it ourselves. */

      const script =
        document.createElement("script");

      script.src =
        "https://accounts.google.com/gsi/client";

      script.async = true;
      script.defer = true;


      script.onload = () => {

        if (checkGoogle()) {

          clearInterval(interval);

        }

      };


      script.onerror = () => {

        clearInterval(interval);

        clearTimeout(timeout);

        reject(
          new Error(
            "Google Identity Services could not load."
          )
        );

      };


      document.head.appendChild(script);

    });

    return gisPromise;
  }


  /* ========================================================
     INITIALIZE GOOGLE DRIVE
     ======================================================== */

  async function init() {

    if (initialized && tokenClient) {
      return true;
    }


    await loadGIS();


    if (!window.google?.accounts?.oauth2) {

      throw new Error(
        "Google Identity Services is not available."
      );

    }


    tokenClient =
      window.google.accounts.oauth2.initTokenClient({

        client_id: CLIENT_ID,

        scope: DRIVE_SCOPE,

        callback: () => {}

      });


    initialized = true;


    console.log(
      "Student Academic Vault: Google Drive initialized successfully."
    );


    return true;
  }


  /* ========================================================
     GET GOOGLE ACCESS TOKEN
     ======================================================== */

  async function getToken(interactive = true) {

    await init();


    if (accessToken) {
      return accessToken;
    }


    return new Promise((resolve, reject) => {

      tokenClient.callback = (response) => {

        if (!response) {

          reject(
            new Error(
              "Google returned an empty authorization response."
            )
          );

          return;
        }


        if (response.error) {

          reject(
            new Error(
              response.error_description ||
              response.error ||
              "Google authorization failed."
            )
          );

          return;
        }


        if (!response.access_token) {

          reject(
            new Error(
              "Google did not return an access token."
            )
          );

          return;
        }


        accessToken =
          response.access_token;


        resolve(accessToken);

      };


      try {

        tokenClient.requestAccessToken({

          prompt:
            interactive
              ? "consent"
              : ""

        });

      } catch (error) {

        reject(error);

      }

    });

  }


  /* ========================================================
     GOOGLE DRIVE API HELPER
     ======================================================== */

  async function api(path, options = {}) {

    const token =
      await getToken(
        options.interactive !== false
      );


    const headers =
      new Headers(
        options.headers || {}
      );


    headers.set(
      "Authorization",
      `Bearer ${token}`
    );


    const response =
      await fetch(
        `${DRIVE_API}${path}`,
        {
          ...options,
          headers
        }
      );


    if (response.status === 401) {

      accessToken = null;

      throw new Error(
        "Google Drive authorization expired. Please connect again."
      );

    }


    if (!response.ok) {

      let detail = "";

      try {

        detail =
          await response.text();

      } catch (_) {}


      throw new Error(
        `Google Drive request failed (${response.status}). ${detail}`
      );

    }


    return response;
  }


  /* ========================================================
     ENSURE STUDENT VAULT FOLDER
     ======================================================== */

  async function ensureVaultFolder(user) {

    if (!user) {

      throw new Error(
        "You must be signed in before connecting Google Drive."
      );

    }


    if (!window.SAV?.db) {

      throw new Error(
        "Firebase Firestore is not ready."
      );

    }


    const ref =
      window.SAV.db
        .collection("students")
        .doc(user.uid);


    const snap =
      await ref.get();


    const data =
      snap.exists
        ? snap.data()
        : {};


    /* ======================================================
       REUSE EXISTING FOLDER
       ====================================================== */

    if (data.driveFolderId) {

      try {

        const response =
          await api(
            `/files/${encodeURIComponent(
              data.driveFolderId
            )}?fields=id,name,mimeType,trashed`,
            {
              interactive: false
            }
          );


        const folder =
          await response.json();


        if (
          folder.id &&
          folder.mimeType ===
            "application/vnd.google-apps.folder" &&
          !folder.trashed
        ) {

          await ref.set(

            {
              driveConnected: true,

              driveFolderName:
                folder.name ||
                FOLDER_NAME,

              updatedAt:
                firebase.firestore
                  .FieldValue
                  .serverTimestamp()

            },

            {
              merge: true
            }

          );


          return folder;

        }

      } catch (error) {

        console.warn(
          "Existing Drive folder could not be reused.",
          error
        );

      }

    }


    /* ======================================================
       CREATE NEW FOLDER
       ====================================================== */

    const createResponse =
      await api(
        "/files?fields=id,name,mimeType,webViewLink",
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            name:
              FOLDER_NAME,

            mimeType:
              "application/vnd.google-apps.folder"

          })

        }
      );


    const folder =
      await createResponse.json();


    await ref.set(

      {

        driveConnected: true,

        driveFolderId:
          folder.id,

        driveFolderName:
          folder.name ||
          FOLDER_NAME,

        driveConnectedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp(),

        updatedAt:
          firebase.firestore
            .FieldValue
            .serverTimestamp()

      },

      {
        merge: true
      }

    );


    return folder;

  }


  /* ========================================================
     CONNECT GOOGLE DRIVE
     ======================================================== */

  async function connect() {

    const user =
      window.SAV?.auth?.currentUser;


    if (!user) {

      throw new Error(
        "Please sign in first."
      );

    }


    await getToken(true);


    return ensureVaultFolder(user);

  }


  /* ========================================================
     GET CONNECTION STATUS
     ======================================================== */

  async function getConnection(user) {

    if (!user) {

      return {
        connected: false,
        folderId: null,
        folderName: FOLDER_NAME
      };

    }


    if (!window.SAV?.db) {

      return {
        connected: false,
        folderId: null,
        folderName: FOLDER_NAME
      };

    }


    const snap =
      await window.SAV.db
        .collection("students")
        .doc(user.uid)
        .get();


    const data =
      snap.exists
        ? snap.data()
        : {};


    return {

      connected:
        Boolean(
          data.driveConnected &&
          data.driveFolderId
        ),

      folderId:
        data.driveFolderId ||
        null,

      folderName:
        data.driveFolderName ||
        FOLDER_NAME

    };

  }


  /* ========================================================
     BUILD MULTIPART UPLOAD
     ======================================================== */

  function buildMultipartBody(
    metadata,
    file,
    boundary
  ) {

    const encoder =
      new TextEncoder();


    const head =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;


    const tail =
      `\r\n--${boundary}--`;


    const a =
      encoder.encode(head);


    const b =
      encoder.encode(tail);


    return new Blob(
      [
        a,
        file,
        b
      ],
      {
        type:
          `multipart/related; boundary=${boundary}`
      }
    );

  }


  /* ========================================================
     UPLOAD FILE
     ======================================================== */

  async function uploadFile(
    file,
    displayName,
    category,
    onProgress
  ) {

    const user =
      window.SAV?.auth?.currentUser;


    if (!user) {

      throw new Error(
        "Please sign in first."
      );

    }


    if (!file) {

      throw new Error(
        "Please select a file."
      );

    }


    const folder =
      await ensureVaultFolder(user);


    onProgress?.(
      10,
      "Preparing your Google Drive upload..."
    );


    const boundary =
      `sav_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}`;


    const metadata = {

      name:
        displayName,

      parents:
        [folder.id],

      description:
        `Student Academic Vault document. ` +
        `Category: ${category}. ` +
        `Owner UID: ${user.uid}`

    };


    const body =
      buildMultipartBody(
        metadata,
        file,
        boundary
      );


    const token =
      await getToken(false);


    const response =
      await fetch(

        `${UPLOAD_API}/files` +
        `?uploadType=multipart` +
        `&fields=id,name,mimeType,size,createdTime,webViewLink,parents`,

        {

          method: "POST",

          headers: {

            Authorization:
              `Bearer ${token}`,

            "Content-Type":
              `multipart/related; boundary=${boundary}`

          },

          body

        }

      );


    if (!response.ok) {

      if (response.status === 401) {

        accessToken = null;

      }


      let detail = "";

      try {

        detail =
          await response.text();

      } catch (_) {}


      throw new Error(
        `Google Drive upload failed (${response.status}). ${detail}`
      );

    }


    onProgress?.(
      100,
      "Saved to Google Drive."
    );


    return response.json();

  }


  /* ========================================================
     DOWNLOAD FILE
     ======================================================== */

  async function downloadFile(
    fileId,
    filename
  ) {

    const response =
      await api(

        `/files/${encodeURIComponent(
          fileId
        )}?alt=media`,

        {
          interactive: false
        }

      );


    const blob =
      await response.blob();


    const url =
      URL.createObjectURL(blob);


    const link =
      document.createElement("a");


    link.href =
      url;


    link.download =
      filename ||
      "document";


    document.body.appendChild(link);

    link.click();

    link.remove();


    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );

  }


  /* ========================================================
     PREVIEW FILE
     ======================================================== */

  async function previewFile(
    fileId,
    mimeType,
    title
  ) {

    const response =
      await api(

        `/files/${encodeURIComponent(
          fileId
        )}?alt=media`,

        {
          interactive: false
        }

      );


    const blob =
      await response.blob();


    const url =
      URL.createObjectURL(blob);


    const content =
      document.getElementById(
        "previewContent"
      );


    if (!content) {

      return;

    }


    const safeTitle =
      String(
        title ||
        "Document"
      ).replace(
        /[&<>'"]/g,
        ""
      );


    if (
      mimeType ===
      "application/pdf"
    ) {

      content.innerHTML =
        `<iframe
          src="${url}#toolbar=1"
          title="${safeTitle}">
        </iframe>`;

    } else {

      content.innerHTML =
        `<img
          src="${url}"
          alt="${safeTitle}">`;

    }


    const modal =
      document.getElementById(
        "previewModal"
      );


    if (modal) {

      modal.hidden = false;

      document.body.classList.add(
        "modal-open"
      );

    }


    setTimeout(
      () =>
        URL.revokeObjectURL(url),
      5 * 60 * 1000
    );

  }


  /* ========================================================
     DELETE FILE
     ======================================================== */

  async function deleteFile(
    fileId
  ) {

    if (!fileId) {

      return;

    }


    await api(

      `/files/${encodeURIComponent(
        fileId
      )}`,

      {

        method:
          "DELETE",

        interactive:
          false

      }

    );

  }


  /* ========================================================
     PUBLIC API
     ======================================================== */

  window.SAVDrive = {

    init,

    connect,

    getConnection,

    uploadFile,

    downloadFile,

    previewFile,

    deleteFile

  };


  /* ========================================================
     AUTO INITIALIZATION
     ======================================================== */

  window.addEventListener(
    "load",
    () => {

      init()
        .then(() => {

          console.log(
            "Student Academic Vault: Google Drive is ready."
          );

        })
        .catch((error) => {

          console.error(
            "Student Academic Vault: Google Drive initialization failed.",
            error
          );

        });

    }
  );

})();