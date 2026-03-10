import './globals.css'

export const metadata = {
  title: 'BFC Volunteers',
  description: 'Volunteer Management Platform',
  icons: {
    icon: '/logo.jpg',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
