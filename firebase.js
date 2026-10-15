import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import * as fs from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import * as au from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import * as st from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = fs.getFirestore(app);
export const auth = au.getAuth(app);
export const storage = st.getStorage(app);
export { fs, au, st };
