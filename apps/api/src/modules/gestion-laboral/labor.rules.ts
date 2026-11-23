import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
export function calendarDate(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Fecha inválida');
  return value;
}
export function datePeriod(start: string, end: string) {
  calendarDate(start);
  calendarDate(end);
  if (end < start || Date.parse(end) - Date.parse(start) > 366 * 86400000)
    throw new BadRequestException('Periodo inválido o mayor a 366 días');
}
export function instantPeriod(start: string, end: string) {
  const a = Date.parse(start),
    b = Date.parse(end);
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    b <= a ||
    b - a > 366 * 86400000
  )
    throw new BadRequestException('Intervalo inválido o mayor a 366 días');
}
export function hoursRule(start: string, end: string, overnight: boolean) {
  if (overnight ? end > start : end <= start)
    throw new UnprocessableEntityException(
      'Cruce de medianoche incompatible con horario',
    );
}
export function sevenDays(days: { diaIso: number }[]) {
  if (
    days.length !== 7 ||
    new Set(days.map((d) => d.diaIso)).size !== 7 ||
    days.some((d) => d.diaIso < 1 || d.diaIso > 7)
  )
    throw new UnprocessableEntityException(
      'Patrón requiere siete días ISO distintos',
    );
}
