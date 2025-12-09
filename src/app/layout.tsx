export const metadata = {
  title: 'Mahana MCP Server',
  description: 'MCP Server for ElevenLabs Voice Agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
