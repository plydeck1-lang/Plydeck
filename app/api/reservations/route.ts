import {
  failure,
  identity,
  jsonBody,
  limit,
  ok,
  rpc,
  serverDb,
  HttpError,
} from "@/lib/server";
import { quoteSlot } from "@/lib/pricing";
import { reservationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await identity(request);
    await limit(user!.id, "reservation", 12);
    const input = reservationSchema.parse(await jsonBody(request));
    const { data: pool, error } = await serverDb()
      .from("pools")
      .select("*")
      .eq("id", input.pool_id)
      .single();
    if (error || !pool) throw new HttpError(404, "Pool not found.");

    const quote = quoteSlot(pool, input.slot_numbers.length);
    if (quote.total !== input.expected_total)
      throw new HttpError(
        409,
        "The price changed. Refresh the pool and review the current quotation.",
      );

    const order = await rpc("reserve_slots", {
      p_user: user!.id,
      p_pool: pool.id,
      p_slots: input.slot_numbers,
      p_primary: quote.primary_qty,
      p_secondary: quote.secondary_qty,
      p_quote: quote,
      p_version: pool.updated_at,
    });
    return ok({ reserved: true, order });
  } catch (error) {
    return failure(error);
  }
}
