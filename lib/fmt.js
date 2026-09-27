export const pkr = (n) => "Rs " + Number(n || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
export const dur = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + "h " : "") + (h || m ? m + "m " : "") + sec + "s";
};
