import { NextResponse } from "next/server"
import { getServerClient } from "@/lib/supabase"
import { checkInvoiceStatus, sendMobileMoney, checkMomoPaymentStatus } from "@/lib/ejara-api"
import type { TransactionStatus } from "@/lib/types"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id

    if (!id) {
      return NextResponse.json({ error: "Transaction ID is required" }, { status: 400 })
    }

    const supabase = getServerClient()

    // Get the current transaction
    const { data: transaction, error } = await supabase.from("transactions").select("*").eq("id", id).single()

    if (error || !transaction) {
      console.error("Error fetching transaction:", error)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
    }

    let newStatus: TransactionStatus = transaction.status
    const updateData: any = {}

    // Check if the transaction has expired
    const now = new Date()
    const expiresAt = new Date(transaction.expires_at)

    if (transaction.status === "invoice_generated" && now > expiresAt) {
      newStatus = "failed"
      updateData.status = newStatus
      await supabase.from("transactions").update({ status: newStatus }).eq("id", id)

      return NextResponse.json({
        id: transaction.id,
        status: newStatus,
        message: "Invoice expired",
      })
    }

    // If the invoice is generated, check if it's been paid using Ejara API
    if (transaction.status === "invoice_generated") {
      const invoiceStatus = await checkInvoiceStatus(transaction.invoice_id)

      if (invoiceStatus.paid) {
        newStatus = "paid"
        updateData.paid_at = new Date().toISOString()
      }
    }

    // If the invoice is paid, try to send mobile money using Ejara API
    if (newStatus === "paid" && !transaction.mobile_money_reference) {
      newStatus = "sending_mobile_money"
      updateData.status = newStatus

      // Update status to sending_mobile_money first
      await supabase.from("transactions").update({ status: newStatus }).eq("id", id)

      try {
        const result = await sendMobileMoney({
          phoneNumber: transaction.recipient_phone,
          amount: transaction.amount,
          reference: transaction.id,
        })

        if (result.success && result.paymentReference) {
          newStatus = "completed"
          updateData.mobile_money_reference = result.paymentReference
        } else {
          newStatus = "failed"
          console.error("Mobile money payment failed:", result.error)
        }
      } catch (paymentError) {
        console.error("Error initiating mobile money payment:", paymentError)
        newStatus = "failed"
      }
    }

    // Check if an existing mobile money payment is completed
    if (newStatus === "sending_mobile_money" && transaction.mobile_money_reference) {
      try {
        const paymentStatus = await checkMomoPaymentStatus(transaction.mobile_money_reference)

        if (paymentStatus.success) {
          if (paymentStatus.status === "completed") {
            newStatus = "completed"
          } else if (paymentStatus.status === "failed") {
            newStatus = "failed"
          }
        }
      } catch (statusError) {
        console.error("Error checking payment status:", statusError)
      }
    }

    // Update the transaction if status has changed
    if (newStatus !== transaction.status) {
      updateData.status = newStatus

      const { error: updateError } = await supabase.from("transactions").update(updateData).eq("id", id)

      if (updateError) {
        console.error("Error updating transaction:", updateError)
        return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 })
      }
    }

    return NextResponse.json({
      id: transaction.id,
      status: newStatus,
      ...updateData,
    })
  } catch (error) {
    console.error("Error processing request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
