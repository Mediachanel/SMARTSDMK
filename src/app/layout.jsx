import "./globals.css";

export const metadata = {
  title: "SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta",
  applicationName: "SMART SDMK Dinas Kesehatan Provinsi DKI Jakarta",
  description:
    "Aplikasi internal pengelolaan data pegawai Dinas Kesehatan Provinsi DKI Jakarta",
  robots: "noindex, nofollow, noarchive, nosnippet, noimageindex",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#2563eb" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ("serviceWorker" in navigator) {
                window.addEventListener("load", function () {
                  navigator.serviceWorker.getRegistrations().then(function (registrations) {
                    registrations.forEach(function (registration) {
                      registration.unregister();
                    });
                  });
                  if ("caches" in window) {
                    caches.keys().then(function (keys) {
                      keys.forEach(function (key) {
                        caches.delete(key);
                      });
                    });
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
