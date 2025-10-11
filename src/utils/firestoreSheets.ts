import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebaseConfig";

export function subscribeToUserSheets(uid: string, cb: (data: any) => void) {
  const ref = doc(db, "workbooks", uid);
  return onSnapshot(ref, (snap) => cb(snap.data() ?? null));
}

export async function saveUserSheets(uid: string, payload: any) {
  const ref = doc(db, "workbooks", uid);
  await setDoc(ref, payload, { merge: true });
}

export async function getUserSheetsOnce(uid: string) {
  const ref = doc(db, "workbooks", uid);
  const docSnap = await getDoc(ref);
  return docSnap.exists() ? docSnap.data() : null;
}
