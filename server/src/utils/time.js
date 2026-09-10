/**
 * "Sat, 12 Sept, 8:00 pm" in Indian time — how a delivery slot reads to a
 * person. Shared by the scheduling rules and the emails, so the time a customer
 * is refused with and the time they are confirmed with are written the same way.
 */
export function formatSlot(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
