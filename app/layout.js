import './globals.css'

export const metadata = {
  title: 'BFC Volunteer Portal',
  description: 'Volunteer Portal for Bingham Family Clinic',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Portal',
  },
  icons: {
    icon: '/logo2.png',
    apple: '/logo2.png',
  },
}

export const viewport = {
  themeColor: '#02416b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BFC" />
        <link rel="apple-touch-icon" href="/logo.jpg" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function() { console.log('SW registered'); })
                    .catch(function(err) { console.log('SW failed: ', err); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
