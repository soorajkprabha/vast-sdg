// Paste your Firebase web app config here (Firebase console → Project settings → Your apps → Web app).
// Until it is filled in, the public site shows the sample data in data/*.json and admin.html is disabled.
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const configured = !firebaseConfig.apiKey.startsWith("YOUR_");
