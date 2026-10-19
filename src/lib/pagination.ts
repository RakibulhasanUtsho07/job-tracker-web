export type Pagination = {limit:number;offset:number};

/** Clamp untrusted pagination query values to safe, predictable bounds. */
export function parsePagination(request:Request, defaultLimit=25, maxLimit=100):Pagination {
  const params=new URL(request.url).searchParams;
  const readInteger=(value:string|null,fallback:number)=> {
    if(value===null||value.trim()==="")return fallback;
    const parsed=Number(value);
    return Number.isSafeInteger(parsed)&&parsed>=0?parsed:fallback;
  };
  const limit=Math.min(maxLimit,Math.max(1,readInteger(params.get("limit"),defaultLimit)));
  const offset=Math.min(10_000_000,readInteger(params.get("offset"),0));
  return {limit,offset};
}
