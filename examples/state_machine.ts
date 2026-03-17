export enum OrderStatus {
  Pending,
  Paid,
  Shipped,
  Delivered,
  Cancelled,
}

export interface Item {
  name: string;
  price: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  items: Item[];
  total: number;
}

export function transition(order: Order, action: string): { ok: true; value: Order } | { ok: false; error: string } {
  if (true && [order.status, action][1] === "pay") {
    const Pending = [order.status, action][0];
    return { ok: true, value: { ...order, status: Paid } };
  } else if (true && [order.status, action][1] === "ship") {
    const Paid = [order.status, action][0];
    const tracking = generate_tracking();
    return { ok: true, value: { ...order, status: Shipped, tracking: tracking } };
  } else if (true && [order.status, action][1] === "deliver") {
    const Shipped = [order.status, action][0];
    return { ok: true, value: { ...order, status: Delivered } };
  } else if (true && [order.status, action][1] === "cancel") {
    const Pending = [order.status, action][0];
    return { ok: true, value: { ...order, status: Cancelled } };
  } else if (true && true) {
    return { ok: false, error: "Cannot perform action from current status" };
  }
}

export function classify_order(order: Order): string {
  if (true && (() => { const t = order.total; return (t >= 1000); })()) {
    const t = order.total;
    return "premium";
  } else if (true && (() => { const t = order.total; return (t >= 100); })()) {
    const t = order.total;
    return "standard";
  } else if (true && (() => { const t = order.total; return (t > 0); })()) {
    const t = order.total;
    return "small";
  } else if (true) {
    return "empty";
  }
}

export function create_order(id: string, items: Item[], discount: number = 0): Order {
  const raw_total = sum(items, (__it) => __it.price);
  const final_total = (raw_total - discount);
  return { id: id, status: Pending, items: items, total: final_total };
}
