import { initializeApp } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  databaseURL: "https://pm-prototype-a75ce-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pm-prototype-a75ce",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export async function fetchUserData(phone) {
  try {
    const snapshot = await get(ref(db, `users/${phone}`));
    if (snapshot.exists()) {
      return { success: true, data: snapshot.val() };
    }
    return { success: false, error: "找不到此手機號碼的會員資料" };
  } catch (e) {
    return { success: false, error: "連線失敗，請稍後再試" };
  }
}
