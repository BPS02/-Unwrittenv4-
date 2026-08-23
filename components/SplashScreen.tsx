"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * The root layout survives client-side navigation, so this naturally appears
 * once per app launch without interrupting someone as they move through pages.
 */
export default function SplashScreen() {
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const beginExit = window.setTimeout(() => setLeaving(true), 1450);
    const remove = window.setTimeout(() => setVisible(false), 1950);
    return () => {
      window.clearTimeout(beginExit);
      window.clearTimeout(remove);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`app-splash${leaving ? " is-leaving" : ""}`} aria-hidden="true">
      <div className="app-splash-glow" />
      <div className="app-splash-content">
        <Image
          className="app-splash-icon"
          src="/icons/icon-512.png"
          width={180}
          height={180}
          priority
          alt=""
        />
        <p className="app-splash-name">Un<span>written</span></p>
        <p className="app-splash-tagline">Your feelings, finally heard.</p>
      </div>
    </div>
  );
}
