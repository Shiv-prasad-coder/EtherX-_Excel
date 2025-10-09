import React, { useEffect, useState } from "react";
import exLogo from "../assets/ex_logo.png";     // Big EX logo
import logoDark from "../assets/logo_Dark.png"; // Small logo for dark mode
import logoLight from "../assets/logo_Light.png"; // Small logo for light mode (⚡ add this image)

interface SplashScreenProps {
  theme: "light" | "dark";
}

export default function SplashScreen({ theme }: SplashScreenProps) {
  const isDark = theme === "dark";
  const bg = isDark ? "#000000" : "#ffffff"; // full white for light mode
  const text = isDark ? "#ffffff" : "#0f172a";
  const glowColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.3)";

  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        background: bg,
        color: text,
        fontFamily: "Inter, sans-serif",
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.8s ease-in-out",
      }}
    >
      {/* Main big logo */}
      <img
        src={exLogo}
        alt="EtherX Logo Large"
        draggable={false}
        style={{
          width: 160,
          height: 160,
          objectFit: "contain",
          animation: "pop 0.9s ease-out",
        }}
      />

      {/* Small logo beside EtherX text */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 18,
          animation: "fadeIn 1.1s 0.3s ease both",
        }}
      >
        <img
          src={isDark ? logoDark : logoLight} // ✅ theme-based small logo
          alt="EtherX Small Logo"
          draggable={false}
          style={{
            width: 54,
            height: 54,
            objectFit: "contain",
            animation: "tilt 1.6s ease-in-out 0.6s both",
          }}
        />
        <span
          style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: 0.6,
            textShadow: `0 0 12px ${glowColor}`,
            animation: "glowPulse 2.4s ease-in-out infinite alternate",
          }}
        >
          EtherX
        </span>
      </div>

      <style>
        {`
          @keyframes pop {
            from {
              transform: scale(0.9);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes glowPulse {
            0% {
              text-shadow: 0 0 8px ${glowColor}, 0 0 16px ${glowColor};
              opacity: 0.9;
            }
            100% {
              text-shadow: 0 0 20px ${glowColor}, 0 0 35px ${glowColor};
              opacity: 1;
            }
          }

          @keyframes tilt {
            0%   { transform: rotate(0deg) scale(0.9); opacity: 0; }
            25%  { transform: rotate(-15deg) scale(1.05); opacity: 1; }
            50%  { transform: rotate(10deg) scale(1); }
            75%  { transform: rotate(-5deg); }
            100% { transform: rotate(0deg); }
          }
        `}
      </style>
    </div>
  );
}
