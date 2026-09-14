import { whatsappConfig } from "@/lib/whatsapp-server";
import { identity, serverDb, ok, failure } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = serverDb();
    const user = await identity(request, false);
    let isAdmin = false;
    if (user) {
      const { data } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
      isAdmin = !!data;
    }

    const results = await Promise.all([
      db.from("categories").select("*").order("name"),
      db.from("pools").select("*").order("code"),
      db.from("shipments").select("*"),
      db.from("slot_allocations").select("pool_id,slot_no,order_id"),
      db.from("blocked_slots").select("pool_id,slot_no,reason,blocked_by,created_at"),
      db.from("waitlist").select("id,pool_id,user_id,created_at,status,offered_slot,offered_primary,offered_secondary,offer_expires_at"),
    ]);
    for (const result of results) if (result.error) throw result.error;
    const [categories, poolRows, shipments, allocations, blocked, waiting] = results.map((result) => result.data ?? []) as any[][];

    let profile = null;
    let orders: any[] = [];
    let manualPayments: any[] = [];
    let whatsappMessages: any[] = [];
    if (user) {
      const profileResult = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = profileResult.data;
      let orderQuery = db.from("orders").select("*").order("created_at", { ascending: false });
      if (!isAdmin) orderQuery = orderQuery.eq("user_id", user.id);
      const orderResult = await orderQuery;
      if (orderResult.error) throw orderResult.error;
      orders = orderResult.data ?? [];
      if (orders.length) {
        const paymentResult = await db.from("manual_payments").select("*").in("order_id", orders.map((order) => order.id)).order("received_at", { ascending: false });
        if (paymentResult.error) throw paymentResult.error;
        manualPayments = paymentResult.data ?? [];
      }
      let messageQuery = db.from("whatsapp_messages").select("*").order("created_at", { ascending: false }).limit(200);
      if (!isAdmin) messageQuery = messageQuery.eq("user_id", user.id);
      const messageResult = await messageQuery;
      if (messageResult.error) throw messageResult.error;
      whatsappMessages = messageResult.data ?? [];
    }

    const pools = poolRows
      .filter((pool) => isAdmin || pool.status !== "draft")
      .map((pool) => {
        const poolAllocations: Array<{ slot_no: number; status: string; order_id?: string; reason?: string }> = [
          ...allocations
            .filter((allocation) => allocation.pool_id === pool.id)
            .map((allocation) => ({ slot_no: allocation.slot_no, status: "reserved", order_id: allocation.order_id })),
          ...blocked
            .filter((slot) => slot.pool_id === pool.id)
            .map((slot) => ({ slot_no: slot.slot_no, status: "blocked", ...(isAdmin ? { reason: slot.reason } : {}) })),
          ...waiting
            .filter((entry) => entry.pool_id === pool.id && entry.status === "offered" && entry.user_id !== user?.id)
            .map((entry) => ({ slot_no: entry.offered_slot, status: "waiting-list offer" })),
        ];
        return {
          ...pool,
          allocations: poolAllocations,
          waitlist_count: waiting.filter((entry) => entry.pool_id === pool.id && entry.status === "waiting").length,
        };
      });
    return ok({
      categories: categories.filter((category) => isAdmin || category.active),
      pools,
      shipments,
      profile,
      orders,
      manualPayments,
      isAdmin,
      waitlist: waiting.filter((entry) => isAdmin || entry.user_id === user?.id),
      whatsappMessages,
      whatsapp: whatsappConfig(),
    });
  } catch (error) {
    return failure(error);
  }
}
