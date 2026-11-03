import { getPersonalWorkspace } from "@/lib/auth/session"
import { csvRow } from "@/lib/studio/export"
export const runtime = "nodejs"
export const GET = async () => {
  const { supabase, workspace } = await getPersonalWorkspace(
    "/account?tab=billing",
  )
  const encoder = new TextEncoder()
  const cutoff = new Date().toISOString()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            "\uFEFF" +
              csvRow([
                "ID",
                "Created at (UTC)",
                "Type",
                "Amount (credit units)",
                "Available delta (credit units)",
                "Reserved delta (credit units)",
                "Note",
                "Job ID",
                "Native generation ID",
              ]),
          ),
        )
        let offset = 0
        while (true) {
          const { data, error } = await supabase
            .from("credit_ledger")
            .select(
              "id,created_at,kind,amount_units,delta_available,delta_reserved,note,job_id,native_generation_id",
            )
            .eq("workspace_id", workspace.id)
            .lte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .order("id")
            .range(offset, offset + 999)
          if (error) throw new Error("Unable to export the ledger")
          for (const row of data)
            controller.enqueue(
              encoder.encode(
                csvRow([
                  row.id,
                  row.created_at,
                  row.kind,
                  row.amount_units,
                  row.delta_available,
                  row.delta_reserved,
                  row.note,
                  row.job_id,
                  row.native_generation_id,
                ]),
              ),
            )
          if (data.length < 1000) break
          offset += 1000
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="creativeotter-ledger.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
