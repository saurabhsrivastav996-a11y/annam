import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * Emoji pins via divIcon: avoids Leaflet's default marker-image paths, which
 * break under bundlers, and keeps the map key-free (OpenStreetMap tiles).
 */
const pin = (emoji, ring) =>
  L.divIcon({
    className: '',
    html: `<div style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgb(0 0 0 / .25);border:2px solid ${ring};font-size:17px;line-height:1">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const ICONS = {
  restaurant: pin('🍳', '#f06106'),
  home: pin('🏠', '#2b6a40'),
  courier: pin('🛵', '#2563eb'),
  donation: pin('🎁', '#f06106'),
};

/** Keeps every marker in frame as the courier moves. */
function FitBounds({ points }) {
  const map = useMap();
  // Compared by value, so a re-render with the same coordinates does not re-fit
  // the map (which would fight the user panning it).
  const pointsKey = JSON.stringify(points);

  useEffect(() => {
    const pts = JSON.parse(pointsKey);
    if (pts.length === 1) {
      map.setView(pts[0], 15);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [45, 45], maxZoom: 16 });
    }
  }, [map, pointsKey]);

  return null;
}

/**
 * markers: [{ lat, lng, kind: 'restaurant'|'home'|'courier'|'donation', label }]
 * Draws a dashed line through them when `route` is set.
 */
export default function MapView({ markers = [], route = false, height = 320, className = '' }) {
  const points = useMemo(
    () => markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)).map((m) => [m.lat, m.lng]),
    [markers]
  );

  if (!points.length) {
    return (
      <div
        className={`grid place-items-center rounded-xl border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-500 ${className}`}
        style={{ height }}
      >
        No location available yet
      </div>
    );
  }

  return (
    <div style={{ height }} className={className}>
      <MapContainer center={points[0]} zoom={14} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((m, i) => (
          <Marker key={`${m.kind}-${i}`} position={[m.lat, m.lng]} icon={ICONS[m.kind] || ICONS.home}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
        {route && points.length > 1 && (
          <Polyline positions={points} pathOptions={{ color: '#f06106', weight: 3, dashArray: '7 7' }} />
        )}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
