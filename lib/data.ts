import { getServerClient } from "./supabase"
import type { MobileNetwork } from "./types"

export async function getNetworks(): Promise<MobileNetwork[]> {
  const supabase = getServerClient()

  const { data, error } = await supabase
    .from("mobile_networks")
    .select("*")
    .order("country", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    console.error("Error fetching networks:", error)
    return []
  }

  return data || []
}
