import { config } from "@/lib/config";
import { getTwoHourForecast } from "@/lib/weather";
import type { WeatherForecast } from "@/types";

/**
 * Weather seam.
 *
 * The only thing the rest of the app asks for is "is it going to rain near
 * here in the next couple of hours". Any provider that can answer that fits.
 */
export interface WeatherProvider {
  readonly name: string;
  forecast(lat: number, lng: number): Promise<WeatherForecast | null>;
}

export const neaProvider: WeatherProvider = {
  name: "nea",
  forecast: (lat, lng) => getTwoHourForecast(lat, lng),
};

/** Used when weather is switched off. Always "no idea", never an error. */
export const noWeatherProvider: WeatherProvider = {
  name: "none",
  forecast: async () => null,
};

export function getWeatherProvider(): WeatherProvider {
  switch (config.weatherProvider) {
    case "nea":
      return neaProvider;
    case "none":
    default:
      return noWeatherProvider;
  }
}
