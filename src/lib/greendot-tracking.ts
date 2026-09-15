import { endOfDay, startOfDay } from "date-fns";
import { parseAppDateTime } from "@/lib/formatters";

export function parseGreenDotTrackingStart(trackingStartDate?: string): Date | null {
  if (!trackingStartDate) return null;
  return startOfDay(parseAppDateTime(trackingStartDate, "00:00:00"));
}

export function isOnOrAfterGreenDotTracking(
  record: { date: string; time?: string; timestamp?: string },
  trackingStartDate?: string
): boolean {
  const trackingStart = parseGreenDotTrackingStart(trackingStartDate);
  if (!trackingStart) return true;
  return parseAppDateTime(record.date, record.time, record.timestamp) >= trackingStart;
}

export function getGreenDotMonthRange(date: Date, trackingStartDate?: string) {
  const monthStart = startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
  const monthEnd = endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  const trackingStart = parseGreenDotTrackingStart(trackingStartDate);

  if (!trackingStart) {
    return { start: monthStart, end: monthEnd };
  }

  if (trackingStart > monthEnd) {
    return null;
  }

  return {
    start: trackingStart > monthStart ? trackingStart : monthStart,
    end: monthEnd,
  };
}

export function getGreenDotTrackingRange(date: Date, trackingStartDate?: string) {
  const trackingStart = parseGreenDotTrackingStart(trackingStartDate);
  if (!trackingStart) return undefined;

  return {
    start: trackingStart,
    end: endOfDay(date),
  };
}

export function formatGreenDotTrackingLabel(trackingStartDate?: string): string | null {
  if (!trackingStartDate) return null;
  return parseAppDateTime(trackingStartDate, "00:00:00").toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}
