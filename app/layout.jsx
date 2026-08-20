import "./globals.css";

export const metadata = {
  title: "Radar Prospect — trouvez vos prochains clients autour de vous",
  description:
    "Repérez les commerces autour d'une adresse et obtenez, pour chacun, une analyse et un argumentaire de vente sur mesure.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
