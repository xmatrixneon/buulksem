"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useSession } from "@/lib/auth-client"
import CustomSidebar from "@/components/ui/custom-sidebar"
import TopNavEnhanced from "@/components/ui/top-nav-enhanced"

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const { data: session, isPending } = useSession()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/sign-in')
    }
  }, [session, isPending, router])

  if (!mounted || isPending) {
    return null
  }

  if (!session) {
    return null
  }

  return (
    <div className={`flex h-screen ${theme === "dark" ? "dark" : ""}`}>
      <CustomSidebar />
      <div className="w-full flex flex-1 flex-col lg:ml-64">
        <header className="h-16 border-b">
          <TopNavEnhanced />
        </header>
        <main className="flex-1 overflow-auto p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  )
}
