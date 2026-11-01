"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect, type ReactNode } from "react";

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Bersihkan Service Worker lama dari proyek lain pada localhost saat mode development
    if (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const reg of registrations) {
            void reg.unregister();
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <SessionProvider
      // Refresh sesi setiap 15 menit saat tab aktif membaca agar cookie token Google tetap segar
      refetchInterval={15 * 60}
      refetchOnWindowFocus={true}
    >
      {children}
    </SessionProvider>
  );
}

