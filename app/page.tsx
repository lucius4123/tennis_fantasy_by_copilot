import Link from 'next/link'
import { Trophy, Users, ArrowRight } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { isAdminUser } from '@/lib/auth'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  const userIsAdmin = !error && !!user && isAdminUser(user as any)

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-3xl w-full text-center space-y-8">
        <div className="flex justify-center mb-6">
          <div className="bg-emerald-100 p-4 rounded-full">
            <Trophy className="h-16 w-16 text-emerald-600" />
          </div>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-900">
          Tennis Fantasy Manager
        </h1>
        
        <p className="text-xl text-zinc-600 max-w-2xl mx-auto leading-relaxed">
          Baue das eigene Fantasy Tennis Team auf, nimm an spannenden Ligen teil und messe dich mit anderen Managern. Werde Erster und staube ein leckeres McDonalds Menü ab!
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link 
            href="/login" 
            className="flex items-center justify-center w-full sm:w-auto px-8 py-4 text-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl transition-all shadow-sm hover:shadow-md"
          >
            Get Started
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          {userIsAdmin && (
            <Link 
              href="/players" 
              className="flex items-center justify-center w-full sm:w-auto px-8 py-4 text-lg font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-2xl transition-all shadow-sm"
            >
              <Users className="mr-2 h-5 w-5 text-zinc-400" />
              View Players
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
