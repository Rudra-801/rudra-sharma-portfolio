const LOCAL_ORIGIN=/^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
export function originAllowed(origin,{production=false,allowed=[]}={}){
  if(!origin) return true;
  if(new Set(allowed).has(origin)) return true;
  return !production&&LOCAL_ORIGIN.test(origin);
}
