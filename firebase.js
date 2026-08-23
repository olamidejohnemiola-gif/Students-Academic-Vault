/* Student Academic Vault - Firebase bootstrap
   Firebase handles Authentication + Firestore.
   Student documents are stored in the student's Google Drive,
   NOT Firebase Storage.
*/

const firebaseConfig = {
  apiKey: "AIzaSyCN8AngLWxdcHw1znGfdowg0BoNrBKuk3k",
  authDomain: "student-academic-vault-web.firebaseapp.com",
  projectId: "student-academic-vault-web",
  storageBucket: "student-academic-vault-web.firebasestorage.app",
  messagingSenderId: "3849013370",
  appId: "1:3849013370:web:d87b7332c43834fd1393c3"
};

/* Initialize Firebase only once */
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

/* Firebase services used by Student Academic Vault */
window.SAV = {
  auth: firebase.auth(),
  db: firebase.firestore()
};

console.log("Student Academic Vault: Firebase initialized successfully.");