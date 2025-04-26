import { PaymentForm } from "@/components/payment-form"
import { getNetworks } from "@/lib/data"

export default async function Home() {
  const networks = await getNetworks()

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">LNBTC to Mobile Money</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">
            Send Bitcoin Lightning payments to Mobile Money accounts instantly
          </p>
        </div>

        <PaymentForm networks={networks} />
      </div>
    </main>
  )
}
