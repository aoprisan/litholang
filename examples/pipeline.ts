export interface Report {
  date: Date;
  total_revenue: number;
  transaction_count: number;
  by_category: string[];
  generated_at: Timestamp;
}

export function daily_report(date: Date): { ok: true; value: Report } | { ok: false; error: Error } {
  const completed = collect(filter(filter(db.sales, (__it) => (__it.date == date)), (__it) => (__it.status == "completed")));
  const by_category = sort(group(completed, (__it) => __it.category), (__it) => __it.total, descending);
  const total_revenue = sum(completed, (__it) => __it.amount);
  const count = completed.length;
  const report = { date: date, total_revenue: total_revenue, transaction_count: count, by_category: by_category, generated_at: now() };
  return { ok: true, value: report };
}
