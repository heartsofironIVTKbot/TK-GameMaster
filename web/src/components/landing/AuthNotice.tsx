"use client";

import { useEffect, useState } from "react";

/**
 * "Discord sign-in didn't complete": the login sends people to /?auth=error.
 * Read in the browser so the front page itself stays pre-rendered.
 */
export default function AuthNotice() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // The address is only known in the browser; read it once after load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(new URLSearchParams(window.location.search).get("auth") === "error");
  }, []);
  if (!failed) return null;
  return (
    <p role="status" className="gm-cut mt-6 max-w-lg border border-rose-400/40 bg-rose-950/60 px-4 py-2.5 text-sm text-rose-200">
      Discord sign-in didn&apos;t complete. Press Log in to try again.
    </p>
  );
}
