import { NextResponse } from "next/server";
import { getCityKnowledgeContext } from "@/lib/qdrant-knowledge";

export const runtime = "nodejs";

type AgentRequest = {
  city?: string;
};

type ParsedLocationInput = {
  city: string;
  state?: string;
  original: string;
};

type GeocodeResult = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type OpenMeteoGeocodeResponse = {
  results?: GeocodeResult[];
};

type OpenMeteoWeatherResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation?: number;
    weather_code?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
  };
};

type OpenMeteoArchiveResponse = {
  daily?: {
    temperature_2m_mean?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
};

type NewsDataResponse = {
  results?: NewsDataArticle[];
};

type NewsDataArticle = {
  title?: string;
  source_id?: string;
  pubDate?: string;
  description?: string;
  link?: string;
  image_url?: string;
};

type ImdForecastRecord = Record<string, string | number | null | undefined>;

const indianCityAliases: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  bombay: "Mumbai",
  calcutta: "Kolkata",
  madras: "Chennai",
  poona: "Pune",
  cochin: "Kochi",
  benaras: "Varanasi",
  banaras: "Varanasi",
  baroda: "Vadodara",
  trichur: "Thrissur",
  trivandrum: "Thiruvananthapuram",
};

const imdCityForecastIds: Record<string, string> = {
  jaipur: "42182",
};

const weatherCodeLabels: Record<number, string> = {
  0: "Clear Sky",
  1: "Mainly Clear",
  2: "Partly Cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing Rime Fog",
  51: "Light Drizzle",
  53: "Moderate Drizzle",
  55: "Dense Drizzle",
  61: "Slight Rain",
  63: "Moderate Rain",
  65: "Heavy Rain",
  71: "Slight Snow",
  73: "Moderate Snow",
  75: "Heavy Snow",
  80: "Slight Rain Showers",
  81: "Moderate Rain Showers",
  82: "Violent Rain Showers",
  95: "Thunderstorm",
  96: "Thunderstorm With Slight Hail",
  99: "Thunderstorm With Heavy Hail",
};

