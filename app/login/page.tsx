'use client'

import { createClient } from '@/utils/supabase/client'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        router.push('/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router, supabase])

  // Get origin safely for SSR
  const getOrigin = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin
    }
    return ''
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-sm border border-zinc-100">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-zinc-900 tracking-tight">
            Tennis Fantasy Manager
          </h2>
          <p className="mt-2 text-center text-sm text-zinc-600">
            Sign in to manage your team
          </p>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="default"
          providers={[]}
          redirectTo={`${getOrigin()}/auth/callback`}
        />
      </div>
    </div>
  )
}
