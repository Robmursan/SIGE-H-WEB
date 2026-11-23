function formatter(zone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}
function parts(instant: Date, zone: string) {
  return Object.fromEntries(
    formatter(zone)
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
}
export function localDate(instant: Date, zone: string) {
  const p = parts(instant, zone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function plusDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== date
  )
    throw new Error('FECHA_INVALIDA');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function tomorrow(now: Date, zone: string) {
  return plusDay(localDate(now, zone));
}
// Resolve wall time using the zone's actual offsets. Ambiguous/nonexistent times
// are conflicts, never silently shifted. No server-local timezone arithmetic.
export function localInstant(date: string, time: string, zone: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.0+)?)?$/.test(time))
    throw new Error('HORARIO_INVALIDO');
  const clock = time.length === 5 ? `${time}:00` : time.split('.')[0]!;
  plusDay(date);
  const naive = Date.parse(`${date}T${clock}Z`);
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const instant = new Date(naive + h * 3600000),
      p = parts(instant, zone);
    offsets.add(
      Date.parse(
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
      ) - instant.getTime(),
    );
  }
  const matches = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((instant) => {
      const p = parts(instant, zone);
      return (
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` ===
        `${date}T${clock}`
      );
    });
  if (matches.length !== 1)
    throw new Error(
      matches.length ? 'HORA_LOCAL_AMBIGUA' : 'HORA_LOCAL_INEXISTENTE',
    );
  return matches[0]!.toISOString();
}
