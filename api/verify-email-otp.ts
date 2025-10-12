// api/verify-email-otp.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as admin from "firebase-admin";
import crypto from "crypto";

if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.OTP_HMAC_SECRET) {
  console.error("Missing required env vars for verify endpoint.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),
  });
}
const db = admin.firestore();

const MAX_VERIFY_ATTEMPTS = 5;

function hmacCode(code: string) {
  return crypto.createHmac("sha256", process.env.OTP_HMAC_SECRET!).update(code).digest("hex");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send({ error: "Method not allowed" });

  const { email, code } = req.body ?? {};
  if (!email || !code) return res.status(400).send({ error: "Missing email or code" });

  try {
    // fetch the most recent, unused OTP doc for this email
    const now = admin.firestore.Timestamp.now();
    const snap = await db
      .collection("emailOtps")
      .where("email", "==", email)
      .where("used", "==", false)
      .where("expiresAt", ">", now)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (snap.empty) return res.status(400).json({ error: "No valid OTP found (expired or not requested)" });

    const doc = snap.docs[0];
    const data = doc.data() as any;

    if (data.attempts >= MAX_VERIFY_ATTEMPTS) {
      return res.status(429).json({ error: "Too many verification attempts" });
    }

    const incomingHmac = hmacCode(String(code));
    if (incomingHmac !== data.hmac) {
      // increment attempts
      await doc.ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      return res.status(400).json({ error: "Invalid code" });
    }

    // mark as used
    await doc.ref.update({ used: true, usedAt: admin.firestore.Timestamp.now() });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("verify-email-otp error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

