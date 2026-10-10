import '@/styles/globals.css';
import AppLayout from '@/components/AppLayout';

export const metadata = {
  title: 'TiniTraker — Timeline of care',
  description: 'Maternal and immunization care tracking system for hospitals',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var raw = localStorage.getItem('tinitraker_theme_pref');
                  var theme = 'light';
                  if (raw) {
                    var parsed = JSON.parse(raw);
                    if (parsed && parsed.state && parsed.state.theme) {
                      theme = parsed.state.theme;
                    } else if (typeof parsed === 'string') {
                      theme = parsed;
                    }
                  }
                  document.documentElement.setAttribute('data-theme', theme);
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
