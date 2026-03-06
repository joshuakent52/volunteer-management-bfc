import './globals.css'

export const metadata = {
  title: 'VolunteerHub',
  description: 'Volunteer Management Platform',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
