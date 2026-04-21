
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TRPCReactProvider } from "@/lib/trpc/client"



export const metadata = {
  title: "Catty - Dashboard",
  description: "Catty SMS - Management Dashboard",
}

export const viewport = {
  width: 'device-width',
  initialScale: 1
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Meta viewport is handled by Next.js viewport export */}
      </head>
      <body >
        <TRPCReactProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </TRPCReactProvider>
      </body>
    </html>
  )
}
