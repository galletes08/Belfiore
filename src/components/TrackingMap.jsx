import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const customerIcon = new L.DivIcon({
  className: 'tracking-map-marker-shell',
  html: '<div class="tracking-map-marker tracking-map-marker-customer"><span></span></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
});

const driverIcon = new L.DivIcon({
  className: 'tracking-map-marker-shell',
  html: '<div class="tracking-map-marker tracking-map-marker-driver"><span></span></div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -16],
});

function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }

    map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);

  return null;
}

export default function TrackingMap({
  customerPosition,
  driverPosition,
  customerLabel = 'Customer',
  driverLabel = 'Rider',
  className = '',
}) {
  const [routePoints, setRoutePoints] = useState([]);
  const [routeStatus, setRouteStatus] = useState('idle');
  const [routeMeta, setRouteMeta] = useState({ distanceKm: null, durationMin: null });
  const validPoints = [customerPosition, driverPosition].filter(Boolean);
  const center = validPoints[0] || [14.5995, 120.9842];
  const fallbackLine = useMemo(
    () => (customerPosition && driverPosition ? [customerPosition, driverPosition] : []),
    [customerPosition, driverPosition]
  );

  useEffect(() => {
    if (!customerPosition || !driverPosition) {
      setRoutePoints([]);
      setRouteMeta({ distanceKm: null, durationMin: null });
      setRouteStatus('idle');
      return undefined;
    }

    const controller = new AbortController();

    async function loadRoute() {
      setRouteStatus('loading');

      try {
        const coordinates = `${driverPosition[1]},${driverPosition[0]};${customerPosition[1]},${customerPosition[0]}`;
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
          { signal: controller.signal }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !Array.isArray(data.routes) || !data.routes.length) {
          throw new Error('Route lookup failed');
        }

        const route = data.routes[0];
        const geometry = Array.isArray(route.geometry?.coordinates)
          ? route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
          : [];

        if (!geometry.length) {
          throw new Error('Route geometry missing');
        }

        setRoutePoints(geometry);
        setRouteMeta({
          distanceKm: Number(route.distance) > 0 ? Number(route.distance) / 1000 : null,
          durationMin: Number(route.duration) > 0 ? Number(route.duration) / 60 : null,
        });
        setRouteStatus('success');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setRoutePoints([]);
        setRouteMeta({ distanceKm: null, durationMin: null });
        setRouteStatus('error');
      }
    }

    loadRoute();
    return () => controller.abort();
  }, [customerPosition, driverPosition]);

  const displayedLine = routePoints.length > 1 ? routePoints : fallbackLine;
  const statusLabel =
    routeStatus === 'loading'
      ? 'Finding best route'
      : routeStatus === 'success'
        ? 'Live route ready'
        : fallbackLine.length
          ? 'Direct tracking line'
          : 'Waiting for live pins';

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-[#dbe4d7] bg-[#eff5ec] ${className}`}>
      <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-2xl bg-white/92 px-4 py-3 shadow-lg shadow-[#173d2b]/10 backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5f7463]">Delivery route</p>
        <p className="mt-1 text-sm font-semibold text-[#173d2b]">{statusLabel}</p>
        {routeMeta.distanceKm != null || routeMeta.durationMin != null ? (
          <p className="mt-1 text-xs text-[#5f7463]">
            {routeMeta.distanceKm != null ? `${routeMeta.distanceKm.toFixed(1)} km` : 'Distance n/a'}
            {' · '}
            {routeMeta.durationMin != null ? `${Math.max(1, Math.round(routeMeta.durationMin))} min est.` : 'ETA n/a'}
          </p>
        ) : null}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex gap-2">
        <span className="rounded-full bg-white/92 px-3 py-1.5 text-xs font-medium text-[#173d2b] shadow-md">Customer</span>
        <span className="rounded-full bg-[#173d2b]/92 px-3 py-1.5 text-xs font-medium text-white shadow-md">Rider</span>
      </div>

      <MapContainer center={center} zoom={14} scrollWheelZoom className="h-[360px] w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <FitBounds points={validPoints} />

        {customerPosition ? (
          <Marker position={customerPosition} icon={customerIcon}>
            <Popup>{customerLabel}</Popup>
          </Marker>
        ) : null}

        {driverPosition ? (
          <Marker position={driverPosition} icon={driverIcon}>
            <Popup>{driverLabel}</Popup>
          </Marker>
        ) : null}

        {displayedLine.length > 1 ? (
          <>
            <Polyline
              positions={displayedLine}
              pathOptions={{ color: '#d3efe3', weight: 10, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
            <Polyline
              positions={displayedLine}
              pathOptions={{ color: '#0f8f63', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
            />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}
