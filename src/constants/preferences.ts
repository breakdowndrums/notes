export const DefaultLibraryDayStartHour = 5;
export const LibraryDayStartHourStorageKey = 'preferences:library-day-start-hour';

export function clampLibraryDayStartHour(hour: number) {
  if (!Number.isFinite(hour)) {
    return DefaultLibraryDayStartHour;
  }

  return Math.min(23, Math.max(0, Math.trunc(hour)));
}

export function startOfLibraryDay(date: Date, dayStartHour: number) {
  const dayStart = new Date(date);
  dayStart.setHours(clampLibraryDayStartHour(dayStartHour), 0, 0, 0);

  if (date < dayStart) {
    dayStart.setDate(dayStart.getDate() - 1);
  }

  return dayStart;
}

export function millisecondsUntilNextLibraryDay(date = new Date(), dayStartHour: number) {
  const nextDay = startOfLibraryDay(date, dayStartHour);
  nextDay.setDate(nextDay.getDate() + 1);
  return Math.max(1000, nextDay.getTime() - date.getTime());
}
