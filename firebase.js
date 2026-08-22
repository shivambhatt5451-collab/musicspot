import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp,
    query,
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL, 
    deleteObject 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// Your exact Firebase Web App configuration
const firebaseConfig = {
    apiKey: "AIzaSyDi4TKAcdqFHkOBDQb4e4buqYFpoUwMzu4",
    authDomain: "musicspot-7bf21.firebaseapp.com",
    projectId: "musicspot-7bf21",
    storageBucket: "musicspot-7bf21.firebasestorage.app",
    messagingSenderId: "209193715231",
    appId: "1:209193715231:web:144913b504e6ffa748772a"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore and Storage targeting your bucket
export const db = getFirestore(app);
export const storage = getStorage(app, "gs://musicspot-7bf21.firebasestorage.app");

// Firestore modular exports
export { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp,
    query,
    orderBy 
};

// Storage modular exports
export { 
    ref, 
    uploadBytes, 
    getDownloadURL, 
    deleteObject 
};