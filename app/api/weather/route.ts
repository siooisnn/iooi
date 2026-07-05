// 天气接口：用 wttr.in 免费获取，服务端缓存1小时

let cache: { city: string; text: string; ts: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city") || "Beijing";

  if (cache && cache.city === city && Date.now() - cache.ts < CACHE_MS) {
    return Response.json({ weather: cache.text });
  }

  try {
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`wttr ${res.status}`);
    const data = await res.json();

    const cur = data.current_condition?.[0];
    if (!cur) throw new Error("no data");

    const desc =
      cur.lang_zh?.[0]?.value ||
      cur.weatherDesc?.[0]?.value ||
      "未知";
    const tempC = cur.temp_C;
    const feelsLike = cur.FeelsLikeC;
    const humidity = cur.humidity;
    const windDir = cur.winddir16Point;
    const windSpeed = cur.windspeedKmph;

    const parts = [`${desc}`, `${tempC}°C`];
    if (feelsLike && Math.abs(Number(feelsLike) - Number(tempC)) >= 3) {
      parts.push(`体感${feelsLike}°C`);
    }
    parts.push(`湿度${humidity}%`);
    if (Number(windSpeed) > 10) {
      parts.push(`${windDir}风${windSpeed}km/h`);
    }

    const forecast = data.weather?.[0];
    let forecastText = "";
    if (forecast) {
      const maxT = forecast.maxtempC;
      const minT = forecast.mintempC;
      forecastText = `，今日${minT}~${maxT}°C`;
    }

    const text = `${city}：${parts.join("，")}${forecastText}`;
    cache = { city, text, ts: Date.now() };
    return Response.json({ weather: text });
  } catch {
    return Response.json({ weather: "" });
  }
}
