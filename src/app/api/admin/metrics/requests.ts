import { fetchApi } from '@/services/api/fetchApi';
import type { MetricsRange, MetricsSeries } from '@/lib/metrics/series';
import type { ForecastResult } from '@/lib/metrics/forecast';

export async function fetchMetricsSeries(range: MetricsRange): Promise<MetricsSeries | null> {
  const response = await fetchApi(`admin/metrics?range=${range}`);
  if (!response.ok) return null;
  return response.json();
}

export async function fetchForecast(): Promise<ForecastResult | null> {
  const response = await fetchApi('admin/metrics/forecast');
  if (!response.ok) return null;
  return response.json();
}

export async function refreshMetrics(range: MetricsRange): Promise<MetricsSeries | null> {
  const response = await fetchApi(`admin/metrics/refresh?range=${range}`, { method: 'POST' });
  if (!response.ok) return null;
  return response.json();
}
