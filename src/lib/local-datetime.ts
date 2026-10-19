/** Convert an instant into the wall-clock string expected by a datetime-local input. */
export function toLocalDateTimeInput(value:string|null, timezoneOffsetMinutes?:number):string {
  if(!value)return "";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return "";
  const offset=timezoneOffsetMinutes===undefined?date.getTimezoneOffset():timezoneOffsetMinutes;
  return new Date(date.getTime()-offset*60_000).toISOString().slice(0,16);
}