export async function POST(request: Request) {
  const body = (await request.json()) as AgentRequest;
  const city = body.city?.trim();

  if (!city) {
    return NextResponse.json(
      { error: "Please enter a city name." },
      { status: 400 },
    );
  }

  try {
    const parsedInput = parseLocationInput(city);
    const location = await geocodeCity(parsedInput);
    const weatherPromise = fetchWeather(location);
    const newsPromise = fetchNews(location.name, location.admin1, parsedInput.original);
    const vectorContextPromise = getCityKnowledgeContext(location.name, location.admin1);
    const climatePromise = weatherPromise.then((weather) => {
      return buildClimateProfile(location, weather);
    });
    const [weather, news, vectorContext, climate] = await Promise.all([
      weatherPromise,
      newsPromise,
      vectorContextPromise,
      climatePromise,
    ]);

    return NextResponse.json({
      city: location.name,
      country: location.country ?? "Unknown",
      region: location.admin1,
      latitude: location.latitude,
      longitude: location.longitude,
      temperature: weather.temperature,
      condition: weather.condition,
      humidity: weather.humidity,
      wind: weather.wind,
      precipitation: weather.precipitation,
      precipitationProbability: weather.precipitationProbability,
      observedAt: weather.observedAt,
      weatherSource: "Open-Meteo",
      climate,
      news,
      vectorContext,
      generatedAt: new Date().toISOString(),
      aiSummary: `${location.name} is currently ${weather.condition.toLowerCase()} at ${weather.temperature}°C, with humidity around ${weather.humidity}% and wind near ${weather.wind} km/h. Recent city news is shown below when the news API is configured.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to fetch climate and news data.",
      },
      { status: 502 },
    );
  }
}

function parseLocationInput(input: string): ParsedLocationInput {
  const [cityPart, ...stateParts] = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    city: cityPart || input.trim(),
    state: stateParts.join(", ") || undefined,
    original: input.trim(),
  };
}

async function geocodeCity(input: ParsedLocationInput): Promise<GeocodeResult> {
  const searchName = indianCityAliases[input.city.trim().toLowerCase()] ?? input.city;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", searchName);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { next: { revalidate: 3600 } });

  if (!response.ok) {
    throw new Error("City lookup failed. Please try again.");
  }

  const data = (await response.json()) as OpenMeteoGeocodeResponse;
  const indianLocations = data.results?.filter((result) => {
    return result.country?.toLowerCase() === "india";
  }) ?? [];
  const location =
    findStateMatch(indianLocations, input.state) ??
    indianLocations.find((result) => normalizeText(result.name) === normalizeText(searchName)) ??
    indianLocations[0];

  if (!location) {
    throw new Error(`I could not find an Indian city named "${input.original}".`);
  }

  return location;
}

function findStateMatch(locations: GeocodeResult[], state?: string) {
  if (!state) {
    return undefined;
  }

  const normalizedState = normalizeText(state);

  return locations.find((location) => {
    return location.admin1 && normalizeText(location.admin1) === normalizedState;
  });
}

async function fetchWeather(location: GeocodeResult) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,weather_code",
  );
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability");
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url, { next: { revalidate: 600 } });

  if (!response.ok) {
    throw new Error("Open-Meteo weather API failed. Please try again.");
  }

  const data = (await response.json()) as OpenMeteoWeatherResponse;
  const current = data.current;

  if (!current) {
    throw new Error("Weather data was not available for this city.");
  }

  const weatherCode = current.weather_code ?? -1;

  return {
    temperature: Math.round(current.temperature_2m ?? 0),
    condition: weatherCodeLabels[weatherCode] ?? "Weather Data Available",
    humidity: Math.round(current.relative_humidity_2m ?? 0),
    wind: Math.round(current.wind_speed_10m ?? 0),
    precipitation: current.precipitation ?? 0,
    precipitationProbability: getCurrentPrecipitationProbability(data, current.time),
    observedAt: current.time,
  };
}

function getCurrentPrecipitationProbability(data: OpenMeteoWeatherResponse, currentTime?: string) {
  const times = data.hourly?.time;
  const probabilities = data.hourly?.precipitation_probability;

  if (!times?.length || !probabilities?.length || !currentTime) {
    return undefined;
  }

  const currentHour = currentTime.slice(0, 13);
  const currentIndex = times.findIndex((time) => time.startsWith(currentHour));
  const probability = probabilities[currentIndex];

  return Number.isFinite(probability) ? Math.round(probability) : undefined;
}

async function fetchNews(city: string, state?: string, originalCity?: string) {
  const apiKey = process.env.NEWSDATA_API_KEY;
  const searchTerms = getCitySearchTerms(city, originalCity);

  if (!apiKey) {
    return [
      {
        title: "News API key not configured",
        source: "NewsData.io",
        publishedAt: "Setup required",
        summary:
          "Add NEWSDATA_API_KEY to .env.local to fetch recent city news from NewsData.io.",
        url: "https://newsdata.io/",
        imageUrl: undefined,
      },
    ];
  }

  const titleArticles = await requestNewsData(apiKey, {
    qInTitle: city,
    size: "10",
  });
  const titleMatches = rankCityArticles(titleArticles, searchTerms, state);
  const needsFallback = titleMatches.length < 5;
  const fallbackArticles = needsFallback
    ? await requestNewsData(apiKey, {
        q: [city, state, "India"].filter(Boolean).join(" ").slice(0, 100),
        size: "10",
      })
    : [];
  const rankedArticles = dedupeArticles([
    ...titleMatches,
    ...rankCityArticles(fallbackArticles, searchTerms, state),
  ]).slice(0, 5);

  if (rankedArticles.length === 0 && titleArticles.length === 0 && fallbackArticles.length === 0) {
    return [
      {
        title: `No recent English news found for ${city}`,
        source: "NewsData.io",
        publishedAt: "Live check",
        summary: "NewsData.io did not return recent articles for this city.",
        url: "https://newsdata.io/",
        imageUrl: undefined,
      },
    ];
  }

  if (rankedArticles.length === 0) {
    return [
      {
        title: `No city-specific news matched ${city}`,
        source: "NewsData.io",
        publishedAt: "Live check",
        summary:
          "The news provider returned broad India results, but none clearly mentioned this city in the title, summary, or URL.",
        url: "https://newsdata.io/",
        imageUrl: undefined,
      },
    ];
  }

  return rankedArticles.map((article) => ({
    title: article.title ?? "Untitled article",
    source: article.source_id ?? "News source",
    publishedAt: article.pubDate ?? "Recent",
    summary: article.description ?? "No article description was provided.",
    url: article.link,
    imageUrl: article.image_url,
  }));
}

async function requestNewsData(
  apiKey: string,
  params: { q?: string; qInTitle?: string; size: string },
) {
  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("country", "in");
  url.searchParams.set("language", "en");
  url.searchParams.set("size", params.size);

  if (params.qInTitle) {
    url.searchParams.set("qInTitle", params.qInTitle);
  }

  if (params.q) {
    url.searchParams.set("q", params.q);
  }

  const response = await fetch(url, { next: { revalidate: 900 } });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as NewsDataResponse;

  return data.results ?? [];
}

function rankCityArticles(
  articles: NewsDataArticle[],
  cityTerms: string[],
  state?: string,
) {
  return articles
    .map((article) => ({
      article,
      score: scoreArticle(article, cityTerms, state),
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .map((item) => item.article);
}

function scoreArticle(article: NewsDataArticle, cityTerms: string[], state?: string) {
  const title = article.title ?? "";
  const summary = article.description ?? "";
  const link = article.link ?? "";
  let score = 0;

  for (const term of cityTerms) {
    if (containsTerm(title, term)) {
      score += 6;
    }

    if (containsTerm(summary, term)) {
      score += 3;
    }

    if (containsTerm(link, term)) {
      score += 2;
    }
  }

  if (state && containsTerm(`${title} ${summary}`, state)) {
    score += 1;
  }

  return score;
}

function dedupeArticles(articles: NewsDataArticle[]) {
  const seen = new Set<string>();
  const deduped: NewsDataArticle[] = [];

  for (const article of articles) {
    const key = article.link ?? article.title ?? "";

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(article);
  }

  return deduped;
}

function getCitySearchTerms(city: string, originalCity?: string) {
  const normalizedCity = normalizeText(city);
  const terms = new Set([city]);

  if (originalCity) {
    terms.add(originalCity);
  }

  for (const [alias, canonical] of Object.entries(indianCityAliases)) {
    if (normalizeText(canonical) === normalizedCity) {
      terms.add(alias);
      terms.add(canonical);
    }
  }

  return [...terms].filter(Boolean);
}

function containsTerm(text: string, term: string) {
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);

  if (!normalizedTerm) {
    return false;
  }

  return new RegExp(`(^|\\W)${escapeRegex(normalizedTerm)}($|\\W)`, "i").test(normalizedText);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[_-]/g, " ");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildClimateProfile(
  location: GeocodeResult,
  weather: {
    temperature: number;
    condition: string;
    humidity: number;
    wind: number;
    precipitation: number;
  },
) {
  const imdProfile = await fetchImdClimateProfile(location);

  if (imdProfile) {
    return imdProfile;
  }

  const archiveProfile = await fetchOpenMeteoClimateProfile(location);

  if (archiveProfile) {
    return archiveProfile;
  }

  return buildOpenMeteoClimateLine(location.name, weather.condition, weather.precipitation);
}

async function fetchImdClimateProfile(location: GeocodeResult) {
  const imdId = getImdCityForecastId(location.name);
  const apiKey = process.env.IMD_API_KEY;
  const jwtToken = process.env.IMD_JWT_TOKEN;

  if (!imdId || !apiKey || !jwtToken) {
    return null;
  }

  const url = new URL("https://api.imd.gov.in/api/v1/cityforecast");
  url.searchParams.set("id", imdId);

  try {
    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        Authorization: `Bearer ${jwtToken}`,
      },
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const record = extractImdRecord(payload);

    if (!record) {
      return null;
    }

    return formatImdClimateProfile(record);
  } catch {
    return null;
  }
}

function extractImdRecord(payload: unknown): ImdForecastRecord | null {
  if (Array.isArray(payload)) {
    return (payload[0] as ImdForecastRecord | undefined) ?? null;
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as {
      data?: unknown;
      result?: unknown;
      results?: unknown;
    };

    for (const value of [objectPayload.data, objectPayload.result, objectPayload.results]) {
      if (Array.isArray(value) && value[0]) {
        return value[0] as ImdForecastRecord;
      }

      if (value && typeof value === "object") {
        return value as ImdForecastRecord;
      }
    }

    return objectPayload as ImdForecastRecord;
  }

  return null;
}

function formatImdClimateProfile(record: ImdForecastRecord) {
  const station = readField(record, "Station_Name") ?? "IMD station";
  const observationDate = readField(record, "Date");
  const todayForecast = readField(record, "Todays_Forecast");
  const todayMax = readField(record, "Todays_Forecast_Max_Temp");
  const todayMin = readField(record, "Todays_Forecast_Min_temp");
  const humidityMorning = readField(record, "Relative_Humidity_at_0830");
  const humidityEvening = readField(record, "Relative_Humidity_at_1730");
  const rainfall = readField(record, "Past_24_hrs_Rainfall");
  const day2Forecast = readField(record, "Day_2_Forecast");
  const day3Forecast = readField(record, "Day_3_Forecast");

  return [
    `IMD climate profile for ${station}${observationDate ? ` on ${observationDate}` : ""}.`,
    todayForecast ? `Today's forecast: ${todayForecast}.` : "",
    todayMax || todayMin
      ? `Forecast temperature range: ${todayMin ?? "N/A"}°C to ${todayMax ?? "N/A"}°C.`
      : "",
    rainfall ? `Past 24 hours rainfall: ${rainfall}.` : "",
    humidityMorning || humidityEvening
      ? `Relative humidity: ${humidityMorning ?? "N/A"}% at 0830 IST and ${humidityEvening ?? "N/A"}% at 1730 IST.`
      : "",
    day2Forecast ? `Tomorrow: ${day2Forecast}.` : "",
    day3Forecast ? `Day 3: ${day3Forecast}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getImdCityForecastId(city: string) {
  return imdCityForecastIds[city.trim().toLowerCase()] ?? process.env.IMD_CITYFORECAST_ID;
}

function readField(record: ImdForecastRecord, key: string) {
  const value = record[key];

  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  return String(value);
}

function buildOpenMeteoClimateLine(city: string, condition: string, precipitation: number) {
  const rainText =
    precipitation > 0
      ? ` Current precipitation is ${precipitation} mm, so wet-weather planning may matter right now.`
      : " No current precipitation is reported by the weather feed.";

  return `${city}'s live climate snapshot is ${condition.toLowerCase()} based on current weather model data.${rainText}`;
}

async function fetchOpenMeteoClimateProfile(location: GeocodeResult) {
  const { startDate, endDate } = getArchiveDateRange();
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set(
    "daily",
    "temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum",
  );
  url.searchParams.set("timezone", "auto");

  try {
    const response = await fetch(url, { next: { revalidate: 21600 } });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OpenMeteoArchiveResponse;
    const daily = data.daily;

    if (!daily?.temperature_2m_mean?.length) {
      return null;
    }

    const meanTemperature = average(daily.temperature_2m_mean);
    const averageHigh = average(daily.temperature_2m_max ?? []);
    const averageLow = average(daily.temperature_2m_min ?? []);
    const totalRainfall = sum(daily.precipitation_sum ?? []);
    const rainyDays = (daily.precipitation_sum ?? []).filter((rain) => rain > 0.5).length;
    const profileType = classifyClimate(meanTemperature, totalRainfall, rainyDays);

    return `${location.name}'s recent climate profile is ${profileType}, based on Open-Meteo historical archive data from ${startDate} to ${endDate}. Average temperature was ${round(meanTemperature)}°C, with typical daily lows near ${round(averageLow)}°C and highs near ${round(averageHigh)}°C. Total rainfall was ${round(totalRainfall)} mm across ${rainyDays} rainy days.`;
  } catch {
    return null;
  }
}

function getArchiveDateRange() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
  };
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function average(values: number[]) {
  const validValues = values.filter((value) => Number.isFinite(value));

  if (validValues.length === 0) {
    return 0;
  }

  return sum(validValues) / validValues.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function classifyClimate(meanTemperature: number, totalRainfall: number, rainyDays: number) {
  const heat = meanTemperature >= 30 ? "hot" : meanTemperature >= 24 ? "warm" : "mild";
  const rainfall =
    totalRainfall >= 120 || rainyDays >= 12
      ? "wet"
      : totalRainfall >= 35 || rainyDays >= 5
        ? "moderately wet"
        : "mostly dry";

  return `${heat} and ${rainfall}`;
}
