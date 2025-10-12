// api/send-email-otp.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as admin from "firebase-admin";
import sgMail from "@sendgrid/mail";
import crypto from "crypto";

if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.SENDGRID_API_KEY || !process.env.OTP_HMAC_SECRET || !process.env.FROM_EMAIL) {
  console.error("Missing required env vars for email OTP.");
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),
  });
}
const db = admin.firestore();

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const OTP_TTL_SEC = 5 * 60; // 5 minutes
const MAX_OTPS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function hmacCode(code: string) {
  return crypto.createHmac("sha256", process.env.OTP_HMAC_SECRET!).update(code).digest("hex");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).send({ error: "Method not allowed" });

  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") return res.status(400).send({ error: "Missing email" });

  const ip = (req.headers["x-forwarded-for"] || req.connection.remoteAddress || "").toString();

  try {
    // Rate limit: check number of OTPs created for this email in the last hour
    const oneHourAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);
    const recent = await db
      .collection("emailOtps")
      .where("email", "==", email)
      .where("createdAt", ">", oneHourAgo)
      .get();

    if (recent.size >= MAX_OTPS_PER_HOUR) {
      return res.status(429).send({ error: "Too many OTP requests for this email. Try later." });
    }

    // generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // store HMAC in Firestore with expiry
    const now = admin.firestore.Timestamp.now();
    const docRef = db.collection("emailOtps").doc();
    await docRef.set({
      email,
      hmac: hmacCode(code),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_SEC * 1000),
      attempts: 0,
      used: false,
      createdAt: now,
      ip,
    });

    // send email via SendGrid
    const msg = {
      to: email,
      from: process.env.FROM_EMAIL!, // verified sender
      subject: "Your one-time verification code",
      text: `Your verification code is: ${code}. It will expire in ${Math.floor(OTP_TTL_SEC/60)} minutes.`,
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>Expires in ${Math.floor(OTP_TTL_SEC/60)} minutes.</p>`,
    };
    await sgMail.send(msg);

    return res.status(200).json({ ok: true, message: "OTP sent" });
  } catch (err: any) {
    console.error("send-email-otp error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

