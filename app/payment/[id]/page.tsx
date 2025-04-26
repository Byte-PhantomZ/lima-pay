import { notFound } from "next/navigation"
import { getServerClient } from "@/lib/supabase"
import { PaymentStatus } from "@/components/payment-status"
import type { Transaction } from "@/lib/types"

interface PaymentPageProps {
  params: {
    id: string
  }
}

async function getTransaction(id: string): Promise<Transaction | null> {
  if (!id) return null
  
  const supabase = getServerClient()

  const { data, error } = await supabase
    .from("transactions")
    .select(`
      *,
      mobile_networks (
        name,
        country
      )
    `)
    .eq("id", id)
    .single()

  if (error || !data) {
    console.error("Error fetching transaction:", error)
    return null
  }

  return data as unknown as Transaction
}

export default async function PaymentPage({ params }: PaymentPageProps) {
  // Check params.id first
  if (!params?.id) {
    return notFound()
  }

  const transaction = await getTransaction(params.id)

  if (!transaction) {
    return notFound()
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Complete Your Payment</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">Scan the QR code with your Lightning wallet</p>
        </div>

        <PaymentStatus transaction={transaction} />
      </div>
    </main>
  )
}
